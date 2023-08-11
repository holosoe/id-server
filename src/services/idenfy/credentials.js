import axios from "axios";
import { strict as assert } from "node:assert";
import { createHmac } from "crypto";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { UserVerifications, VerificationCollisionMetadata } from "../../init.js";
import { issue } from "holonym-wasm-issuer";
import {
  sign,
  createLeaf,
  getDateAsInt,
  logWithTimestamp,
  hash,
  generateSecret,
} from "../../utils/utils.js";
import { newDummyUserCreds, countryCodeToPrime } from "../../utils/constants.js";
// import { getPaymentStatus } from "../utils/paypal.js";

const idenfyApiKey = process.env.IDENFY_API_KEY;
const idenfyApiKeySecret = process.env.IDENFY_API_KEY_SECRET;

function validateSession(statusData, verificationData, scanRef) {
  if (!statusData || !verificationData) {
    return {
      error: "Failed to retrieve iDenfy session.",
      log: `idenfy/credentials: Failed to retrieve iDenfy session ${scanRef}. Exiting.`,
    };
  }
  // if (statusData.autoDocument !== "DOC_VALIDATED") {
  //   return {
  //     error: `Verification failed. Failed to auto validate document.`,
  //     log: `idenfy/credentials: Verification failed. autoDocument: ${statusData.autoDocument}. Exiting.`,
  //   };
  // }
  // if (statusData.autoFace !== "FACE_MATCH") {
  //   return {
  //     error: `Verification failed. Failed to auto match face.`,
  //     log: `idenfy/credentials: Verification failed. autoFace: ${statusData.autoFace}. Exiting.`,
  //   };
  // }
  if (statusData.manualDocument !== "DOC_VALIDATED") {
    return {
      error: `Verification failed. Failed to manually validate document. manualDocument is '${statusData.manualDocument}'. Expected 'DOC_VALIDATED'. scanRef: ${scanRef}`,
      log: `idenfy/credentials: Verification failed. manualDocument: ${statusData.manualDocument}. Exiting.`,
    };
  }
  if (statusData.manualFace !== "FACE_MATCH") {
    return {
      error: `Verification failed. Failed to manually match face. manualFace is '${statusData.manualFace}'. Expected 'FACE_MATCH'. scanRef: ${scanRef}`,
      log: `idenfy/credentials: Verification failed. manualFace: ${statusData.manualFace}. Exiting.`,
    };
  }
  if (statusData.status !== "APPROVED") {
    return {
      error: `Verification failed. Status is ${statusData.status}. Expected 'APPROVED'. scanRef: ${scanRef}`,
      log: `idenfy/credentials: Verification failed. Status is ${statusData.status}. Expected 'APPROVED'.`,
    };
  }
  // NOTE: We are allowing address fields (other than country) to be empty for now
  const necessaryFields = ["docFirstName", "docLastName", "docDob", "docNationality"];
  for (const field of necessaryFields) {
    if (!(field in verificationData)) {
      return {
        error: `Verification data missing necessary field: ${field}. scanRef: ${scanRef}`,
        log: `idenfy/credentials: Verification data missing necessary field: ${field}. Exiting.`,
      };
    }
  }
  return { success: true };
}

function extractCreds(verificationData) {
  // ["docFirstName", "docLastName", "docDob", "docNationality"];
  const countryCode = countryCodeToPrime[verificationData.docNationality];
  assert.ok(countryCode, "Unsupported country");
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
    console.log(err);
    logWithTimestamp(
      "idenfy/credentials: Could not save userVerificationsDoc. Exiting"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getIdenfySessionStatus(scanRef) {
  try {
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/status",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${idenfyApiKey}:${idenfyApiKeySecret}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      `Error getting iDenfy session status with scanRef ${scanRef}`,
      err.message
    );
  }
}

async function getIdenfySessionVerificationData(scanRef) {
  try {
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/data",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${idenfyApiKey}:${idenfyApiKeySecret}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      `Error getting iDenfy session data with scanRef ${scanRef}`,
      err.message
    );
  }
}

async function deleteIdenfySession(scanRef) {
  try {
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/delete",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${idenfyApiKey}:${idenfyApiKeySecret}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.log("idenfy/credentials: encountered error deleting session:", err);
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
      logWithTimestamp("idenfy/credentials: Generating signature");

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
      logWithTimestamp("idenfy/credentials: No scanRef specified. Exiting.");
      return res.status(400).json({ error: "No scanRef specified" });
    }
    const statusData = await getIdenfySessionStatus(scanRef);
    const verificationData = await getIdenfySessionVerificationData(scanRef);

    const validationResult = validateSession(statusData, verificationData, scanRef);
    if (validationResult.error) {
      logWithTimestamp(validationResult.log);
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

      logWithTimestamp(
        `idenfy/credentials: User has already registered. Exiting. UUID == ${uuid}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. UUID: ${uuid}` });
    }

    // Store UUID for Sybil resistance
    logWithTimestamp(`idenfy/credentials: Inserting user into database`);
    const dbResponse = await saveUserToDb(uuid, scanRef);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(verificationData);

    logWithTimestamp("idenfy/credentials: Generating signature");

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await deleteIdenfySession(scanRef);

    logWithTimestamp(`idenfy/credentials: Returning user whose UUID is ${uuid}`);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials };
