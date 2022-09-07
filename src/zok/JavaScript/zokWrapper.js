/**
 * Wrapper for executing CLI ZoKrates commands on
 * .zok files in the zok/ directory.
 */

import fs from "fs";
import assert from "assert";
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
 * @param {string} args
 * @returns {string}
 */
function getComputeWitnessCmd(binPath = "out", witnessPath = "witness", args = "") {
  const baseCmd = `${zokExecutable} compute-witness`;
  const options = `-i ${binPath} -o ${witnessPath}`;
  return `${baseCmd} ${options} -a ${args}`;
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
  assert.equal(item.length, length, errMsg);
}

/**
 * Takes Buffer, properly formats them (according to spec), and returns a hash.
 * See: https://opsci.gitbook.io/untitled/4alwUHFeMIUzhQ8BnUBD/extras/leaves
 * @param {Buffer} issuer Blockchain address of account that issued the credentials
 * @param {Buffer} creds Credentials (e.g., "Alice" or 2 as Buffer)
 * @param {Buffer} secret Hex string representation of 16 bytes
 * @returns {Promise<string>} Blake2s hash (of input data) right-shifted 3 bits. Base 10 number
 * represented as a string.
 */
async function createSmallLeaf(issuer, creds, secret) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(creds, 28, "creds");
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
    return hashAsBigNum;
    // const hashRightShifted = hashAsBigNum.div(8); // right shift 3 bits
    // return hashRightShifted.toString();
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
 * @param {string} signedLeaf String representation of a number
 * @param {Buffer} issuer Blockchain address
 * @param {Buffer} creds
 * @param {Buffer} secret
 * @param {Buffer} newSecret
 * @returns {Object} Proof
 */
async function addLeafSmall(signedLeaf, issuer, creds, secret, newSecret) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  const newLeaf = await createSmallLeaf(issuer, creds, newSecret);

  const paddedCreds = Buffer.concat([creds], 28);
  const inFile = process.env.ZOK_PATH_TO_ALS_OUT;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".als.witness";
  const tmpProofFile = localZokDir + "/temp" + tmpValue + ".als.proof.json";

  // Execute the command
  try {
    const u32Args = argsToU32CLIArgs([issuer, paddedCreds, secret, newSecret]);
    const args = `${signedLeaf} ${newLeaf} ${u32Args}`;
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, args);
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
    console.log(e);
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
 * @param {string} root uint256 represented as string. Merkle root. Public input to proof.
 * @param {string} leaf uint256 represented as string. Leaf of merkle tree. Private input to proof.
 * @param {Array<bool>} directionSelector (See proof.) Private input to proof.
 * @param {Array<string>} path (See proof.) Private input to proof.
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
  assertLengthIs(secret, 16, "secret");

  const inFile = process.env.ZOK_PATH_TO_LOBBY3_PROOF_OUT;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.witness";
  const tmpProofFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.proof.json";

  // Format args for command line
  let args = argsToU32CLIArgs([issuer, creds]);
  args += " " + root + " " + leaf;
  args += " " + directionSelector.map((x) => (x ? 1 : 0).toString()).join(" ");
  args += " " + path.join(" ") + " " + argsToU32CLIArgs([secret]);

  // Execute the command
  try {
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, args);
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
