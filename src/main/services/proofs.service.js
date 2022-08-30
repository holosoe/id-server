import express from "express";
import util from "util";
import { exec as nonPromisifiedExec } from "child_process";
const exec = util.promisify(nonPromisifiedExec);

const pyExecutable = process.env.PYTHON_EXECUTABLE;
const enclaveClientScript = process.env.PATH_TO_ENCLAVE_CLIENT_SCRIPT;

/**
 * Takes an encrypted string containing two arguments: creds and secret.
 * Generates addSmallLeaf proof and proof that creds == "US".
 * The encrypted string is sent to the secure enclave where it is decrypted
 * and where the proofs are generated. The proofs are re-encrypted and returned
 * to the requestor.
 * @param {string} args Encrypted string. When decrypted, it is an object containing
 * creds and nullifier.
 */
export async function residenceProof(req, res) {
  console.log(`${new Date().toISOString()} residenceProof: Entered`);

  const args = req.query.args;
  if (!args) {
    return res.status(400).json({ error: `No arguments found in query string.` });
  }

  try {
    // command == python enclave_client.py generate-proofs [some_string]
    const { stdout, stderr } = await exec(
      `${pyExecutable} ${enclaveClientScript} generate-proofs ${args}`
    );

    // (original call to ProofGenerator (for reference))
    // const proofs = await ProofGenerator.generateProofOfResidence(
    //   creds.countryCode,
    //   secrets.countryCodeSecret
    // );

    return res.status(200).json({ data: stdout });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}
