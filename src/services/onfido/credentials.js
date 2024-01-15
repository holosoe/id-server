import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import {
  Session,
  UserVerifications,
  VerificationCollisionMetadata,
} from "../../init.js";
import { issue } from "holonym-wasm-issuer";
import { getDateAsInt, hash } from "../../utils/utils.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import { newDummyUserCreds, countryCodeToPrime } from "../../utils/constants.js";
import { sessionStatusEnum } from "../../constants/misc.js";
import {
  getOnfidoCheck,
  getOnfidoReports,
  deleteOnfidoApplicant,
} from "../../utils/onfido.js";
import { desiredOnfidoReports } from "../../constants/onfido.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /onfido/credentials] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "onfido",
  },
});

function validateCheck(check) {
  if (!check?.report_ids || check.report_ids.length == 0) {
    return {
      error: "No report_ids found in check",
      log: {
        msg: "No report_ids found in check",
        data: {
          check_id: check.id,
        },
      },
    };
  }
  if (check.status !== "complete") {
    return {
      error: `Check failed. Status is '${check.status}'. Expected 'complete'.`,
      log: {
        msg: "Check failed. status !== 'complete'",
        data: {
          status: check.status,
        },
      },
    };
  }
  if (check.result !== "clear") {
    return {
      error: `Check failed. Result is '${check.result}'. Expected 'clear'.`,
      log: {
        msg: "Check failed. result !== 'clear'",
        data: {
          result: check.result,
        },
      },
    };
  }

  return { success: true };
}

function validateReports(reports) {
  const reportNames = reports.map((report) => report.name);
  const missingReports = desiredOnfidoReports.filter(
    (report) => !reportNames.includes(report)
  );
  if (missingReports.length > 0) {
    return {
      error: `Verification failed. Missing reports: ${missingReports.join(", ")}`,
      log: {
        msg: "Missing reports",
        data: {
          missingReports: missingReports,
        },
      },
    };
  }

  let verificationFailed = false;
  const failureReasons = [];
  for (const report of reports) {
    if (report.name === "document") {
      if (!countryCodeToPrime[report.properties.issuing_country]) {
        return {
          error: `Verification failed. Unsupported country ${report.properties.issuing_country}`,
          log: {
            msg: "Unsupported country",
            data: {
              country: report.properties.issuing_country,
            },
          },
        };
      }
    }
    if (report.name === "device_intelligence") {
      if (report?.properties?.device?.ip_reputation === "HIGH_RISK") {
        return {
          error: `Verification failed. IP address is high risk.`,
          log: {
            msg: "IP address is high risk",
            data: {
              ip: report?.properties?.ip?.address,
            },
          },
        };
      }
      if (
        typeof report?.properties?.device?.device_fingerprint_reuse === "number" &&
        report?.properties?.device?.device_fingerprint_reuse > 3
      ) {
        return {
          error: `Verification failed. device_fingerprint_reuse is ${report?.properties?.device?.device_fingerprint_reuse}.`,
          log: {
            msg: "device_fingerprint_reuse is greater than 5",
            data: {
              ip: report?.properties?.device?.device_fingerprint_reuse,
            },
          },
        };
      }
    }
    if (report.status !== "complete") {
      verificationFailed = true;
      failureReasons.push(`Report status is '${report.status}'. Expected 'complete'.`);
    }
    for (const majorKey of Object.keys(report.breakdown ?? {})) {
      if (report.breakdown[majorKey]?.result !== "clear") {
        for (const minorkey of Object.keys(
          report.breakdown[majorKey]?.breakdown ?? {}
        )) {
          const minorResult = report.breakdown[majorKey].breakdown[minorkey].result;
          if (minorResult !== null && minorResult !== "clear") {
            verificationFailed = true;
            failureReasons.push(
              `Result of ${minorkey} in ${majorKey} breakdown is '${minorResult}'. Expected 'clear'.`
            );
          }
        }
      }
    }
  }
  if (verificationFailed) {
    return {
      error: `Verification failed.`,
      reasons: failureReasons,
      log: {
        msg: "Verification failed",
        data: {
          reasons: failureReasons,
        },
      },
    };
  }
  return { success: true };
}

