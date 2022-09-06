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

// Handling params for merkle proof in proofOfKnowledgeOfPreimage:
// User only provides creds + secret. Server provides all leaves and root.
// Secure enclave determines path + directionSelector.

/**
 * Proof for Lobby3.
 * Generate an addLeafSmall proof and a proof that creds==2 (2 represents "US").
 * @param {number} creds
 * @param {string} secret 16-byte hex string
 * @param {string} root Merkle root. String representation of a number
 * @param {Array<bool>} directionSelector For merkle proof path
 * @param {Array<string>} path Array of siblings in merkle proof path
 * @returns {Promise<UserProofs>} Encrypted proofs and newSecret
 */
async function genKnowledgeOfPreimageProof(
  creds,
  secret,
  root,
  directionSelector,
  path
) {
  assert.equal(creds, 2, "User is not a US resident");
  const credsAsBuffer = unitedStatesCredsBuffer;
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const secretAsBuffer = Buffer.from(secret.replace("0x", ""), "hex");
  const leaf = createSmallLeaf(serverAddress, credsAsBuffer, secretAsBuffer);

  const proofOfKnowledgeOfPreimage = await proveKnowledgeOfPreimageOfMemberLeaf(
    serverAddress,
    credsAsBuffer,
    root,
    leaf,
    directionSelector,
    path,
    secretAsBuffer
  );

  // TODO: Encrypt proofs with user's public key // Use AWS KMS and ACM

  return {
    proofOfKnowledgeOfPreimage: proofOfKnowledgeOfPreimage,
  };
}

/**
 * Generate an addLeafSmall proof.
 * @param {number} creds
 * @param {string} secret 16-byte hex string
 * @returns {Promise<UserProofs>} Encrypted proofs and newSecret
 */
async function genAddSmallLeafProof(creds, secret) {
  let credsAsBuffer = Buffer.concat([Buffer.from(creds)], 28);
  // When creds == 2, creds buffer is constructed differently
  if (creds == 2) {
    credsAsBuffer = unitedStatesCredsBuffer;
  }
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const secretAsBuffer = Buffer.from(secret.replace("0x", ""), "hex");
  const signedLeaf = createSmallLeaf(serverAddress, credsAsBuffer, secretAsBuffer);
  const newSecretAsBuffer = randomBytes(16);
  // const newLeaf = createSmallLeaf(serverAddress, credsAsBuffer, newSecretAsBuffer);

  // Generate addLeafSmall proof
  const smallLeafProof = await addLeafSmall(
    signedLeaf,
    serverAddress,
    credsAsBuffer,
    secretAsBuffer,
    newSecretAsBuffer
  );

  // TODO: Encrypt proofs with user's public key // Use AWS KMS and ACM

  return {
    smallLeafProof: smallLeafProof,
    newSecret: newSecretAsBuffer.toString("hex"),
  };
}

async function handler(argv) {
  const proofType = argv.proofType;
  const encryptedArgs = argv.args;

  // TODO: Decrypt...

  // TODO: Convert args into correct types
  // if (proofType == "addSmallLeaf") {
  //   const proof = genAddSmallLeafProof(creds, secret);
  //   console.log(proof);
  // }

  // console.log(proofs);
}

const argv = yargs(hideBin(process.argv)).command(
  "$0 <proofType> <args>",
  "Generate proofs",
  () => {},
  handler
).argv;
