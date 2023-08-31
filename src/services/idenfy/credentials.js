import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import {
  Session,
  UserVerifications,
  VerificationCollisionMetadata,
} from "../../init.js";
import { issue } from "holonym-wasm-issuer";
import { createLeaf, getDateAsInt, hash } from "../../utils/utils.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import { newDummyUserCreds, countryCodeToPrime } from "../../utils/constants.js";
import { sessionStatusEnum } from "../../constants/misc.js";
import {
  getIdenfySessionStatus,
  getIdenfySessionVerificationData,
  deleteIdenfySession,
} from "../../utils/idenfy.js";
// import { getPaymentStatus } from "../utils/paypal.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /idenfy/credentials] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "idenfy",
  },
});

function validateSession(statusData, verificationData, scanRef) {
  // if (statusData.autoDocument !== "DOC_VALIDATED") {
  //   return {
  //     error: `Verification failed. Failed to auto validate document.`,
  //     log: `Verification failed. autoDocument: ${statusData.autoDocument}. Exiting.`,
  //   };
  // }
  // if (statusData.autoFace !== "FACE_MATCH") {
  //   return {
  //     error: `Verification failed. Failed to auto match face.`,
  //     log: `Verification failed. autoFace: ${statusData.autoFace}. Exiting.`,
  //   };
  // }
  if (statusData.manualDocument !== "DOC_VALIDATED") {
    return {
      error: `Verification failed. Failed to manually validate document. manualDocument is '${statusData.manualDocument}'. Expected 'DOC_VALIDATED'. scanRef: ${scanRef}`,
      log: {
        msg: "Verification failed. manualDocument !== 'DOC_VALIDATED'",
        data: {
          manualDocument: statusData.manualDocument,
        },
      },
    };
  }
  if (statusData.manualFace !== "FACE_MATCH") {
    return {
      error: `Verification failed. Failed to manually match face. manualFace is '${statusData.manualFace}'. Expected 'FACE_MATCH'. scanRef: ${scanRef}`,
      log: {
        msg: "Verification failed. manualFace !== 'FACE_MATCH'",
        data: {
          manualFace: statusData.manualFace,
        },
      },
    };
  }
  if (statusData.status !== "APPROVED") {
    return {
      error: `Verification failed. Status is ${statusData.status}. Expected 'APPROVED'. scanRef: ${scanRef}`,
      log: {
        msg: "Verification failed. status !== 'APPROVED'",
        data: {
          status: statusData.status,
        },
      },
    };
  }
  // NOTE: We are allowing address fields (other than country) to be empty for now
  const necessaryFields = ["docFirstName", "docLastName", "docDob", "docNationality"];
  for (const field of necessaryFields) {
    if (!(field in verificationData)) {
      return {
        error: `Verification data missing necessary field: ${field}. scanRef: ${scanRef}`,
        log: {
          msg: `Verification data missing necessary field: ${field}`,
        },
      };
    }
  }
  const country =
    verificationData.docNationality ?? verificationData.docIssuingCountry;
  const countryCode = countryCodeToPrime[country];
  if (!countryCode) {
    return {
      error: `Unsupported country: ${country}. scanRef: ${scanRef}`,
      log: {
        msg: "Unsupported country",
        data: { country },
      },
    };
  }
  return { success: true };
}