function extractCreds(documentReport) {
  const countryCode = countryCodeToPrime[documentReport.properties.issuing_country];
  const birthdate = documentReport.properties.date_of_birth ?? "";
  const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = documentReport.properties.first_name ?? "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  // Onfido doesn't seem to support middle names, but we keep this line in case they
  // do for some documents.
  const middleNameStr =
    documentReport.properties.middle_name ??
    documentReport.properties.barcode?.[0]?.middle_name ??
    "";
  const middleNameBuffer = middleNameStr
    ? Buffer.from(middleNameStr)
    : Buffer.alloc(1);
  const lastNameStr = documentReport.properties.last_name ?? "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  // BIG NOTE: We assume all address fields are empty since getting address info is
  // in beta for Onfido and we haven't activated the feature.
  // See: https://documentation.onfido.com/#document-with-address-information-beta
  const cityStr = documentReport.properties.city ?? "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = documentReport.properties.state ?? "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  const streetNumber = Number(documentReport.properties.houseNumber ?? 0);
  const streetNameStr = documentReport.properties.street ?? "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  const streetUnit = documentReport.properties.unit?.includes("apt ")
    ? Number(documentReport.properties.unit?.replace("apt ", ""))
    : documentReport.properties.unit != null &&
      typeof Number(documentReport.properties.unit) == "number"
    ? Number(documentReport.properties.unit)
    : 0;
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  const zipCode = Number(documentReport.properties.postcode ?? 0);
  const addressArgs = [cityBuffer, subdivisionBuffer, zipCode, streetHash].map((x) =>
    ethers.BigNumber.from(x)
  );
  const addressHash = ethers.BigNumber.from(poseidon(addressArgs)).toString();
  // BIG NOTE: We are not including expiration date in issued credentials, but
  // we might in the future.
  // const expireDateSr = session.verification.document?.validUntil ?? "";
  const expireDateSr = "";
  const expireDateNum = expireDateSr ? getDateAsInt(expireDateSr) : 0;
  const nameDobAddrExpireArgs = [
    nameHash,
    birthdateNum,
    addressHash,
    expireDateNum,
  ].map((x) => ethers.BigNumber.from(x).toString());
  const nameDobAddrExpire = ethers.BigNumber.from(
    poseidon(nameDobAddrExpireArgs)
  ).toString();
  return {
    rawCreds: {
      countryCode: countryCode,
      firstName: firstNameStr,
      middleName: middleNameStr,
      lastName: lastNameStr,
      city: cityStr,
      subdivision: subdivisionStr,
      zipCode: documentReport.properties.postcode ?? 0,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: documentReport.properties.created_at
        ? documentReport.properties.created_at.split("T")[0]
        : "",
      birthdate: birthdate,
      expirationDate: expireDateSr,
    },
    derivedCreds: {
      nameDobCitySubdivisionZipStreetExpireHash: {
        value: nameDobAddrExpire,
        derivationFunction: "poseidon",
        inputFields: [
          "derivedCreds.nameHash.value",
          "rawCreds.birthdate",
          "derivedCreds.addressHash.value",
          "rawCreds.expirationDate",
        ],
      },
      streetHash: {
        value: streetHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.streetNumber",
          "rawCreds.streetName",
          "rawCreds.streetUnit",
        ],
      },
      addressHash: {
        value: addressHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.city",
          "rawCreds.subdivision",
          "rawCreds.zipCode",
          "derivedCreds.streetHash.value",
        ],
      },
      nameHash: {
        value: nameHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.firstName",
          "rawCreds.middleName",
          "rawCreds.lastName",
        ],
      },
    },
    fieldsInLeaf: [
      "issuer",
      "secret",
      "rawCreds.countryCode",
      "derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value",
      "rawCreds.completedAt",
      "scope",
    ],
  };
}

