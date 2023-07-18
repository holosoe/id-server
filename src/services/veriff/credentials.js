import axios from "axios";
import { strict as assert } from "node:assert";
import { createHmac } from "crypto";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { UserVerifications } from "../../init.js";
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

const veriffPublicKey = process.env.VERIFF_PUBLIC_API_KEY;
const veriffSecretKey = process.env.VERIFF_SECRET_API_KEY;

/**
 * Serialize the credentials into the 6 field elements they will be as the preimage to the leaf
 * @param {Object} creds Object containing a full string representation of every credential.
 * @returns 6 string representations of the preimage's 6 field elements, in order
 */
function serializeCreds(creds) {
  let countryBuffer = Buffer.alloc(2);
  countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

  return [
    creds.issuer,
    creds.secret,
    "0x" + countryBuffer.toString("hex"),
    creds.derivedCreds.nameDobCitySubdivisionZipStreetHash.value,
    getDateAsInt(creds.rawCreds.completedAt).toString(),
    creds.scope.toString(),
  ];
}

function validateSession(session, sessionId) {
  if (!session) {
    return {
      error: "Failed to retrieve Verrif session.",
      log: `veriff/credentials: Failed to retrieve Verrif session ${sessionId}. Exiting.`,
    };
  }
  if (session.status !== "success") {
    return {
      error: "Verification failed.",
      log: `veriff/credentials: Verification failed. Status: ${session.status}. Exiting.`,
    };
  }
  if (session.verification?.code !== 9001) {
    return {
      error: "Verification failed.",
      log: `veriff/credentials: Verification failed. Verification code: ${session.verification?.code}. Exiting.`,
    };
  }
  if (session.verification.status !== "approved") {
    return {
      error: "Verification failed.",
      log: `veriff/credentials: Verification status is ${session.verification.status}. Exiting.`,
    };
  }
  const necessaryPersonFields = ["firstName", "lastName", "dateOfBirth"];
  const person = session.verification.person;
  for (const field of necessaryPersonFields) {
    if (!(field in person)) {
      return {
        error: `Verification missing necessary field: ${field}.`,
        log: `veriff/credentials: Verification missing necessary field: ${field}. Exiting.`,
      };
    }
  }
  // NOTE: Veriff does not include addresses in test sessions
  // BIG NOTE: We are removing address temporarily since Veriff only supports
  // it for their enterprise clients.
  // const address = person.addresses?.[0]?.parsedAddress;
  // if (!address) {
  //   return {
  //     error: "Verification missing necessary field: address.",
  //     log: `veriff/credentials: Verification missing necessary field: address. Exiting.`,
  //   };
  // }
  // if (!("postcode" in address)) {
  //   return {
  //     error: "Verification missing necessary field: postcode.",
  //     log: `veriff/credentials: Verification missing necessary field: postcode. Exiting.`,
  //   };
  // }
  const doc = session.verification.document;
  if (!doc) {
    return {
      error: "Verification missing necessary field: document.",
      log: `veriff/credentials: Verification missing necessary field: document. Exiting.`,
    };
  }
  if (!("country" in doc)) {
    return {
      error: "Verification missing necessary field: country.",
      log: `veriff/credentials: Verification missing necessary field: country. Exiting.`,
    };
  }
  return { success: true };
}