function extractCreds(verificationData) {
  // ["docFirstName", "docLastName", "docDob", "docNationality"];
  const country =
    verificationData.docNationality ?? verificationData.docIssuingCountry;
  const countryCode = countryCodeToPrime[country];
  const birthdate = verificationData.docDob ?? "";
  const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = verificationData.docFirstName ?? "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  // We keep middle name for backwards compatibility, though we don't parse it from firstName currently
  // const middleNameStr = person.middleName ? person.middleName : "";
  // const middleNameBuffer = middleNameStr
  //   ? Buffer.from(middleNameStr)
  //   : Buffer.alloc(1);
  const middleNameStr = "";
  const middleNameBuffer = Buffer.alloc(1);
  const lastNameStr = verificationData.docLastName ?? "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  // NOTE: We currently do not parse address fields from iDenfy response. We keep these
  // fields (even if they are empty) for backwards compatibility.
  const cityStr = "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  // const streetNumber = Number(address?.houseNumber ? address.houseNumber : 0);
  const streetNumber = 0;
  const streetNameStr = "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  // const streetUnit = address?.unit?.includes("apt ")
  //   ? Number(address?.unit?.replace("apt ", ""))
  //   : address?.unit != null && typeof Number(address?.unit) == "number"
  //   ? Number(address?.unit)
  //   : 0;
  const streetUnit = 0;
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  // const zipCode = Number(address?.postcode ? address.postcode : 0);
  const zipCode = 0;
  const addressArgs = [cityBuffer, subdivisionBuffer, zipCode, streetHash].map((x) =>
    ethers.BigNumber.from(x)
  );
  const addressHash = ethers.BigNumber.from(poseidon(addressArgs)).toString();
  // BIG NOTE: We are not including expiration date in issued credentials, but
  // we might in the future.
  // const expireDateSr = verificationData.docExpiry ?? "";
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
      // zipCode: address?.postcode ? address.postcode : 0,
      zipCode: 0,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: new Date().toISOString().split("T")[0],
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

async function saveCollisionMetadata(uuid, scanRef, verificationData) {
  try {
    const collisionMetadataDoc = new VerificationCollisionMetadata({
      uuid: uuid,
      timestamp: new Date(),
      scanRef: scanRef,
      uuidConstituents: {
        firstName: {
          populated: !!verificationData.docFirstName,
        },
        lastName: {
          populated: !!verificationData.docLastName,
        },
        // postcode: {
        //   populated: !!verificationData.addresses?.[0]?.postcode,
        // },
        address: {
          populated: !!verificationData.address,
        },
        dateOfBirth: {
          populated: !!verificationData.docDob,
        },
      },
    });

    await collisionMetadataDoc.save();
  } catch (err) {
    console.log("Error recording collision metadata", err);
  }
}

async function saveUserToDb(uuid, scanRef) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuid: uuid,
      sessionId: scanRef,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    endpointLogger.error(
      { error: err },
      "An error occurred while saving user to database"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function updateSessionStatus(scanRef, status) {
  const metaSession = await Session.findOne({ scanRef }).exec();
  metaSession.status = status;
  await metaSession.save();
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

      const response = issue(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      );
      response.metadata = newDummyUserCreds;

      return res.status(200).json(response);
    }

    const scanRef = req.query?.scanRef;
    if (!scanRef) {
      return res.status(400).json({ error: "No scanRef specified" });
    }
    const statusData = await getIdenfySessionStatus(scanRef);
    const verificationData = await getIdenfySessionVerificationData(scanRef);

    if (!statusData || !verificationData) {
      endpointLogger.error({ scanRef }, "Failed to retrieve iDenfy session.");
      return res.status(400).json({ error: "Failed to retrieve iDenfy session." });
    }

    const validationResult = validateSession(statusData, verificationData, scanRef);
    if (validationResult.error) {
      endpointLogger.error(validationResult.log.data, validationResult.log.msg);
      await updateSessionStatus(scanRef, sessionStatusEnum.VERIFICATION_FAILED);
      return res.status(400).json({ error: validationResult.error });
    }

    // Get UUID
    const uuidConstituents =
      (verificationData.docFirstName || "") +
      (verificationData.docLastName || "") +
      // (verificationData.addresses?.[0]?.postcode || "") +
      // iDenfy doesn't parse postal code from address, so we use the whole address for now
      (verificationData.address || "") +
      (verificationData.docDob || "");
    const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      await saveCollisionMetadata(uuid, scanRef, verificationData);

      endpointLogger.error({ uuid }, "User has already registered.");
      return res
        .status(400)
        .json({ error: `User has already registered. UUID: ${uuid}` });
    }

    // Store UUID for Sybil resistance
    const dbResponse = await saveUserToDb(uuid, scanRef);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(verificationData);

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await deleteIdenfySession(scanRef);

    endpointLogger.info({ uuid, scanRef }, "Issuing credentials");

    await updateSessionStatus(scanRef, sessionStatusEnum.ISSUED);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials };
