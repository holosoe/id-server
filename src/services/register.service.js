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

/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * @param creds Array of credentials to be hashed into Merkle tree
 */
async function generateMerkleTree(creds) {
  const leaves = creds.map((value) => hash(value));
  const tree = new MerkleTree(leaves, hash);
  return tree;
}

function generateSecret() {
  return crypto.randomBytes(16);
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

// Create inquiry for user's gov id. Return inquiry id
async function startPersonaInquiry(req, res) {
  if (!req.query.address || !req.query.signature) {
    return res.status(400).json({ error: "Missing argument(s)" });
  }
  const address = req.query.address.toLowerCase();
  const userSignature = req.query.signature;
  const secretMessage = cache.take(address);
  if (!assertSignerIsAddress(secretMessage, userSignature, address)) {
    return res.status(400).json({ error: "signer != address" });
  }
  // Ensure user hasn't already registered
  const user = await dbWrapper.getUserByAddress(address);
  if (user) {
    return res.status(400).json({ error: "User has already registered" });
  }

  const payload = {
    data: {
      attributes: {
        "inquiry-template-id": "itmpl_q7otFYTBCsjBXCcNfcvw42QU", // Government ID template
        "redirect-uri": `${process.env.THIS_URL}/register/`, // Persona redirects user to "<redirect-uri>/redirect"
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
  const inqId = req.query.inquiryId;
  const inquiry = await getPersonaInquiry(inqId);

  // Assert inquiry complete
  const inqStatus = inquiry.data.attributes.status;
  if (inqStatus !== "completed") {
    return res.status(400).json({ error: "inquiry status != completed" });
  }

  const userInfo = inquiry.included.attributes;

  const firstName = userInfo.nameFirst;
  const lastName = userInfo.nameLast;
  const { countryCode } = userInfo;
  const streetAddr1 = userInfo.addressStreet1;
  const streetAddr2 = userInfo.addressStreet2;
  const city = userInfo.addressCity;
  const addrSubdivision = userInfo.addressSubdivision;
  const postalCode = userInfo.addressPostalCode;
  const { birthdate } = userInfo;

  const creds = [
    countryCode,
    firstName,
    lastName,
    streetAddr1,
    streetAddr2,
    city,
    addrSubdivision,
    postalCode,
    birthdate,
  ];
  const tree = await generateMerkleTree(creds);
  const merkleRoot = tree.getRoot(); // as bytes
  const secret = generateSecret(); // as bytes
  const address = cache.take(inqId);

  // Insert info into db
  const userColumns = "address=?, secret=?, merkleRoot=?";
  const userParams = [address, secret, merkleRoot];
  await dbWrapper.runSql(`INSERT Users SET ${userColumns} WHERE address=?`, userParams);
  const leavesColumnsArr = [
    "merkleRoot=?",
    "firstName=?",
    "lastName=?",
    "countryCode=?",
    "streetAddress1=?",
    "streetAddress2=?",
    "city=?",
    "addressSubdivision=?",
    "postalCode=?",
    "birthdate=?",
  ];
  const leavesColumns = leavesColumnsArr.join(", ");
  const leavesParams = [
    merkleRoot,
    firstName,
    lastName,
    countryCode,
    streetAddr1,
    streetAddr2,
    city,
    addrSubdivision,
    postalCode,
    birthdate,
  ];
  await dbWrapper.runSql(`INSERT Users SET ${leavesColumns} WHERE address=?`, leavesParams);

  // userPubKey||hash(serverPubKey||credential||secret)

  // TODO: Store encrypted user data in db

  // TODO: return res.redirect('FRONTEND-URL')
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