function extractCreds(session) {
  const person = session.verification.person;
  const address = person.addresses?.[0]?.parsedAddress;
  const countryCode = countryCodeToPrime[session.verification.document.country];
  assert.ok(countryCode, "Unsupported country");
  const birthdate = person.dateOfBirth ? person.dateOfBirth : "";
  const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = person.firstName ? person.firstName : "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  // Veriff doesn't support middle names, but we keep it for backwards compatibility
  // const middleNameStr = person.middleName ? person.middleName : "";
  // const middleNameBuffer = middleNameStr
  //   ? Buffer.from(middleNameStr)
  //   : Buffer.alloc(1);
  const middleNameStr = "";
  const middleNameBuffer = Buffer.alloc(1);
  const lastNameStr = person.lastName ? person.lastName : "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  // BIG NOTE: We assume all address fields are empty since Veriff only supports
  // parsedAddress field for their enterprise clients. If you are reading this
  // and we have become an enterprise client with the parsedAddress option, this
  // note is obsolete.
  const cityStr = address?.city ? address.city : "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = address?.state ? address.state : "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  const streetNumber = Number(address?.houseNumber ? address.houseNumber : 0);
  const streetNameStr = address?.street ? address.street : "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  const streetUnit = address?.unit?.includes("apt ")
    ? Number(address?.unit?.replace("apt ", ""))
    : address?.unit != null && typeof Number(address?.unit) == "number"
    ? Number(address?.unit)
    : 0;
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  const zipCode = Number(address?.postcode ? address.postcode : 0);
  const addressArgs = [cityBuffer, subdivisionBuffer, zipCode, streetHash].map((x) =>
    ethers.BigNumber.from(x)
  );
  const addressHash = ethers.BigNumber.from(poseidon(addressArgs)).toString();
  const expireDateSr = session.verification.document?.validUntil ?? "";
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
      zipCode: address?.postcode ? address.postcode : 0,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: session.verification.decisionTime
        ? session.verification.decisionTime.split("T")[0]
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

/**
 * With the server's blockchain account, sign the given credentials.
 * @param creds Object containing a full string representation of every credential.
 * @returns Object containing one smallCreds signature for every
 *          credential and one bigCreds signature.
 */
async function generateSignature(creds) {
  const serverAddress = process.env.ADDRESS;
  let countryBuffer = Buffer.alloc(2);
  countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

  const leafAsBigInt = await createLeaf(
    Buffer.from(serverAddress.replace("0x", ""), "hex"),
    Buffer.from(creds.secret.replace("0x", ""), "hex"),
    countryBuffer,
    creds.derivedCreds.nameDobCitySubdivisionZipStreetHash.value,
    getDateAsInt(creds.rawCreds.completedAt),
    creds.scope
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsBigInt));
  return await sign(leaf);
}

async function saveUserToDb(uuid, sessionId) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuid: uuid,
      sessionId: sessionId,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    console.log(err);
    logWithTimestamp(
      "veriff/credentials: Could not save userVerificationsDoc. Exiting"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getVeriffSessionDecision(sessionId) {
  try {
    const hmacSignature = createHmac("sha256", veriffSecretKey)
      .update(Buffer.from(sessionId, "utf8"))
      .digest("hex")
      .toLowerCase();
    const resp = await axios.get(
      `https://stationapi.veriff.com/v1/sessions/${sessionId}/decision`,
      {
        headers: {
          "X-AUTH-CLIENT": veriffPublicKey,
          "X-HMAC-SIGNATURE": hmacSignature,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log(resp.data);
    return resp.data;
  } catch (err) {
    console.error(`Error getting session with ID ${sessionId}`, err.message);
    return {};
  }
}

async function redactVeriffSession(sessionId) {
  try {
    const hmacSignature = crypto
      .createHmac("sha256", veriffSecretKey)
      .update(Buffer.from(sessionId, "utf8"))
      .digest("hex")
      .toLowerCase();
    const resp = await axios.delete(
      `https://stationapi.veriff.com/v1/sessions/${sessionId}`,
      {
        headers: {
          "X-AUTH-CLIENT": veriffPublicKey,
          "X-HMAC-SIGNATURE": hmacSignature,
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.log(err.message);
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
    logWithTimestamp("veriff/credentials: Entered");

    if (process.env.ENVIRONMENT == "dev") {
      const creds = newDummyUserCreds;
      logWithTimestamp("veriff/credentials: Generating signature");

      const response = issue(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      );
      response.metadata = newDummyUserCreds;

      return res.status(200).json(response);
    }

    if (!req?.query?.sessionId) {
      logWithTimestamp("veriff/credentials: No sessionId specified. Exiting.");
      return res.status(400).json({ error: "No sessionId specified" });
    }
    const session = await getVeriffSessionDecision(req.query.sessionId);

    const validationResult = validateSession(session, req.query.sessionId);
    if (validationResult.error) {
      logWithTimestamp(validationResult.log);
      return res.status(400).json({ error: validationResult.error });
    }

    // Get UUID
    const uuidConstituents =
      (session.verification.person.firstName || "") +
      (session.verification.person.lastName || "") +
      (session.verification.person.addresses?.[0].postcode || "") +
      (session.verification.person.dateOfBirth || "");
    const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      logWithTimestamp(
        `veriff/credentials: User has already registered. Exiting. UUID == ${uuid}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. UUID: ${uuid}` });
    }

    // Store UUID for Sybil resistance
    logWithTimestamp(`veriff/credentials: Inserting user into database`);
    const dbResponse = await saveUserToDb(uuid, req.query.sessionId);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(session);

    logWithTimestamp("veriff/credentials: Generating signature");

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await redactVeriffSession(req.query.sessionId);

    logWithTimestamp(`veriff/credentials: Returning user whose UUID is ${uuid}`);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials };
