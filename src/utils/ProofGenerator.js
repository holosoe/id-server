import fs from "fs";
import { assert } from "console";
import util from "util";
import { randomBytes } from "crypto";
import { exec as nonPromisifiedExec } from "child_prcess";
const exec = util.promisify(nonPromisifiedExec);
import { zokGlobals } from "../init";

function assertLengthIs(item, length, itemName) {
  const errMsg = `${itemName} must be ${length} bytes but is ${issuer.length} bytes`;
  assert(item.length == length, errMsg);
}

function toU32Array(bytes) {
  let u32s = chunk(bytes.toString("hex"), 8);
  return u32s.map((x) => parseInt(x, 16));
}
function toU32StringArray(bytes) {
  let u32s = chunk(bytes.toString("hex"), 8);
  return u32s.map((x) => parseInt(x, 16).toString());
}
function chunk(arr, chunkSize) {
  let out = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    out.push(chunk);
  }
  return out;
}
// Expects arguments of type bytes and returns an array of U32s -- all inputs concatenated/flattened, then split up into u32s
// This is how ZoKrates CLI expects arguments
function argsToU32CLIArgs(args) {
  return toU32Array(Buffer.concat(args))
    .map((x) => parseInt(x))
    .join(" ");
}

/**
 * Takes Buffer, properly formats them (according to spec), and returns a hash.
 * See: https://opsci.gitbook.io/untitled/4alwUHFeMIUzhQ8BnUBD/extras/leaves
 * @param {Buffer} issuer Blockchain address of account that issued the credentials
 * @param {Buffer} creds Credentials (e.g., "Alice" or "US")
 * @param {Buffer} secret Hex string representation of 16 bytes
 */
function leafFromData(issuer, creds, secret) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  const paddedCreds = Buffer.concat([creds], 28);
  const { witness, output } = zokGlobals.zokratesProvider.computeWitness(
    zokGlobals.leafgen,
    [issuer, paddedCreds, secret].map((x) => toU32StringArray(x))
  );
  return output;
}

/**
 * @param {Buffer} signedLeaf
 * @param {Buffer} issuer Blockchain address
 * @param {Buffer} creds
 * @param {Buffer} secret
 * @param {Buffer} newSecret
 * @returns {Object} Proof
 */
async function addLeafSmallCLI(signedLeaf, issuer, creds, secret, newSecret) {
  assertLengthIs(signedLeaf, 32, "signedLeaf");
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  const lfd = JSON.parse(leafFromData(issuer, creds, newSecret));
  const newLeaf = Buffer.from(lfd.join("").replaceAll("0x", ""), "hex");
  assertLengthIs(newLeaf, 32, "newLeaf");

  const paddedCreds = Buffer.concat([creds], 28);
  const inFile = process.env.ZOK_PATH_TO_ALS_OUT; // "als.out";
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = process.env.ZOK_DIR_TEMP + "/" + tmpValue + ".als.witness";
  const tmpProofFile = process.env.ZOK_DIR_TEMP + "/" + tmpValue + ".als.proof.json";

  // Execute the command
  try {
    const { stdout, stderr } = await exec(
      `zokrates compute-witness -i ${inFile} -o ${tmpWitnessFile} -a ${argsToU32CLIArgs(
        [signedLeaf, newLeaf, issuer, paddedCreds, secret, newSecret]
      )}; zokrates generate-proof -i ${inFile} -w ${tmpWitnessFile} -j ${tmpProofFile} -p als.proving.key; rm ${tmpWitnessFile}`
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
async function proveResidenceCLI(newLeaf, issuer, creds, newSecret) {
  assertLengthIs(newLeaf, 32, "newLeaf");
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");

  const paddedCreds = Buffer.concat([creds], 28);

  const inFile = process.env.ZOK_PATH_TO_POR_OUT; // "por.out";
  // Create a temporary name for current tasks to be deleted once CLI execution is done:
  const tmpValue = randomBytes(16).toString("hex");
  const tmpWitnessFile = process.env.ZOK_DIR_TEMP + "/" + tmpValue + ".por.witness";
  const tmpProofFile = process.env.ZOK_DIR_TEMP + "/" + tmpValue + ".por.proof.json";

  // Execute the command
  try {
    const { stdout, stderr } = await exec(
      `zokrates compute-witness -i ${inFile} -o ${tmpWitnessFile} -a ${argsToU32CLIArgs(
        [newLeaf, issuer, paddedCreds, newSecret]
      )}; zokrates generate-proof -i ${inFile} -w ${tmpWitnessFile} -j ${tmpProofFile} -p als.proving.key; rm ${tmpWitnessFile}`
    );
  } catch (e) {
    console.error(e);
  }

  // Read the proof file, then delete it, then return it
  const retval = JSON.parse(fs.readFileSync(tmpProofFile));
  exec(`rm ${tmpProofFile}`);
  return retval;
}

class ProofGenerator {
  /**
   * Generate a US Proof of Residence.
   * @param {string} creds
   * @param {string} nullifier 16-byte hex string
   */
  static async generateProofOfResidence(creds, nullifier) {
    const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
    const credsAsBuffer = Buffer.from(creds);
    const nullifierAsBuffer = Buffer.from(nullifier.replace("0x", ""), "hex");
    const signedLeaf = leafFromData(serverAddress, credsAsBuffer, nullifierAsBuffer);
    const newNullifierAsBuffer = randomBytes(16); // TODO: Encrypt newNullifier and send it to user
    const newLeaf = leafFromData(serverAddress, credsAsBuffer, newNullifierAsBuffer);

    // Generate addLeafSmall proof
    const smallLeafProof = await addLeafSmallCLI(
      signedLeaf,
      serverAddress,
      credsAsBuffer,
      nullifierAsBuffer,
      newNullifierAsBuffer
    );
    // TODO: Send proof to user

    const residenceProof = await proveResidenceCLI(
      newLeaf,
      serverAddress,
      credsAsBuffer,
      newNullifierAsBuffer
    );
    // TODO: Send proof to user

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
}

export { ProofGenerator };
