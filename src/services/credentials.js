import axios from "axios";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { mongoose, UserCredentials, zokProvider } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";
import contractAddresses from "../constants/contractAddresses.js";
import { holonymIssuers, relayerURL } from "../constants/misc.js";

async function validatePostCredentialsArgs(
  sigDigest,
  proof,
  encryptedCredentials,
  encryptedSymmetricKey
) {
  if (!proof) {
    return { error: "proof is empty" };
  }
  const root = ethers.BigNumber.from(proof?.inputs?.[0]).toString();

  try {
    const rootIsRecent = (await axios.get(`${relayerURL}/v2/rootIsRecent/${root}`))
      .data;
    if (!rootIsRecent) {
      return { error: "Root is not recent" };
    }
  } catch (err) {
    console.error(err);
    return { error: "An error occurred while checking whether the root is recent" };
  }

  // Verify proof of knowledge of leaf preimage
  try {
    const verifKeyResp = await axios.get(
      "https://preproc-zkp.s3.us-east-2.amazonaws.com/knowledgeOfLeafPreimage.verifying.key"
    );
    const verificationKey = verifKeyResp.data;
    // console.log(proof);
    const isVerified = zokProvider.verify(verificationKey, proof);
    if (!isVerified) {
      console.log("isVerified", isVerified);
      return { error: "Proof is invalid" };
    }
  } catch (err) {
    console.log(err);
    return { error: "An error occurred while verifying proof" };
  }

  // Require that args are present
  if (!sigDigest || sigDigest == "null" || sigDigest == "undefined") {
    return { error: "No sigDigest specified" };
  }

  // Require that args are correct types
  if (typeof sigDigest != "string") {
    return { error: "sigDigest isn't a string" };
  }

  // Ensure that args are not too large
  if (sigDigest.length != 64) {
    return { error: "sigDigest is not 64 characters long" };
  }
  return { success: true };
}

async function storeOrUpdateUserCredentials(
  sigDigest,
  proofDigest,
  encryptedCredentials,
  encryptedSymmetricKey,
  encryptedCredentialsAES
) {
  let userCredentialsDoc;
  try {
    // Try getting user by proofDigest first. This prevents a single proof
    // from being used multiple times for different users/sigDigests.
    userCredentialsDoc = await UserCredentials.findOne({
      proofDigest: proofDigest,
    }).exec();
    // If this proof hasn't been used to store user credentials, search by
    // sigDigest. The user might be appending to a credential set that they
    // have already stored.
    if (!userCredentialsDoc) {
      userCredentialsDoc = await UserCredentials.findOne({
        sigDigest: sigDigest,
      }).exec();
    }
  } catch (err) {
    console.log(err);
    logWithTimestamp(
      "POST /credentials: An error occurred while retrieving credenials. Exiting"
    );
    return { error: "An error occurred while retrieving credentials." };
  }
  if (userCredentialsDoc) {
    userCredentialsDoc.proofDigest = proofDigest;
    userCredentialsDoc.sigDigest = sigDigest;
    userCredentialsDoc.encryptedCredentials = encryptedCredentials;
    userCredentialsDoc.encryptedSymmetricKey = encryptedSymmetricKey;
    userCredentialsDoc.encryptedCredentialsAES = encryptedCredentialsAES;
  } else {
    userCredentialsDoc = new UserCredentials({
      proofDigest,
      sigDigest,
      encryptedCredentials,
      encryptedSymmetricKey,
      encryptedCredentialsAES,
    });
  }
  try {
    logWithTimestamp(
      `POST /credentials: Saving user to database with proofDigest ${proofDigest} and sigDigest ${sigDigest}.`
    );
    await userCredentialsDoc.save();
  } catch (err) {
    console.log(err);
    return { error: "An error occurred while trying to save object to database." };
  }
  logWithTimestamp(
    `POST /credentials: Saved credentials for user with sigDigest ${sigDigest}. Exiting.`
  );
  return { success: true };
}

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
    const userCreds = await UserCredentials.findOne({
      sigDigest: sigDigest,
    }).exec();
    logWithTimestamp(
      `GET /credentials: Found user in database with sigDigest ${sigDigest}.`
    );
    return res.status(200).json(userCreds);
  } catch (err) {
    console.log(err);
    console.log("GET /credentials: Could not find user credentials. Exiting");
    return res.status(400).json({
      error: "An error occurred while trying to get credentials object from database.",
    });
  }
}

/**
 * Set user's encrypted credentials and symmetric key.
 *
 * NOTE: The user can store 1 credential set per proof, where the proof proves
 * knowledge of a preimage of a leaf in the Merkle tree. So, if the user has 3 leaves,
 * they can store 3 credential sets. This is a limitation of the current design.
 * Ideally, each user can store only 1 credential set. However, given our privacy
 * guarantees, it is not clear that any design can reach this ideal.
 */
async function postCredentials(req, res) {
  logWithTimestamp("POST /credentials: Entered");

  const sigDigest = req?.body?.sigDigest;
  const proof = req?.body?.proof;
  const encryptedCredentials = req?.body?.encryptedCredentials;
  const encryptedSymmetricKey = req?.body?.encryptedSymmetricKey;
  const encryptedCredentialsAES = req?.body?.encryptedCredentialsAES;

  const validationResult = await validatePostCredentialsArgs(
    sigDigest,
    proof,
    encryptedCredentials,
    encryptedSymmetricKey
  );
  if (validationResult.error) {
    logWithTimestamp(`POST /credentials: ${validationResult.error}. Exiting.`);
    return res.status(400).json({ error: validationResult.error });
  }

  // To save space, we store a hash of the proof, instead of the proof itself.
  // The `toLowerCase` step is important because case differences could allow users
  // to use the same proof (varying only casing) to store multiple sets of data.
  const serializedProof =
    "0x" + Buffer.from(JSON.stringify(proof).toLowerCase()).toString("hex");
  const proofDigest = poseidon([serializedProof]).toString();

  const storeOrUpdateResult = await storeOrUpdateUserCredentials(
    sigDigest,
    proofDigest,
    encryptedCredentials,
    encryptedSymmetricKey,
    encryptedCredentialsAES
  );
  if (storeOrUpdateResult.error) {
    logWithTimestamp(`POST /credentials: ${storeOrUpdateResult.error}. Exiting.`);
    return res.status(500).json({ error: storeOrUpdateResult.error });
  }

  return res.status(200).json({ success: true });
}

export { getCredentials, postCredentials };
