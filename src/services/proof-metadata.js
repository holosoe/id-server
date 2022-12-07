import axios from "axios";
import { strict as assert } from "node:assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { mongoose, UserCredentials, UserProofMetadata } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";

/**
 * Get user's encrypted proof metadata and symmetric key from document store.
 */
async function getProofMetadata(req, res) {
  logWithTimestamp("GET /proof-metadata: Entered");

  const proofDigest = req?.query?.proofDigest;

  if (!proofDigest) {
    logWithTimestamp("GET /proof-metadata: No proofDigest specified. Exiting.");
    return res.status(400).json({ error: "No proofDigest specified" });
  }
  if (typeof proofDigest != "string") {
    logWithTimestamp("GET /proof-metadata: proofDigest isn't a string. Exiting.");
    return res.status(400).json({ error: "proofDigest isn't a string" });
  }

  try {
    const userProofMetadata = await UserProofMetadata.findOne({
      proofDigest: proofDigest,
    }).exec();
    logWithTimestamp(
      `GET /proof-metadata: Found user in database with proofDigest ${proofDigest}.`
    );
    return res.status(200).json(userProofMetadata);
  } catch (err) {
    console.log(err);
    console.log("GET /proof-metadata: Could not find user proof metadata. Exiting");
    return res.status(400).json({
      error:
        "An error occurred while trying to get proof metadata object from database.",
    });
  }
}

/**
 * Set user's encrypted proof metadata and symmetric key.
 */
async function postProofMetadata(req, res) {
  logWithTimestamp("POST /proof-metadata: Entered");

  const proofDigest = req?.body?.proofDigest;
  const encryptedProofMetadata = req?.body?.encryptedProofMetadata;
  const encryptedSymmetricKey = req?.body?.encryptedSymmetricKey;

  // Require that args are present
  if (!proofDigest) {
    logWithTimestamp("POST /proof-metadata: No proofDigest specified. Exiting.");
    return res.status(400).json({ error: "No proofDigest specified" });
  }
  if (!encryptedProofMetadata) {
    logWithTimestamp(
      "POST /proof-metadata: No encryptedProofMetadata specified. Exiting."
    );
    return res.status(400).json({ error: "No encryptedProofMetadata specified" });
  }
  if (!encryptedSymmetricKey) {
    logWithTimestamp(
      "POST /proof-metadata: No encryptedSymmetricKey specified. Exiting."
    );
    return res.status(400).json({ error: "No encryptedSymmetricKey specified" });
  }

  // Require that args are correct types
  if (typeof proofDigest != "string") {
    logWithTimestamp("POST /proof-metadata: proofDigest isn't a string. Exiting.");
    return res.status(400).json({ error: "proofDigest isn't a string" });
  }
  if (typeof encryptedProofMetadata != "string") {
    logWithTimestamp(
      "POST /proof-metadata: encryptedProofMetadata isn't a string. Exiting."
    );
    return res.status(400).json({ error: "encryptedProofMetadata isn't a string" });
  }
  if (typeof encryptedSymmetricKey != "string") {
    logWithTimestamp(
      "POST /proof-metadata: encryptedSymmetricKey isn't a string. Exiting."
    );
    return res.status(400).json({ error: "encryptedSymmetricKey isn't a string" });
  }

  // Ensure user exists
  let userCredentialsDoc;
  try {
    userCredentialsDoc = await UserCredentials.findOne({
      proofDigest: proofDigest,
    }).exec();
  } catch (err) {
    console.log(err);
    console.log(
      "POST /proof-metadata: An error occurred while retrieving user credentials. Exiting"
    );
    return res.status(400).json({
      error: "An error occurred while retrieving user credentials.",
    });
  }
  if (!userCredentialsDoc) {
    return res.status(404).json({
      error: `User with proofDigest ${proofDigest} does not exist.`,
    });
  }

  // Store proof metadata
  let userProofMetadataDoc;
  try {
    userProofMetadataDoc = await UserProofMetadata.findOne({
      proofDigest: proofDigest,
    }).exec();
    userProofMetadataDoc;
  } catch (err) {
    console.log(err);
    console.log(
      "POST /proof-metadata: An error occurred while retrieving user proof metadata. Exiting"
    );
    return res.status(400).json({
      error: "An error occurred while retrieving user proof metadata.",
    });
  }
  if (userProofMetadataDoc) {
    userProofMetadataDoc.encryptedProofMetadata = encryptedProofMetadata;
    userProofMetadataDoc.encryptedSymmetricKey = encryptedSymmetricKey;
  } else {
    userProofMetadataDoc = new UserProofMetadata({
      proofDigest,
      encryptedProofMetadata,
      encryptedSymmetricKey,
    });
  }
  try {
    logWithTimestamp(
      `POST /proof-metadata: Saving user proof metadata to database with proofDigest ${proofDigest}.`
    );
    await userProofMetadataDoc.save();
  } catch (err) {
    console.log(err);
    console.log("POST /proof-metadata: Could not save userProofMetadataDoc. Exiting");
    return res.status(400).json({
      error: "An error occurred while trying to save object to database.",
    });
  }

  return res.status(200).json({ success: true });
}

export { getProofMetadata, postProofMetadata };
