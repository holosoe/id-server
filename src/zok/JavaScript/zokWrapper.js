/**
 * Wrapper for executing CLI ZoKrates commands on
 * .zok files in the zok/ directory.
 */

import fs from "fs";
import { assert } from "console";
import util from "util";
import { randomBytes } from "crypto";
import { ethers } from "ethers";
import zokrates from "zokrates-js";
import { toU32StringArray, argsToU32CLIArgs, chunk } from "./zokUtils.js";
import { exec as nonPromisifiedExec } from "child_process";
import dotenv from "dotenv";
dotenv.config();
const exec = util.promisify(nonPromisifiedExec);
const { initialize } = zokrates;

const zokExecutable = process.env.ZOKRATES_EXECUTABLE;
const localZokDir = process.env.ZOK_DIR; // Dir with .zok files, proving keys, etc.

/**
 * @param {string} binPath Path to the compiled zokrates program
 * @param {string} witnessPath Path to the witness file that will be written
 * @param {Array<Buffer>} args Each Buffer will be converted to a uint32 string
 * @returns {string}
 */
function getComputeWitnessCmd(binPath = "out", witnessPath = "witness", args = []) {
  const baseCmd = `${zokExecutable} compute-witness`;
  const options = `-i ${binPath} -o ${witnessPath}`;
  const formattedArgs = `-a ${argsToU32CLIArgs(args)}`;
  return `${baseCmd} ${options} ${formattedArgs}`;
}

/**
 * @param {string} binPath Path to the compiled zokrates program
 * @param {string} witnessPath Path to the witness file
 * @param {string} proofPath Path to the proof file that will be written
 * @param {string} provingKey Path to the proving key that will be written
 * @returns {string}
 */
function getGenProofCmd(
  binPath = "out",
  witnessPath = "witness",
  proofPath = "proof.json",
  provingKeyPath = "proving.key"
) {
  const baseCmd = `${zokExecutable} generate-proof`;
  const options = `-i ${binPath} -w ${witnessPath} -j ${proofPath} -p ${provingKeyPath}`;
  return `${baseCmd} ${options} `;
}

function assertLengthIs(item, length, itemName) {
  const errMsg = `${itemName} must be ${length} bytes but is ${item.length} bytes`;
  assert(item.length == length, errMsg);
}

/**
 * Takes Buffer, properly formats them (according to spec), and returns a hash.
 * See: https://opsci.gitbook.io/untitled/4alwUHFeMIUzhQ8BnUBD/extras/leaves
 * @param {Buffer} issuer Blockchain address of account that issued the credentials
 * @param {Buffer} creds Credentials (e.g., "Alice" or "US" as Buffer)
 * @param {Buffer} secret Hex string representation of 16 bytes
 * @returns {Promise<Buffer>} Blake2s hash (of input data) right-shifted 3 bits with left padding to fill 32 bytes
 */
async function createSmallLeaf(issuer, creds, secret) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  try {
    const paddedCreds = Buffer.concat([creds], 28);

    const createLeafPath = process.env.ZOK_PATH_TO_CREATE_LEAF_SMALL;
    const zokratesProvider = await initialize();
    const createLeaf = zokratesProvider.compile(`${fs.readFileSync(createLeafPath)}`);
    const { witness, output } = zokratesProvider.computeWitness(
      createLeaf,
      [issuer, paddedCreds, secret].map((x) => toU32StringArray(x))
    );
    const hashAsBigNum = ethers.BigNumber.from(output.replaceAll('"', ""));
    const hashRightShifted = hashAsBigNum.div(8); // right shift 3 bits

    // Add left padding if necessary
    const hashStr = hashRightShifted.toHexString().replace("0x", "");
    const missingZeros = 64 - hashStr.length;
    const formattedHashStr = "0".repeat(missingZeros) + hashStr;

    return Buffer.from(formattedHashStr, "hex");
  } catch (err) {
    console.log(err);
  }
}

/**
 * Takes Buffer, properly formats them (according to spec), and returns a hash.
 * See: https://opsci.gitbook.io/untitled/4alwUHFeMIUzhQ8BnUBD/extras/leaves
 * @param {Buffer} issuer Blockchain address of account that issued the credentials
 * @param {Buffer} secret Hex string representation of 16 bytes
 * @param {Buffer} creds1 Credentials array. Must be 28 bytes
 * @param {Buffer} creds2 Credentials array. Must be 64 bytes
 * @returns {Promise<Buffer>} Blake2s hash (of input data) right-shifted 3 bits
 */
