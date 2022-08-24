import axios from "axios";
import { createHash, randomBytes } from "crypto";
import express from "express";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import blake from "blakejs";
import { cache } from "../init.js";
import {
  getUserByUuid,
  runSql,
  getUserByTempSecret,
  getLastZeroed,
  getVerificationCount,
  setVerificationCountToZero,
  incrementVerificationCount,
} from "../utils/dbWrapper.js";
import { assertSignerIsAddress, sign, getDaysSinceNewYear } from "../utils/utils.js";
import { stateAbbreviations } from "../utils/constants.js";
import { ProofGenerator } from "../utils/ProofGenerator.js";

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
    daysBuffer = Buffer.concat([
      Buffer.from([0x01]),
      Buffer.alloc(1, daysSinceNewYear - 256),
    ]);
  } else {
    daysBuffer = Buffer.alloc(1, daysSinceNewYear);
  }

  return Buffer.concat([yearsBuffer, daysBuffer], 3);
}

/**
 * Convert state (e.g., "California") to a 2-byte representation of its abbreviation.
 */
function getStateAsBytes(state) {
  if (!state) {
    return Buffer.concat([Buffer.from("")], 2);
  }
  state = stateAbbreviations[state.toUpperCase()];
  return Buffer.concat([Buffer.from(state || "")], 2);
}

function handleVerificationCount() {
  if (getLastZeroed() < new Date().getMonth()) {
    setVerificationCountToZero();
  }
  incrementVerificationCount();
}

function hash(data) {
  // returns Buffer
  return createHash("sha256").update(data).digest();
}

function generateSecret(numBytes = 16) {
  return "0x" + randomBytes(numBytes).toString("hex");
}

/**
 * With the server's blockchain account, sign the given credentials.
 * @param creds Object containing a full string representation
 *                    of every credential.
 * @param secrets Object containing a 16-byte secret (represented as
 *                a Buffer) for every credential.
 * @returns Object containing one smallCreds signature for every
 *          credential and one bigCreds signature.
 */
async function generateSignatures(creds, secrets) {
  const signatures = {};
  const arrayifiedAddr = ethers.utils.arrayify(process.env.ADDRESS);

  // Get bigCreds signature
  const arrayifiedBigCredsSecret = ethers.utils.arrayify(secrets.bigCredsSecret);
  const bigCredsArr = [
    Buffer.concat([Buffer.from(creds.firstName || "")], 14),
    Buffer.concat([Buffer.from(creds.lastName || "")], 14),
    Buffer.concat([Buffer.from(creds.middleInitial || "")], 1),
    Buffer.concat([Buffer.from(creds.countryCode || "")], 3),
    Buffer.concat([Buffer.from(creds.streetAddr1 || "")], 16),
    Buffer.concat([Buffer.from(creds.streetAddr2 || "")], 12),
    Buffer.concat([Buffer.from(creds.city || "")], 16),
    getStateAsBytes(creds.subdivision), // 2 bytes
    Buffer.concat([Buffer.from(creds.postalCode || "")], 8),
    creds.completedAt ? getDateAsBytes(creds.completedAt) : threeZeroedBytes,
    creds.birthdate ? getDateAsBytes(creds.birthdate) : threeZeroedBytes,
  ];
  const arrayifiedBigCreds = ethers.utils.arrayify(Buffer.concat(bigCredsArr));
  const bigCredsMsg = Uint8Array.from([
    ...arrayifiedAddr,
    ...arrayifiedBigCredsSecret,
    ...arrayifiedBigCreds,
  ]);
  const bigCredsHash = blake.blake2s(bigCredsMsg);
  const bigCredsSignature = await sign(bigCredsHash);
  signatures.bigCredsSignature = bigCredsSignature;

  // Get a smallCreds signature for every credential
  for (const credentialName of Object.keys(creds)) {
    const secretKey = `${credentialName}Secret`;
    const arrayifiedSmallCredsSecret = ethers.utils.arrayify(secrets[secretKey]);
    const arrayifiedSmallCreds = ethers.utils.arrayify(
      Buffer.concat([Buffer.from(creds[credentialName] || "")], 28)
    );
    const credentialMsg = Uint8Array.from([
      ...arrayifiedAddr,
      ...arrayifiedSmallCreds,
      ...arrayifiedSmallCredsSecret,
    ]);
    const smallCredsHash = blake.blake2s(credentialMsg);
    const smallCredsSignature = await sign(smallCredsHash);
    const signatureKey = `${credentialName}Signature`;
    signatures[signatureKey] = smallCredsSignature;
  }

  return signatures;
}

