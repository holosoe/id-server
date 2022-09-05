import assert from "assert";
import { randomBytes } from "crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  createSmallLeaf,
  addLeafSmall,
  proveKnowledgeOfPreimageOfMemberLeaf,
} from "../zok/JavaScript/zokWrapper.js";

/**
 * @typedef UserProofs
 * @property {Object} smallLeafProof Proof needed to add small leaf to merkle tree // TODO: Should be of type string
 * @property {Object} residenceProof Proof that creds in small leaf == "US" // TODO: Should be of type string
 * @property {string} newSecret Encrypted secret
 */

const unitedStatesCredsBuffer = Buffer.from("00".repeat(26) + "0002", "hex");

/**
 * Proofs for Lobby3.
 * Generate an addLeafSmall proof and a proof that creds==2 (2 represents "US").
 * @param {number} creds
 * @param {string} secret 16-byte hex string
 * @param {string} root Merkle root. String representation of a number
 * @param {Array<bool>} directionSelector For merkle proof path
 * @param {Array<string>} path Array of siblings in merkle proof path
 * @returns {Promise<UserProofs>} Encrypted proofs and newSecret
 */
async function generateProofs(creds, secret, root, directionSelector) {
  assert.equal(creds, 2, "User is not a US resident");
  const credsAsBuffer = unitedStatesCredsBuffer;
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const secretAsBuffer = Buffer.from(secret.replace("0x", ""), "hex");
  const signedLeaf = createSmallLeaf(serverAddress, credsAsBuffer, secretAsBuffer);
  const newSecretAsBuffer = randomBytes(16); // TODO: Encrypt newSecret and send it to user
  const newLeaf = createSmallLeaf(serverAddress, credsAsBuffer, newSecretAsBuffer);

  // Generate addLeafSmall proof
  const smallLeafProof = await addLeafSmall(
    signedLeaf,
    serverAddress,
    credsAsBuffer,
    secretAsBuffer,
    newSecretAsBuffer
  );

  const proofOfKnowledgeOfPreimage = await proveKnowledgeOfPreimageOfMemberLeaf(
    serverAddress,
    credsAsBuffer,
    root,
    newLeaf,
    directionSelector,
    path,
    newSecretAsBuffer
  );

  // TODO: Encrypt proofs with user's public key

  return {
    smallLeafProof: smallLeafProof,
    proofOfKnowledgeOfPreimage: proofOfKnowledgeOfPreimage,
  };

  // ---------------
  // Hub must be presented with:
  // - oldLeaf
  // - server signature of oldLeaf
  // - newLeaf
  // - addLeafSmall proof (args: oldLeaf, newLeaf, address, creds, oldSecret, newSecret)
  // - addLeafBig
  // Need proof from addLeafSmall.zok
  // Need to run a relayer for this
}

async function handler(argv) {
  const encryptedArgs = argv.args;

  // TODO: Decrypt...

  // TODO: Convert args into correct types
  // const proofs = await generateProofs(creds, secret);

  // console.log(proofs);
}

const argv = yargs(hideBin(process.argv)).command(
  "$0 <args>",
  "Generate proofs",
  () => {},
  handler
).argv;
