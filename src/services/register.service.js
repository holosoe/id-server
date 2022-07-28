const axios = require("axios");
const crypto = require("crypto");
const { MerkleTree } = require("merkletreejs");
const express = require("express");
const { cache } = require("../init");
const dbWrapper = require("../utils/dbWrapper");
const { assertSignerIsAddress, sign } = require("../utils/utils");

const personaHeaders = {
  headers: {
    Authorization: `Bearer ${process.env.PERSONA_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Persona-Version": "2021-05-14",
    "Key-Inflection": "camel", // get response in camelCase
  },
};

const fourZeroedBytes = Buffer.concat([Buffer.from("")], 4);

/**
 * Convert date string to first 4 bytes of UNIX timestamp
 * @param {string} date
 */
function getDateAsBytes(date) {
  return Buffer.concat([Buffer.from(new Date(date).getTime().toString())], 4);
}

/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return crypto.createHash("sha256").update(data).digest();
}

function generateSecret(numBytes = 16) {
  return crypto.randomBytes(numBytes);
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
  const secretMessage = cache.take(address);
  if (!assertSignerIsAddress(secretMessage, userSignature, address)) {
    console.log(`${new Date().toISOString()} startPersonaInquiry: signer != address. Exiting.`);
    return res.status(400).json({ error: "signer != address" });
  }
  // Ensure user hasn't already registered
  const user = await dbWrapper.getUserByAddress(address);
  if (user) {
    console.log(`${new Date().toISOString()} startPersonaInquiry: User has already registered. Exiting.`);
    return res.status(400).json({ error: "User has already registered" });
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
  if (!verAttrs.driverLicenseNumber) {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: Driver license number not found.`);
    return res.status(400).json({ error: "Could not give user a unique identifier" });
  }

  // const userInfo = inquiry.included.attributes;

  // Get each cred as bytestream of certain length
  const firstName = Buffer.concat([Buffer.from(verAttrs.nameFirst || "")], 14);
  const lastName = Buffer.concat([Buffer.from(verAttrs.nameLast || "")], 14);
  const middleInitial = Buffer.concat([Buffer.from(verAttrs.nameMiddle || "")], 1);
  const countryCode = Buffer.concat([Buffer.from(verAttrs.countryCode || "")], 3);
  const streetAddr1 = Buffer.concat([Buffer.from(verAttrs.addressStreet1 || "")], 16);
  const streetAddr2 = Buffer.concat([Buffer.from(verAttrs.addressStreet2 || "")], 12);
  const city = Buffer.concat([Buffer.from(verAttrs.addressCity || "")], 16);
  const postalCode = Buffer.concat([Buffer.from(verAttrs.addressPostalCode || "")], 8);
  const completedAt = verAttrs.completedAt ? getDateAsBytes(verAttrs.completedAt) : fourZeroedBytes;
  const birthdate = verAttrs.birthdate ? getDateAsBytes(verAttrs.birthdate) : fourZeroedBytes; // yyyy-mm-dd

  const credsArr = [
    firstName,
    lastName,
    middleInitial,
    countryCode,
    streetAddr1,
    streetAddr2,
    city,
    postalCode,
    completedAt,
    birthdate,
  ];
  const creds = Buffer.concat(credsArr);
  const secrets = generateSecret(credsArr.length * 16);
  const address = cache.take(inqId);
  const uuid = hash(Buffer.from(verAttrs.driverLicenseNumber));

  // Ensure user hasn't already registered
  const user = await dbWrapper.getUserByUuid(uuid);
  if (user) {
    console.log(`${new Date().toISOString()} acceptPersonaRedirect: User has already registered. Exiting.`);
    return res.status(400).json({ error: "User has already registered" });
  }

  const columns = "uuid=?, address=?, creds=?, secrets=?";
  const params = [uuid, address, creds, secrets];
  await dbWrapper.runSql(`INSERT Users SET ${columns} WHERE address=?`, params);

  // TODO: Call contract. Pseudocode:
  // if (verAttrs.countryCode == 'US') contract.setIsFromUS(address, true)

  // userPubKey||hash(serverPubKey||credential||secret)

  console.log(`${new Date().toISOString()} acceptPersonaRedirect: Redirecting user to frontend`);
  return res.redirect("http://localhost:3002/verified");
}

/**
 * End Persona
 */

/**
 * Register a user.
 * Steps:
 * 1. Have user go through ID verification on Persona
 * 2. Ensure verification checks pass
 * 3. Get user's info from Persona (name, address, etc.)
 * 4. Generate Merkle tree with user's info as leaves
 * 5. Generate secret for the user
 * 6. Store the user's address, secret, Merkle root, and leaves (i.e., hashes of info) in db.
 * 7. Return encrypted Merkle root and server's signature of encrypted Merkle root
 */
// async function register(req, res) {
//   // const address = '0x0000000000000000000000000000000000000000' // For testing
//   const stateOfResidence = await getStateFromVerification({});
//   const firstName = "John";
//   const lastName = "Doe";

//   // Ensure user hasn't already registered
//   const user = await dbWrapper.getUserByAddress(address);
//   if (user) {
//     return res.status(400).json({ error: "User has already registered" });
//   }

//   const creds = [stateOfResidence, firstName, lastName];
//   const tree = await generateMerkleTree(creds);
//   const merkleRoot = tree.getRoot(); // as bytes
//   const secret = generateSecret(); // as bytes

//   // Insert info into db
//   const userColumns = "address=?, secret=?, merkleRoot=?";
//   const userParams = [address, secret, merkleRoot];
//   dbWrapper.runSql(`INSERT Users SET ${userColumns} WHERE address=?`, userParams);
//   const leavesColumns = "merkleRoot=?, firstName=?, lastName=?, state=?";
//   const leavesParams = [merkleRoot, firstName, lastName, stateOfResidence];
//   dbWrapper.runSql(`INSERT Users SET ${leavesColumns} WHERE address=?`, leavesParams);

//   // Return server's signature + encrypted root of user's Merkle tree.
//   // (This should be given to the user.)
//   const encryptedRoot = hash(Buffer.concat([merkleRoot, secret]));
//   const signature = sign(Buffer.concat([address, encryptedRoot]));
//   return res.status(200).json({ signature, enryptedRoot: encryptedRoot });
// }

module.exports = {
  startPersonaInquiry: startPersonaInquiry,
  acceptPersonaRedirect: acceptPersonaRedirect,
};