async function getPersonaInquiry(inqId) {
  try {
    const inqResp = await axios.get(
      `https://withpersona.com/api/v1/inquiries/${inqId}`,
      personaHeaders
    );
    return inqResp.data;
  } catch (err) {
    return {};
  }
}

async function getPersonaVerification(verId) {
  try {
    const verResp = await axios.get(
      `https://withpersona.com/api/v1/verifications/${verId}`,
      personaHeaders
    );
    return verResp.data;
  } catch (err) {
    return {};
  }
}

async function redactPersonaInquiry(inqId) {
  try {
    const inqResp = await axios.delete(
      `https://withpersona.com/api/v1/inquiries/${inqId}`,
      personaHeaders
    );
    return inqResp.data;
  } catch (err) {
    return {};
  }
}

/**
 * End helper functions
 * ---------------------------------------------------
 * Persona verification
 */

// Create inquiry for user's gov id. Return inquiry id
async function startPersonaInquiry(req, res) {
  console.log(`${new Date().toISOString()} startPersonaInquiry: entered`);
  handleVerificationCount();
  if (getVerificationCount() >= 500) {
    return res
      .status(503)
      .json({ error: "We cannot service any more verifications this month." });
  }
  if (!req.query.address || !req.query.signature) {
    return res.status(400).json({ error: "Missing argument(s)" });
  }
  const address = req.query.address.toLowerCase();
  const userSignature = req.query.signature;
  const secretMessage = cache.get(address);
  if (!secretMessage) {
    console.log(
      `${new Date().toISOString()} startPersonaInquiry: secret message expired. Exiting.`
    );
    return res
      .status(400)
      .json({ error: "Temporary secret expired. Please try again." });
  }
  if (!assertSignerIsAddress(secretMessage, userSignature, address)) {
    console.log(
      `${new Date().toISOString()} startPersonaInquiry: signer != address. Exiting.`
    );
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
  const resp = await axios.post(
    "https://withpersona.com/api/v1/inquiries",
    payload,
    personaHeaders
  );
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
    console.log(
      `${new Date().toISOString()} acceptPersonaRedirect: personaInquiry.status != completed`
    );
    return res.status(400).json({ error: "inquiry status != completed" });
  }

  const verifications = inquiry["data"]["relationships"]["verifications"];
  const verId = verifications["data"][0]["id"];
  const verification = await getPersonaVerification(verId);
  const verAttrs = verification["data"]["attributes"];

  // Assert verifcation passed
  if (verAttrs["status"] != "passed") {
    console.log(
      `${new Date().toISOString()} acceptPersonaRedirect: personaVerification.status != passed`
    );
    return res.status(400).json({ error: "verification status !== passed" });
  }

  if (verAttrs?.countryCode != "US") {
    console.log(
      `${new Date().toISOString()} acceptPersonaRedirect: User is not from the US.`
    );
    return res.status(400).json({ error: "User is not from the US" });
  }

  const address = cache.take(inqId);
  const tempSecret = cache.take(address);
  const uuidConstituents =
    (verAttrs.nameFirst || "") +
    (verAttrs.nameMiddle || "") +
    (verAttrs.nameLast || "") +
    (verAttrs.addressStreet1 || "") +
    (verAttrs.addressStreet2 || "") +
    (verAttrs.addressCity || "") +
    (verAttrs.addressSubdivision || "") +
    (verAttrs.addressPostalCode || "") +
    (verAttrs.birthdate || "");
  const uuid = hash(Buffer.from(uuidConstituents));

  // Ensure user hasn't already registered
  // const user = await getUserByUuid(uuid);
  // if (user) {
  //   console.log(
  //     `${new Date().toISOString()} acceptPersonaRedirect: User has already registered. Exiting.`
  //   );
  //   return res.status(400).json({ error: "User has already registered" });
  // }

  const columns = "(tempSecret, uuid, inquiryId)";
  const params = [tempSecret, uuid, inqId];
  const valuesStr = "(" + params.map((item) => "?").join(", ") + ")";
  await runSql(`INSERT INTO Users ${columns} VALUES ${valuesStr}`, params);

  // TODO: (For Snapshot compatibility.) Call contract. Pseudocode:
  // if (verAttrs.countryCode == 'US') contract.setIsFromUS(address, true)

  console.log(
    `${new Date().toISOString()} acceptPersonaRedirect: Redirecting user to frontend`
  );
  return res.redirect("http://localhost:3002/verified");
}

