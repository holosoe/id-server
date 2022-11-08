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

  const address = req?.body?.address;
  const signature = req?.body?.signature;
  const signedMessage = req?.body?.signedMessage;

  // Require that args are present
  if (!address) {
    logWithTimestamp("GET /credentials: No address specified. Exiting.");
    return res.status(400).json({ error: "No address specified" });
  }
  if (!signature) {
    logWithTimestamp("GET /credentials: No signature specified. Exiting.");
    return res.status(400).json({ error: "No signature specified" });
  }
  if (!signedMessage) {
    logWithTimestamp("GET /credentials: No signedMessage specified. Exiting.");
    return res.status(400).json({ error: "No signedMessage specified" });
  }

  // Require that args are correct types
  if (typeof address != "string") {
    logWithTimestamp("GET /credentials: address isn't a string. Exiting.");
    return res.status(400).json({ error: "address isn't a string" });
  }
  if (typeof signature != "string") {
    logWithTimestamp("GET /credentials: signature isn't a string. Exiting.");
    return res.status(400).json({ error: "signature isn't a string" });
  }
  if (typeof signedMessage != "string") {
    logWithTimestamp("GET /credentials: signedMessage isn't a string. Exiting.");
    return res.status(400).json({ error: "signedMessage isn't a string" });
  }

  // Signature check
  const signer = ethers.utils.verifyMessage(signedMessage, signature);
  if (signer.toLowerCase() != address.toLowerCase()) {
    logWithTimestamp("GET /credentials: signer != address. Exiting.");
    return res.status(400).json({ error: "signer != address" });
  }

  try {
    const userCreds = await UserCredentials.findOne({ address: address }).exec();
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

  // Required params:
  // - address: String,
  // - encryptedCredentials: String,
  // - encryptedSymmetricKey: String,
  // - signature (proving user owns address)
  // TODO: Write GET /nonce endpoint that returns nonce that user can sign. OR use Lit's AuthSig

  const address = req?.body?.address;
  const signature = req?.body?.signature;
  const encryptedCredentials = req?.body?.encryptedCredentials;
  const encryptedSymmetricKey = req?.body?.encryptedSymmetricKey;

  // Require that args are present
  if (!address) {
    logWithTimestamp("POST /credentials: No address specified. Exiting.");
    return res.status(400).json({ error: "No address specified" });
  }
  if (!signature) {
    logWithTimestamp("POST /credentials: No signature specified. Exiting.");
    return res.status(400).json({ error: "No signature specified" });
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
  if (typeof address != "string") {
    logWithTimestamp("POST /credentials: address isn't a string. Exiting.");
    return res.status(400).json({ error: "address isn't a string" });
  }
  if (typeof signature != "string") {
    logWithTimestamp("POST /credentials: signature isn't a string. Exiting.");
    return res.status(400).json({ error: "signature isn't a string" });
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

  // Signature check
  const signer = ethers.utils.verifyMessage(signedMessage, signature);
  if (signer.toLowerCase() != address.toLowerCase()) {
    logWithTimestamp("GET /credentials: signer != address. Exiting.");
    return res.status(400).json({ error: "signer != address" });
  }

  // TODO: Test that the following lines actually save a document to the database
  const userCredentialsDoc = new UserCredentials({
    address,
    encryptedCredentials,
    encryptedSymmetricKey,
  });
  try {
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
