import axios from "axios";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { mongoose, UserCredentials, alchemyProvider, zokProvider } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";
import contractAddresses from "../constants/contractAddresses.js";
import hubABI from "../constants/abi/Hub.js";
import { holonymIssuers, relayerURL } from "../constants/misc.js";

async function validatePostCredentialsArgs(
  sigDigest,
  proof,
  encryptedCredentials,
  encryptedSymmetricKey
) {
  const leaf = ethers.BigNumber.from(proof?.inputs?.[0]).toString();
  const issuer = ethers.BigNumber.from(proof?.inputs?.[1]).toHexString();

  if (!holonymIssuers.includes(issuer)) {
    return { error: `Issuer ${issuer} is not whitelisted` };
  }

  // Check that leaf is in the Merkle tree
  // TODO: Replace optimism-goerli with dynamic variable
  const leavesResp = await axios.get(`${relayerURL}/getLeaves/${"optimism-goerli"}`); 
  const leaves = leavesResp.data;
  if (!leaves.includes(leaf)) {
    return { error: "Merkle tree does not include leaf" };
  }

  // Verify proof of knowledge of leaf preimage
  try {
    const verifKeyResp = await axios.get(
      "https://preproc-zkp.s3.us-east-2.amazonaws.com/knowPreimage.verification.key"
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
  if (
    !encryptedCredentials ||
    encryptedCredentials == "null" ||
    encryptedCredentials == "undefined"
  ) {
    return { error: "No encryptedCredentials specified" };
  }
  if (
    !encryptedSymmetricKey ||
    encryptedSymmetricKey == "null" ||
    encryptedSymmetricKey == "undefined"
  ) {
    return { error: "No encryptedSymmetricKey specified" };
  }

  // Require that args are correct types
  if (typeof sigDigest != "string") {
    return { error: "sigDigest isn't a string" };
  }
  if (typeof encryptedCredentials != "string") {
    return { error: "encryptedCredentials isn't a string" };
  }
  if (typeof encryptedSymmetricKey != "string") {
    return { error: "encryptedSymmetricKey isn't a string" };
  }

  // Ensure that args are not too large
  if (sigDigest.length != 64) {
    return { error: "sigDigest is not 64 characters long" };
  }
  if (encryptedCredentials.length > 10000) {
    return { error: "encryptedCredentials is too large" };
  }
  if (encryptedSymmetricKey.length > 10000) {
    return { error: "encryptedSymmetricKey is too large" };
  }
  return { success: true };
}

async function storeOrUpdateUserCredentials(
  sigDigest,
  proofDigest,
  encryptedCredentials,
  encryptedSymmetricKey
) {
  let userCredentialsDoc;
  try {
    userCredentialsDoc = await UserCredentials.findOne({
      proofDigest: proofDigest,
    }).exec();
  } catch (err) {
    console.log(err);
    logWithTimestamp(
      "POST /credentials: An error occurred while retrieving credenials. Exiting"
    );
    return { error: "An error occurred while retrieving credentials." };
  }
  if (userCredentialsDoc) {
    userCredentialsDoc.sigDigest = sigDigest;
    userCredentialsDoc.encryptedCredentials = encryptedCredentials;
    userCredentialsDoc.encryptedSymmetricKey = encryptedSymmetricKey;
  } else {
    userCredentialsDoc = new UserCredentials({
      proofDigest,
      sigDigest,
      encryptedCredentials,
      encryptedSymmetricKey,
    });
  }
  try {
    logWithTimestamp(
      `POST /credentials: Saving user to database with proofDigest ${proofDigest}.`
    );
    await userCredentialsDoc.save();
  } catch (err) {
    console.log(err);
    return { error: "An error occurred while trying to save object to database." };
  }
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
    encryptedSymmetricKey
  );
  if (storeOrUpdateResult.error) {
    logWithTimestamp(`POST /credentials: ${storeOrUpdateResult.error}. Exiting.`);
    return res.status(500).json({ error: storeOrUpdateResult.error });
  }

  return res.status(200).json({ success: true });
}

export { getCredentials, postCredentials };
