import axios from "axios";
import { strict as assert } from "node:assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { UserVerifications, VerificationCollisionMetadata } from "../../init.js";
import { issue } from "holonym-wasm-issuer";
import { getDateAsInt, logWithTimestamp, hash } from "../../utils/utils.js";
import { newDummyUserCreds, countryCodeToPrime } from "../../utils/constants.js";
import { desiredOnfidoReports } from "../../constants/onfido.js";
// import { getPaymentStatus } from "../utils/paypal.js";

function validateCheck(check) {
  if (!check?.report_ids || check.report_ids.length == 0) {
    return {
      error: "No report_ids found in check",
      log: "onfido/credentials: No report_ids found. Exiting.",
    };
  }
  if (check.status !== "complete") {
    return {
      error: `Check failed. Status is '${check.status}'. Expected 'complete'.`,
      log: `onfido/credentials: Check failed. Status: ${check.status}. Exiting.`,
    };
  }
  if (check.result !== "clear") {
    return {
      error: `Check failed. Result is '${check.result}'. Expected 'clear'.`,
      log: `onfido/credentials: Check failed. Result: ${check.result}. Exiting.`,
    };
  }

  return { success: true };
}

function validateReports(reports) {
  if (reports.length == 0) {
    return {
      error: "Verification failed. No reports found",
      log: "onfido/credentials: No reports found. Exiting.",
    };
  }
  const reportNames = reports.map((report) => report.name);
  const missingReports = desiredOnfidoReports.filter(
    (report) => !reportNames.includes(report)
  );
  if (missingReports.length > 0) {
    return {
      error: `Verification failed. Missing reports: ${missingReports.join(", ")}`,
      log: `onfido/credentials: Missing reports: ${missingReports.join(
        ", "
      )}. Exiting.`,
    };
  }
  for (const report of reports) {
    // TODO: Add detailed checks here. Check report.sub_result, report.breakdown, and
    // ensure expected properties are in report.properties. Also change this function so
    // that it collects all the errors and returns them in an array (for both logs and
    // end user), instead of just returning the first error it finds.
    // See: https://documentation.onfido.com/#report-object
    if (report.status !== "complete") {
      return {
        error: `Verification failed. Report status is '${report.status}'. Expected 'complete'.`,
        log: `onfido/credentials: Verification failed. Report status: ${report.status}. Exiting.`,
      };
    }
    if (report.name === "document") {
      if (!countryCodeToPrime[report.properties.issuing_country]) {
        return {
          error: `Verification failed. Unsupported country ${report.properties.issuing_country}`,
          log: `onfido/credentials: Unsupported country ${report.properties.issuing_country}. Exiting.`,
        };
      }
    }
    // We don't need to check report.result because results are aggregated into check.result
    // (which we validate before this function is called)
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
    console.log(err);
    logWithTimestamp(
      "onfido/credentials: Could not save userVerificationsDoc. Exiting"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getOnfidoCheck(check_id) {
  try {
    const resp = await axios.get(`https://api.us.onfido.com/v3.6/checks/${check_id}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    });
    return resp.data;
  } catch (err) {
    console.error(`onfido/credentials: Error getting check with ID ${check_id}`, err);
    return {};
  }
}

async function getOnfidoReports(report_ids) {
  try {
    const reports = [];
    for (const report_id of report_ids) {
      const resp = await axios.get(
        `https://api.us.onfido.com/v3.6/reports/${report_id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
          },
        }
      );
      reports.push(resp.data);
    }
    return reports;
  } catch (err) {
    console.error(`onfido/credentials: Error getting check with ID ${check_id}`, err);
    return [];
  }
}

async function deleteOnfidoApplicant(applicant_id) {
  try {
    const resp = await axios.delete(
      `https://api.us.onfido.com/v3.6/applicants/${applicant_id}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.log(
      "An error occurred while attempting to delete Onfido applicant:",
      err.message
    );
    return {};
  }
}

/**
 * ENDPOINT
 *
 * Allows user to retrieve their Vouched verification info
 */
async function getCredentials(req, res) {
  try {
    if (process.env.ENVIRONMENT == "dev") {
      const creds = newDummyUserCreds;
      logWithTimestamp("onfido/credentials: Generating signature");

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
      logWithTimestamp("onfido/credentials: No check_id specified. Exiting.");
      return res.status(400).json({ error: "No check_id specified" });
    }

    const check = await getOnfidoCheck(check_id);
    const validationResultCheck = validateCheck(check);
    if (validationResultCheck.error) {
      logWithTimestamp(validationResultCheck.log);
      return res.status(400).json({ error: validationResultCheck.error });
    }

    const reports = await getOnfidoReports(check.report_ids);
    const validationResult = validateReports(reports);
    if (validationResult.error) {
      logWithTimestamp(validationResult.log);
      return res.status(400).json({ error: validationResult.error });
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

      logWithTimestamp(
        `onfido/credentials: User has already registered. Exiting. UUID == ${uuid}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. UUID: ${uuid}` });
    }

    // Store UUID for Sybil resistance
    logWithTimestamp(`onfido/credentials: Inserting user into database`);
    const dbResponse = await saveUserToDb(uuid, check_id);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(documentReport);

    logWithTimestamp("onfido/credentials: Generating signature");

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await deleteOnfidoApplicant(check.applicant_id);

    logWithTimestamp(`onfido/credentials: Returning user whose UUID is ${uuid}`);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials };
