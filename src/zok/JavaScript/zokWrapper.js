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

const zokProvider = await initialize();
const source = `import "hashes/poseidon/poseidon" as poseidon;
def main(field[2] input) -> field {
  return poseidon(input);
}`;
const poseidonHashArtifacts = zokProvider.compile(source);

/**
 * @param {Array<string>} input 2-item array
 */
function poseidonHash(input) {
  const [leftInput, rightInput] = input;
  const { witness, output } = zokProvider.computeWitness(poseidonHashArtifacts, [
    [leftInput, rightInput],
  ]);
  return output.replaceAll('"', "");
}

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
 * @param {Buffer} secret 16 bytes
 * @param {Buffer} countryCode
 * @param {Buffer} subdivision
 * @param {Buffer} completedAt
 * @param {Buffer} birthdate
 * @returns {Promise<string>} Poseidon hash (of input data) right-shifted 3 bits. Represented as
 * a base 10 number represented as a string.
 */
async function createLeaf(
  issuer,
  secret,
  countryCode,
  subdivision,
  completedAt,
  birthdate
) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  assertLengthIs(countryCode, 2, "countryCode");
  assertLengthIs(subdivision, 2, "subdivision");
  assertLengthIs(completedAt, 3, "completedAt");
  assertLengthIs(birthdate, 3, "birthdate");
  try {
    const createLeafPath = process.env.ZOK_PATH_TO_CREATE_LEAF;
    const zokratesProvider = await initialize();
    const createLeaf = zokratesProvider.compile(`${fs.readFileSync(createLeafPath)}`);
    const { witness, output } = zokratesProvider.computeWitness(
      createLeaf,
      [issuer, secret, countryCode, subdivision, completedAt, birthdate].map((x) =>
        ethers.BigNumber.from(x).toString()
      )
    );
    const hashAsBigNum = ethers.BigNumber.from(output.replaceAll('"', ""));
    return hashAsBigNum.toString();
  } catch (err) {
    console.log(err);
  }
}

/**
 * @param {string} signedLeaf String representation of a number
 * @param {Buffer} issuer Blockchain address
 * @param {Buffer} countryCode
 * @param {Buffer} subdivision
 * @param {Buffer} completedAt
 * @param {Buffer} birthdate
 * @param {Buffer} secret
 * @param {Buffer} newSecret
 * @returns {Object} Proof
 */
async function addLeaf(
  signedLeaf,
  issuer,
  secret,
  newSecret,
  countryCode,
  subdivision,
  completedAt,
  birthdate
) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  assertLengthIs(countryCode, 2, "countryCode");
  assertLengthIs(subdivision, 2, "subdivision");
  assertLengthIs(completedAt, 3, "completedAt");
  assertLengthIs(birthdate, 3, "birthdate");
  const newLeaf = await createLeaf(
    issuer,
    newSecret,
    countryCode,
    subdivision,
    completedAt,
    birthdate
  );

  const inFile = process.env.ZOK_PATH_TOON_ADD_LEAF_OUT;
  const provingKey = process.env.ZOK_PATH_TO_ON_ADD_LEAF_PROVING_KEY;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".onAddLeaf.witness";
  const tmpProofFile = localZokDir + "/temp/" + tmpValue + ".onAddLeaf.proof.json";

  // Execute the command
  try {
    const args = `${signedLeaf} ${newLeaf} ${[
      issuer,
      countryCode,
      subdivision,
      completedAt,
      birthdate,
      secret,
      newSecret,
    ]
      .map((val) => ethers.BigNumber.from(val).toString())
      .join(" ")}`;
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, args);
    const generateProofCmd = getGenProofCmd(
      inFile,
      tmpWitnessFile,
      tmpProofFile,
      `${provingKey}`
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
 *
 * TODO: REWRITE this function to be compatible with quinary merkle tree
 *
 * Prove that user knows the preimage of a leaf that belongs in the merkle tree.
 * @param {Buffer} issuer Blockchain address. Public input to proof.
 * @param {Buffer} countryCode Public input to proof. Public so that verifier can check it outside proof.
 * @param {Buffer} subdivision Private input to proof.
 * @param {Buffer} completedAt Private input to proof.
 * @param {Buffer} birthdate Private input to proof.
 * @param {string} root uint256 represented as string. Merkle root. Public input to proof.
 * @param {string} leaf uint256 represented as string. Leaf of merkle tree. Private input to proof.
 * @param {Array<bool>} directionSelector (See proof.) Private input to proof.
 * @param {Array<string>} path (See proof.) Private input to proof.
 * @param {Buffer} secret I.e., nullifier. Private input to proof.
 * @returns {Object} Proof
 */
async function proveKnowledgeOfPreimageOfMemberLeaf(
  issuer,
  countryCode,
  subdivision,
  completedAt,
  birthdate,
  root,
  leaf,
  directionSelector,
  path,
  secret
) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  assertLengthIs(countryCode, 2, "countryCode");
  assertLengthIs(subdivision, 2, "subdivision");
  assertLengthIs(completedAt, 3, "completedAt");
  assertLengthIs(birthdate, 3, "birthdate");

  const inFile = process.env.ZOK_PATH_TO_LOBBY3_PROOF_OUT;
  const provingKey = process.env.ZOK_PATH_TO_LOBBY3_PROOF_PROVING_KEY;
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.witness";
  const tmpProofFile = localZokDir + "/temp/" + tmpValue + ".lobby3Proof.proof.json";

  const argsArr = [
    ethers.BigNumber.from(issuer),
    root,
    ethers.BigNumber.from(countryCode),
    ethers.BigNumber.from(subdivision),
    ethers.BigNumber.from(completedAt),
    ethers.BigNumber.from(birthdate),
    leaf,
    directionSelector.map((x) => (x ? 1 : 0).toString()).join(" "),
    path.join(" "),
    ethers.BigNumber.from(secret),
  ];
  const args = argsArr.join(" ");

  // Execute the command
  try {
    const computeWitnessCmd = getComputeWitnessCmd(inFile, tmpWitnessFile, args);
    const generateProofCmd = getGenProofCmd(
      inFile,
      tmpWitnessFile,
      tmpProofFile,
      `${provingKey}`
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

export { poseidonHash, createLeaf, addLeaf, proveKnowledgeOfPreimageOfMemberLeaf };