async function saveCollisionMetadata(uuid, check_id, documentReport) {
  try {
    const collisionMetadataDoc = new VerificationCollisionMetadata({
      uuid: uuid,
      timestamp: new Date(),
      check_id: check_id,
      uuidConstituents: {
        firstName: {
          populated: !!documentReport.properties.first_name,
        },
        lastName: {
          populated: !!documentReport.properties.last_name,
        },
        postcode: {
          populated: false,
        },
        dateOfBirth: {
          populated: !!documentReport.properties.date_of_birth,
        },
      },
    });

    await collisionMetadataDoc.save();
  } catch (err) {
    console.log("Error recording collision metadata", err);
  }
}

async function saveUserToDb(uuid, check_id) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuid: uuid,
      sessionId: check_id,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    endpointLogger.error(
      { error: err },
      "An error occurred while saving user verification to database"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getSessionStatus(check_id) {
  const metaSession = await Session.findOne({ check_id }).exec();

  if (!metaSession) {
    throw new Error("Session not found");
  }

  return metaSession.status;
}

async function updateSessionStatus(check_id, status) {
  try {
    // TODO: Once pay-first frontend is pushed, remove the try-catch. We want
    // this endpoint to fail if we can't update the session.
    const metaSession = await Session.findOne({ check_id }).exec();
    metaSession.status = status;
    await metaSession.save();
  } catch (err) {
    console.log("onfido/credentials: Error updating session status", err);
  }
}

/**
 * ENDPOINT
 *
 * Allows user to retrieve their signed verification info
 */
async function getCredentials(req, res) {
  try {
    if (process.env.ENVIRONMENT == "dev") {
      const creds = newDummyUserCreds;

      const response = issue(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      );
      response.metadata = newDummyUserCreds;

      return res.status(200).json(response);
    }

    const check_id = req.query.check_id;
    if (!check_id) {
      return res.status(400).json({ error: "No check_id specified" });
    }

    const metaSessionStatus = await getSessionStatus(check_id);
    if (metaSessionStatus !== sessionStatusEnum.IN_PROGRESS) {
      return res.status(400).json({ error: "Session is not in progress" });
    }

    const check = await getOnfidoCheck(check_id);
    const validationResultCheck = validateCheck(check);
    if (validationResultCheck.error) {
      endpointLogger.error(
        validationResultCheck.log.data,
        validationResultCheck.log.msg
      );
      return res.status(400).json({ error: validationResultCheck.error });
    }

    const reports = await getOnfidoReports(check.report_ids);
    if (!reports || reports.length == 0) {
      endpointLogger.error("No reports found");
      return res.status(400).json({ error: "No reports found" });
    }
    const validationResult = validateReports(reports);
    if (validationResult.error) {
      endpointLogger.error(validationResult.log.data, validationResult.log.msg);
      await updateSessionStatus(check_id, sessionStatusEnum.VERIFICATION_FAILED);
      return res
        .status(400)
        .json({ error: validationResult.error, reasons: validationResult.reasons });
    }

    const documentReport = reports.find((report) => report.name == "document");
    // Get UUID
    const uuidConstituents =
      (documentReport.properties.first_name || "") +
      (documentReport.properties.last_name || "") +
      // Getting address info is in beta for Onfido, so we don't include it yet.
      // See: https://documentation.onfido.com/#document-with-address-information-beta
      // (documentReport.properties.addresses?.[0]?.postcode || "") +
      (documentReport.properties.date_of_birth || "");
    const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      await saveCollisionMetadata(uuid, check_id, documentReport);

      endpointLogger.error({ uuid }, "User has already registered");
      await updateSessionStatus(check_id, sessionStatusEnum.VERIFICATION_FAILED);
      return res
        .status(400)
        .json({ error: `User has already registered. User ID: ${user._id}` });
    }

    // Store UUID for Sybil resistance
    const dbResponse = await saveUserToDb(uuid, check_id);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(documentReport);

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await deleteOnfidoApplicant(check.applicant_id);

    endpointLogger.info({ uuid, check_id }, "Issuing credentials");

    await updateSessionStatus(check_id, sessionStatusEnum.ISSUED);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials };
