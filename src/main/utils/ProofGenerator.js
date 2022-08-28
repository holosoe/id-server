import { assert } from "console";
import { randomBytes } from "crypto";
import { zokGlobals } from "../init.js";
import { toU32StringArray } from "./utils.js";
import { addLeafSmall, proveResidence } from "./zokWrapper.js";

/**
 * @typedef UserProofs
 * @property {Object} smallLeafProof Proof needed to add small leaf to merkle tree // TODO: Should be of type string
 * @property {Object} residenceProof Proof that creds in small leaf == "US" // TODO: Should be of type string
 * @property {string} newNullifier Encrypted nullifier
 */

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

class ProofGenerator {
  /**
   * Generate a US Proof of Residence.
   * @param {string} creds
   * @param {string} nullifier 16-byte hex string
   * @returns {Promise<UserProofs>} Encrypted proofs and newNullifier
   */
  static async generateProofOfResidence(creds, nullifier) {
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
}

export { ProofGenerator };