/**
 * Allows user to retrieve their Persona verification info
 */
async function acceptFrontendRedirect(req, res) {
  console.log(`${new Date().toISOString()} acceptFrontendRedirect: Entered`);
  const tempSecret = req.query.secret;
  if (!tempSecret || tempSecret.includes(" ")) {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: Invalid secret. Secret: ${tempSecret}`
    );
    return res.status(400).json({ error: "Invalid secret." });
  }

  // Get user's info from db
  // Remove from return value the fields user doesn't need
  const user = await getUserByTempSecret(tempSecret);
  if (!user) {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: Could not find user. Exiting.`
    );
    return res.status(400).json({ error: "Could not find user" });
  }
  const uuid = user.uuid;
  user.tempSecret = undefined;
  user.uuid = undefined;
  const inquiry = await getPersonaInquiry(user.inquiryId);

  // Assert inquiry complete
  const inqStatus = inquiry.data.attributes.status;
  if (inqStatus !== "completed") {
    console.log(
      `${new Date().toISOString()} acceptPersonaRedirect: personaInquiry.status != completed`
    );
    return res.status(400).json({ error: "inquiry status != completed" });
  }

  const verifications = inquiry["data"]["relationships"]["verifications"];
  const verId = verifications["data"][0]["id"];
  const verification = await getPersonaVerification(verId);
  const verAttrs = verification["data"]["attributes"];

  // Get each credential
  const creds = {
    firstName: verAttrs.nameFirst || "",
    lastName: verAttrs.nameLast || "",
    middleInitial: verAttrs.nameMiddle || "",
    countryCode: verAttrs.countryCode || "",
    streetAddr1: verAttrs.addressStreet1 || "",
    streetAddr2: verAttrs.addressStreet2 || "",
    city: verAttrs.addressCity || "",
    subdivision: verAttrs.addressSubdivision || "",
    postalCode: verAttrs.addressPostalCode || "",
    completedAt: verAttrs.completedAt || "",
    birthdate: verAttrs.birthdate || "",
  };

  // Get one secret for bigCreds and one for every credential
  const secrets = {
    bigCredsSecret: generateSecret(),
  };
  for (const credentialName of Object.keys(creds)) {
    const secretKey = `${credentialName}Secret`;
    secrets[secretKey] = generateSecret();
  }

  const signatures = await generateSignatures(creds, secrets);

  const completeUser = {
    // credentials from Persona
    ...creds,
    // server-generated secrets
    ...secrets,
    // server-generated signatures
    ...signatures,
  };

  // Delete user's tempSecret from db
  // Keep uuid to prevent sybil attacks
  await runSql(`UPDATE Users SET tempSecret=? WHERE uuid=?`, ["", uuid]);
  await redactPersonaInquiry(user.inquiryId);

  // TODO: Move to secure enclave
  const proofs = await ProofGenerator.generateProofOfResidence(
    creds.countryCode,
    secrets.countryCodeSecret
  );

  return res.status(200).json({ user: completeUser, proofs: proofs });
}

export { startPersonaInquiry, acceptPersonaRedirect, acceptFrontendRedirect };
