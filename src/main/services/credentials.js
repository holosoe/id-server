import axios from "axios";
import { strict as assert } from "node:assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { mongoose, UserCredentials } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";

/**
 * Get user's encrypted credentials and symmetric key from document store.
 */
async function getCredentials(req, res) {
  logWithTimestamp("GET /credentials: Entered");

  const sigDigest = req?.query?.sigDigest;

  if (!sigDigest) {
    logWithTimestamp("GET /credentials: No sigDigest specified. Exiting.");
    return res.status(400).json({ error: "No sigDigest specified" });
  }
  if (typeof sigDigest != "string") {
    logWithTimestamp("GET /credentials: sigDigest isn't a string. Exiting.");
    return res.status(400).json({ error: "sigDigest isn't a string" });
  }

  try {
    const userCreds = await UserCredentials.findOne({ sigDigest: sigDigest }).exec();
    logWithTimestamp(
      `GET /credentials: Found user in database with sigDigest ${sigDigest}.`
    );
    return res.status(200).json(userCreds);
  } catch (err) {
    console.log(err);
    console.log("GET /credentials: Could not find user credentials. Exiting");
    return res.status(400).json({
      error:
        "An error occurred while trying to get credentials object from database. Please try again.",
    });
  }
}

/**
 * Set user's encrypted credentials and symmetric key.
 *
 * NOTE: When we add support for other credentials, the frontend will have to account
 * for it. The frontend will need to retrieve credentials, add new credentials alongside
 * old credentials, re-encrypt creds, and re-upload the encrypted credentials object.
 * If the frontend doesn't do this, the user could overwrite some of their credentials.
 */
async function postCredentials(req, res) {
  logWithTimestamp("POST /credentials: Entered");

  const apiKey = req?.body?.apiKey;
  const sigDigest = req?.body?.sigDigest;
  const encryptedCredentials = req?.body?.encryptedCredentials;
  const encryptedSymmetricKey = req?.body?.encryptedSymmetricKey;

  if (apiKey != process.env.THIS_API_KEY) {
    logWithTimestamp("POST /credentials: Incorrect apiKey. Exiting.");
    return res.status(400).json({ error: "Incorrect apiKey" });
  }

  // Require that args are present
  if (!sigDigest) {
    logWithTimestamp("POST /credentials: No sigDigest specified. Exiting.");
    return res.status(400).json({ error: "No sigDigest specified" });
  }
  if (!encryptedCredentials) {
    logWithTimestamp("POST /credentials: No encryptedCredentials specified. Exiting.");
    return res.status(400).json({ error: "No encryptedCredentials specified" });
  }
  if (!encryptedSymmetricKey) {
    logWithTimestamp(
      "POST /credentials: No encryptedSymmetricKey specified. Exiting."
    );
    return res.status(400).json({ error: "No encryptedSymmetricKey specified" });
  }

  // Require that args are correct types
  if (typeof sigDigest != "string") {
    logWithTimestamp("POST /credentials: sigDigest isn't a string. Exiting.");
    return res.status(400).json({ error: "sigDigest isn't a string" });
  }
  if (typeof encryptedCredentials != "string") {
    logWithTimestamp(
      "POST /credentials: encryptedCredentials isn't a string. Exiting."
    );
    return res.status(400).json({ error: "encryptedCredentials isn't a string" });
  }
  if (typeof encryptedSymmetricKey != "string") {
    logWithTimestamp(
      "POST /credentials: encryptedSymmetricKey isn't a string. Exiting."
    );
    return res.status(400).json({ error: "encryptedSymmetricKey isn't a string" });
  }

  let userCredentialsDoc;
  try {
    userCredentialsDoc = await UserCredentials.findOne({
      sigDigest: sigDigest,
    }).exec();
  } catch (err) {
    console.log(err);
    console.log(
      "POST /credentials: An error occurred while retrieving credenials. Exiting"
    );
    return res.status(400).json({
      error: "An error occurred while retrieving credentials. Please try again.",
    });
  }
  if (userCredentialsDoc) {
    userCredentialsDoc.encryptedCredentials = encryptedCredentials;
    userCredentialsDoc.encryptedSymmetricKey = encryptedSymmetricKey;
  } else {
    userCredentialsDoc = new UserCredentials({
      sigDigest,
      encryptedCredentials,
      encryptedSymmetricKey,
    });
  }
  try {
    logWithTimestamp(
      `POST /credentials: Saving user to database with sigDigest ${sigDigest}.`
    );
    await userCredentialsDoc.save();
  } catch (err) {
    console.log(err);
    console.log("POST /credentials: Could not save userCredentialsDoc. Exiting");
    return res.status(400).json({
      error:
        "An error occurred while trying to save object to database. Please try again.",
    });
  }

  return res.status(200).json({ success: true });
}

export { getCredentials, postCredentials };

// let userVerifications = {
//   vouched: {
//     uuid,
//     jobID,
//   },
//   phoneNumber: {
//     uuid,
//     jobID,
//   },
// };

// let userCredentials = {
//   encryptedCredentials,
//   encryptedSymmetricKey,
// };

// // schemas for unencrypted user data. All data that leaves the client should first be encrypted with Lit
// // let userLeaves = [
// //   {
// //     actualLeafHash,
// //     txHash,
// //     blockNumber,
// //     chainId,
// //   },
// // ];
// let userLeaves = {
//   encryptedLeaves,
//   encryptedSymmetricKey,
// };

// // let userProofs = [
// //   {
// //     address: "0x123...", // address that submitted the proof tx. We need to record this because the tx could be from an address other than the address the user uses to encrypt their credentials, and we should show the user which addresses are associated with which proofs. Otherwise, managing information leakage would be more difficult
// //     usResident: true,
// //   },
// //   {
// //     address: "0x456...",
// //     uniqueForActionId: 123456789,
// //   },
// //   {
// //     address: "0x123...",
// //     birthdateIsBefore: ["01-01-2000", "01-01-1990"],
// //   },
// // ];
// let userProofs = {
//   encryptedProofs,
//   encryptedSymmetricKey,
// };
