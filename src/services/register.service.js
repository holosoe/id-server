import axios from "axios";
import { createHash, randomBytes } from "crypto";
// import { MerkleTree } from "merkletreejs";
import express from "express";
import { cache } from "../init.js";
import { getUserByUuid, runSql, getUserByTempSecret } from "../utils/dbWrapper.js";
import { assertSignerIsAddress, sign, getDaysSinceNewYear } from "../utils/utils.js";
import { stateAbbreviations } from "../utils/constants.js";

const personaHeaders = {
  headers: {
    Authorization: `Bearer ${process.env.PERSONA_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Persona-Version": "2021-05-14",
    "Key-Inflection": "camel", // get response in camelCase
  },
};

const threeZeroedBytes = Buffer.concat([Buffer.from("")], 3);

/**
 * Convert date string to 3 bytes with the following structure:
 * byte 1: number of years since 1900
 * bytes 2-3: number of days since beginning of the year
 * @param {string} date Must be of form yyyy-mm-dd
 */
function getDateAsBytes(date) {
  const [year, month, day] = date.split("-");
  const yearsSince1900 = parseInt(year) - 1900;
  const daysSinceNewYear = getDaysSinceNewYear(parseInt(month), parseInt(day));

  // Convert yearsSince1900 and daysSinceNewYear to bytes
  const yearsBuffer = Buffer.alloc(1, yearsSince1900);
  let daysBuffer;
  if (daysSinceNewYear > 255) {
    daysBuffer = Buffer.concat([Buffer.from([0x01]), Buffer.alloc(1, daysSinceNewYear - 256)]);
  } else {
    daysBuffer = Buffer.alloc(1, daysSinceNewYear);
  }

  return Buffer.concat([yearsBuffer, daysBuffer], 3);
}

function getStateAsBytes(state) {
  if (!state) {
    return Buffer.concat([Buffer.from("")], 2);
  }
  state = stateAbbreviations[state.toUpperCase()];
  return Buffer.concat([Buffer.from(state || "")], 2);
}

/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return createHash("sha256").update(data).digest();
}

function generateSecret(numBytes = 16) {
  return randomBytes(numBytes); // TODO: Generate random bytes in a frontend-friendly way. Use a string or typed integer array
}

/**
 * Persona verification
 *
 * Steps:
 * 1. Create Persona inquiry. (Call startPersonaInquiry())
 * 2. Redirect user to the created inquiry. (Accomplished by startPersonaInquiry())
 * 3. User is redirected back to whatever URL we provide. (Should be redirected to acceptPersonaRedirect())
 * 4. User data is collected, encrypted, and stored in db. (Accomplished in acceptPersonaRedirect())
 */

async function getPersonaInquiry(inqId) {
  const inqResp = await axios.get(`https://withpersona.com/api/v1/inquiries/${inqId}`, personaHeaders);
  return inqResp.data;
}

async function getPersonaVerification(verId) {
  const verResp = await axios.get(`https://withpersona.com/api/v1/verifications/${verId}`, personaHeaders);
  return verResp.data;
}

// Create inquiry for user's gov id. Return inquiry id
async function startPersonaInquiry(req, res) {
  console.log(`${new Date().toISOString()} startPersonaInquiry: entered`);
  if (!req.query.address || !req.query.signature) {
    return res.status(400).json({ error: "Missing argument(s)" });
  }
  const address = req.query.address.toLowerCase();
  const userSignature = req.query.signature;
  const secretMessage = cache.get(address);
  if (!secretMessage) {
    console.log(`${new Date().toISOString()} startPersonaInquiry: secret message expired. Exiting.`);
    return res.status(400).json({ error: "Temporary secret expired. Please try again." });
  }
  if (!assertSignerIsAddress(secretMessage, userSignature, address)) {
    console.log(`${new Date().toISOString()} startPersonaInquiry: signer != address. Exiting.`);
    return res.status(400).json({ error: "signer != address" });
  }

  const payload = {
    data: {
      attributes: {
        "inquiry-template-id": "itmpl_q7otFYTBCsjBXCcNfcvw42QU", // Government ID template
        "redirect-uri": `${process.env.THIS_URL}/register/redirect/`, // Persona redirects user to "<redirect-uri>/redirect"
      },
    },
  };
  const resp = await axios.post("https://withpersona.com/api/v1/inquiries", payload, personaHeaders);
  const inqId = resp.data.data.id;
  cache.set(inqId, address);
  return res.redirect(`https://withpersona.com/verify?inquiry-id=${inqId}`);
}

/**
 * After completing Persona inquiry, user should be redirected to this function.
 * This function gets the newly created data from Persona.
 */
async function acceptPersonaRedirect(req, res) {
  console.log(`${new Date().toISOString()} acceptPersonaRedirect: entered`);
  if (!req.query["inquiry-id"]) {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: entered`);
    return res.status(400).json({ error: "No inquiry-id found." });
  }
  const inqId = req.query["inquiry-id"];
  const inquiry = await getPersonaInquiry(inqId);

  // Assert inquiry complete
  const inqStatus = inquiry.data.attributes.status;
  if (inqStatus !== "completed") {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: personaInquiry.status != completed`);
    return res.status(400).json({ error: "inquiry status != completed" });
  }

  const verifications = inquiry["data"]["relationships"]["verifications"];
  const verId = verifications["data"][0]["id"];
  const verification = await getPersonaVerification(verId);
  const verAttrs = verification["data"]["attributes"];

  // Assert verifcation passed
  if (verAttrs["status"] != "passed") {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: personaVerification.status != passed`);
    return res.status(400).json({ error: "verification status !== passed" });
  }

  if (verAttrs?.countryCode != "US") {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: User is not from the US.`);
    return res.status(400).json({ error: "User is not from the US" });
  }
  // TODO: UNCOMMENT this if statement. Figure out how to handle scenario in which user doesn't have a driver's license
  // if (!verAttrs.driverLicenseNumber) {
  //   console.log(`${new Date().toISOString()} acceptPersonaRedirect: Driver license number not found.`);
  //   return res.status(400).json({ error: "Could not give user a unique identifier" });
  // }

  // Get each cred as bytestream of certain length
  // const firstName = Buffer.concat([Buffer.from(verAttrs.nameFirst || "")], 14);
  // const lastName = Buffer.concat([Buffer.from(verAttrs.nameLast || "")], 14);
  // const middleInitial = Buffer.concat([Buffer.from(verAttrs.nameMiddle || "")], 1);
  // const countryCode = Buffer.concat([Buffer.from(verAttrs.countryCode || "")], 3);
  // const streetAddr1 = Buffer.concat([Buffer.from(verAttrs.addressStreet1 || "")], 16);
  // const streetAddr2 = Buffer.concat([Buffer.from(verAttrs.addressStreet2 || "")], 12);
  // const city = Buffer.concat([Buffer.from(verAttrs.addressCity || "")], 16);
  // const subdivision = getStateAsBytes(verAttrs.addressSubdivision); // 2 bytes
  // const postalCode = Buffer.concat([Buffer.from(verAttrs.addressPostalCode || "")], 8);
  // const completedAt = verAttrs.completedAt ? getDateAsBytes(verAttrs.completedAt) : threeZeroedBytes;
  // const birthdate = verAttrs.birthdate ? getDateAsBytes(verAttrs.birthdate) : threeZeroedBytes;

  // Get each cred. Serialize in frontend
  const firstName = verAttrs.nameFirst || "";
  const lastName = verAttrs.nameLast || "";
  const middleInitial = verAttrs.nameMiddle || "";
  const countryCode = verAttrs.countryCode || "";
  const streetAddr1 = verAttrs.addressStreet1 || "";
  const streetAddr2 = verAttrs.addressStreet2 || "";
  const city = verAttrs.addressCity || "";
  const subdivision = verAttrs.addressSubdivision || "";
  const postalCode = verAttrs.addressPostalCode || "";
  const completedAt = verAttrs.completedAt || "";
  const birthdate = verAttrs.birthdate || "";

  const credsArr = [
    firstName,
    lastName,
    middleInitial,
    countryCode,
    streetAddr1,
    streetAddr2,
    city,
    subdivision,
    postalCode,
    completedAt,
    birthdate,
  ];
  // const creds = Buffer.concat(credsArr);
  const secret = generateSecret().toString();
  const address = cache.take(inqId);
  const tempSecret = cache.take(address);
  const uuid = hash(Buffer.from(verAttrs.driverLicenseNumber || address)); // TODO: Figure out how to handle scenario in which user doesn't have driver's license or dl number isn't returned

  // Ensure user hasn't already registered
  const user = await getUserByUuid(uuid);
  if (user) {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: User has already registered. Exiting.`);
    return res.status(400).json({ error: "User has already registered" });
  }

  const credsColumns = [
    "firstName",
    "lastName",
    "middleInitial",
    "countryCode",
    "streetAddress1",
    "streetAddress2",
    "city",
    "subdivision",
    "postalCode",
    "completedAt",
    "birthdate",
  ].join(", ");
  const columns = "(" + `tempSecret, uuid, address, secret, ${credsColumns}` + ")";
  const params = [tempSecret, uuid, address, secret, ...credsArr];
  const valuesStr = "(" + params.map((item) => "?").join(", ") + ")";
  await runSql(`INSERT INTO Users ${columns} VALUES ${valuesStr}`, params);

  // TODO: Call contract. Pseudocode:
  // if (verAttrs.countryCode == 'US') contract.setIsFromUS(address, true)

  console.log(`${new Date().toISOString()} acceptPersonaRedirect: Redirecting user to frontend`);
  return res.redirect("http://localhost:3002/verified");
}

/**
 * Allows user to retrieve their Persona verification info
 */
async function acceptFrontendRedirect(req, res) {
  console.log(`${new Date().toISOString()} acceptFrontendRedirect: Entered`);
  const tempSecret = req.query.secret;
  if (!tempSecret || tempSecret.includes(" ")) {
    console.log(`${new Date().toISOString()} acceptFrontendRedirect: Invalid secret. Secret: ${tempSecret}`);
    return res.status(400).json({ error: "Invalid secret." });
  }

  // Get user's info from db
  // Remove from return value the fields user doesn't need
  const user = await getUserByTempSecret(tempSecret);
  if (!user) {
    console.log(`${new Date().toISOString()} acceptFrontendRedirect: Could not find user. Exiting.`);
    return res.status(400).json({ error: "Could not find user" });
  }
  const uuid = user.uuid;
  user.tempSecret = undefined;
  user.uuid = undefined;
  user.address = undefined;

  // TODO: Serialize this in a way that the frontend can also serialize it
  // sign(server_address∣∣secret∣∣credentials​)
  const credentials =
    user.firstName +
    user.lastName +
    user.middleInitial +
    user.countryCode +
    user.streetAddr1 +
    user.streetAddr2 +
    user.city +
    user.subdivision +
    user.postalCode +
    user.completedAt +
    user.birthdate;
  const msg = process.env.ADDRESS + user.secret + credentials;
  const serverSignature = sign(msg);
  user.serverSignature = serverSignature;

  // Delete user's creds+tempSecret from db
  // Keep uuid & address to prevent sybil attacks
  const credsColsArr = [
    "firstName",
    "lastName",
    "middleInitial",
    "countryCode",
    "streetAddress1",
    "streetAddress2",
    "city",
    "subdivision",
    "postalCode",
    "completedAt",
    "birthdate",
  ];
  const credsColumns = credsColsArr.join("=?, ") + "=?, ";
  const columns = credsColumns + "tempSecret=?";
  const params = [...credsColsArr.map((item) => ""), "", uuid];
  await runSql(`UPDATE Users SET ${columns} WHERE uuid=?`, params);

  return res.status(200).json(user);
}

export { startPersonaInquiry, acceptPersonaRedirect, acceptFrontendRedirect };