async function createBigLeaf(issuer, secret, creds1, creds2) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  assertLengthIs(creds1, 28, "creds1");
  assertLengthIs(creds2, 64, "creds2");
  try {
    const createLeafPath = process.env.ZOK_PATH_TO_CREATE_LEAF_BIG;
    const zokratesProvider = await initialize();
    const createLeaf = zokratesProvider.compile(`${fs.readFileSync(createLeafPath)}`);
    const { witness, output } = zokratesProvider.computeWitness(
      createLeaf,
      [issuer, secret, creds1, creds2].map((x) => toU32StringArray(x))
    );
    const hashAsBigNum = ethers.BigNumber.from(output.replaceAll('"', ""));
    const hashRightShifted = hashAsBigNum.div(8); // right shift 3 bits

    // Add left padding if necessary
    const hashStr = hashRightShifted.toHexString().replace("0x", "");
    const missingZeros = 64 - hashStr.length;
    const formattedHashStr = "0".repeat(missingZeros) + hashStr;

    return Buffer.from(formattedHashStr, "hex");
  } catch (err) {
    console.log(err);
  }
}

/**
 * @param {Buffer} signedLeaf
 * @param {Buffer} issuer Blockchain address
 * @param {Buffer} creds
 * @param {Buffer} secret
 * @param {Buffer} newSecret
 * @returns {Object} Proof
 */
async function addLeafSmall(signedLeaf, issuer, creds, secret, newSecret) {
  assertLengthIs(signedLeaf, 32, "signedLeaf");
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  const newLeaf = await createSmallLeaf(issuer, creds, newSecret);
  assertLengthIs(newLeaf, 32, "newLeaf");

  const paddedCreds = Buffer.concat([creds], 28);
  const inFile = process.env.ZOK_PATH_TO_ALS_OUT;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".als.witness";
  const tmpProofFile = localZokDir + "/temp" + tmpValue + ".als.proof.json";

  // Execute the command
  try {
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, [
      signedLeaf,
      newLeaf,
      issuer,
      paddedCreds,
      secret,
      newSecret,
    ]);
    const generateProofCmd = getGenProofCmd(
      inFile,
      tmpWitnessFile,
      tmpProofFile,
      `${localZokDir}/als.proving.key`
    );
    const { stdout, stderr } = await exec(
      `${computeWitnessCmd} && ${generateProofCmd} && rm ${tmpWitnessFile}`
    );
  } catch (e) {
    console.error(e);
  }

  // Read the proof file, then delete it, then return it
  const retval = JSON.parse(fs.readFileSync(tmpProofFile));
  exec(`rm ${tmpProofFile}`);
  return retval;
}

/**
 * Prove that user knows the preimage of a leaf that belongs in the merkle tree.
 * @param {Buffer} issuer Blockchain address. Public input to proof.
 * @param {Buffer} creds Public input to proof. Public so that verifier can check it outside proof.
 * Must be left-padded (so that the rightmost u32 is the prime, in the case of countryCode).
 * @param {Buffer} root Merkle root. Public input to proof.
 * @param {Buffer} leaf Leaf of merkle tree. Private input to proof.
 * @param {Buffer} directionSelector (See proof.) Private input to proof.
 * @param {Buffer} path (See proof.) Private input to proof.
 * @param {Buffer} secret I.e., nullifier. Private input to proof.
 * @returns {Object} Proof
 */
async function proveKnowledgeOfPreimageOfMemberLeaf(
  issuer,
  creds,
  root,
  leaf,
  directionSelector,
  path,
  secret
) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(creds, 32, "creds");
  assertLengthIs(leaf, 32, "leaf");
  assertLengthIs(secret, 16, "secret");

  const inFile = process.env.ZOK_PATH_TO_LOBBY3_PROOF_OUT;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.witness";
  const tmpProofFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.proof.json";

  // Execute the command
  try {
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, [
      issuer,
      creds,
      root,
      leaf,
      directionSelector,
      path,
      secret,
    ]);
    const generateProofCmd = getGenProofCmd(
      inFile,
      tmpWitnessFile,
      tmpProofFile,
      `${localZokDir}/lobby3Proof.proving.key`
    );
    const { stdout, stderr } = await exec(
      `${computeWitnessCmd} && ${generateProofCmd} && rm ${tmpWitnessFile}`
    );
  } catch (e) {
    console.error(e);
  }

  // Read the proof file, then delete it, then return it
  const retval = JSON.parse(fs.readFileSync(tmpProofFile));
  exec(`rm ${tmpProofFile}`);
  return retval;
}

export {
  createSmallLeaf,
  createBigLeaf,
  addLeafSmall,
  proveKnowledgeOfPreimageOfMemberLeaf,
};
