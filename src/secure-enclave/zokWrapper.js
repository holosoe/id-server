/**
 * Wrapper for executing CLI ZoKrates commands on
 * .zok files in the zok/ directory.
 */

import fs from "fs";
import { assert } from "console";
import util from "util";
import { randomBytes } from "crypto";
import { zokGlobals } from "./init.js";
import { toU32StringArray, argsToU32CLIArgs } from "./utils.js";
import { exec as nonPromisifiedExec } from "child_process";
const exec = util.promisify(nonPromisifiedExec);

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
 * @returns {Buffer} 32-byte blake2s hash
 */
function leafFromData(issuer, creds, secret) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  const paddedCreds = Buffer.concat([creds], 28);
  const { witness, output } = zokGlobals.zokratesProvider.computeWitness(
    zokGlobals.leafgen,
    [issuer, paddedCreds, secret].map((x) => toU32StringArray(x))
  );
  const leafAsStr = JSON.parse(output).join("").replaceAll("0x", "");
  return Buffer.from(leafAsStr, "hex");
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
  const newLeaf = leafFromData(issuer, creds, newSecret);
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
 * Prove that creds == "US"
 * @param {Buffer} newLeaf
 * @param {Buffer} issuer Blockchain address
 * @param {Buffer} creds
 * @param {Buffer} newSecret
 * @returns {Object} Proof
 */
async function proveResidence(newLeaf, issuer, creds, newSecret) {
  assertLengthIs(newLeaf, 32, "newLeaf");
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(newSecret, 16, "secret");

  const paddedCreds = Buffer.concat([creds], 28);

  const inFile = process.env.ZOK_PATH_TO_POR_OUT;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".por.witness";
  const tmpProofFile = localZokDir + "/temp/" + tmpValue + ".por.proof.json";

  // Execute the command
  try {
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, [
      newLeaf,
      issuer,
      paddedCreds,
      newSecret,
    ]);
    const generateProofCmd = getGenProofCmd(
      inFile,
      tmpWitnessFile,
      tmpProofFile,
      `${localZokDir}/por.proving.key`
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

export { addLeafSmall, proveResidence };
