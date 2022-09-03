import { randomBytes } from "crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  leafFromData,
  addLeafSmall,
  proveResidence,
} from "../zok/JavaScript/zokWrapper.js";

/**
 * @typedef UserProofs
 * @property {Object} smallLeafProof Proof needed to add small leaf to merkle tree // TODO: Should be of type string
 * @property {Object} residenceProof Proof that creds in small leaf == "US" // TODO: Should be of type string
 * @property {string} newNullifier Encrypted nullifier
 */

/**
 * Generate an addLeafSmall proof and a proof that creds=="US".
 * @param {string} creds
 * @param {string} nullifier 16-byte hex string
 * @returns {Promise<UserProofs>} Encrypted proofs and newNullifier
 */
async function generateProofs(creds, nullifier) {
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const credsAsBuffer = Buffer.from(creds);
  const nullifierAsBuffer = Buffer.from(nullifier.replace("0x", ""), "hex");
  const signedLeaf = leafFromData(serverAddress, credsAsBuffer, nullifierAsBuffer);
  const newNullifierAsBuffer = randomBytes(16); // TODO: Encrypt newNullifier and send it to user
  const newLeaf = leafFromData(serverAddress, credsAsBuffer, newNullifierAsBuffer);

  // Generate addLeafSmall proof
  const smallLeafProof = await addLeafSmall(
    signedLeaf,
    serverAddress,
    credsAsBuffer,
    nullifierAsBuffer,
    newNullifierAsBuffer
  );

  const residenceProof = await proveResidence(
    newLeaf,
    serverAddress,
    credsAsBuffer,
    newNullifierAsBuffer
  );

  // TODO: Encrypt proofs with user's public key

  return {
    smallLeafProof: smallLeafProof,
    residenceProof: residenceProof,
  };

  // ---------------
  // Hub must be presented with:
  // - oldLeaf
  // - server signature of oldLeaf
  // - newLeaf
  // - addLeafSmall proof (args: oldLeaf, newLeaf, address, creds, oldNullifier, newNullifier)
  // - addLeafBig
  // Need proof from addLeafSmall.zok
  // Need to run a relayer for this
}

async function handler(argv) {
  const encryptedArgs = argv.args;

  // TODO: Decrypt...

  // const proofs = await generateProofs(creds, secret);

  // console.log(proofs);
}

const argv = yargs(hideBin(process.argv)).command(
  "$0 <args>",
  "Generate proofs",
  () => {},
  handler
).argv;
