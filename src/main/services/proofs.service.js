import express from "express";
import util from "util";
import { exec as nonPromisifiedExec } from "child_process";
const exec = util.promisify(nonPromisifiedExec);

const pyExecutable = process.env.PYTHON_EXECUTABLE;
const enclaveClientScript = process.env.PATH_TO_ENCLAVE_CLIENT_SCRIPT;

/**
 * Generates addSmallLeaf proof.
 * The encrypted string is sent to the secure enclave where it is decrypted
 * and where the proof is generated. The proof is re-encrypted and returned
 * to the requestor.
 * @param {string} args Encrypted string. See the proof function for what params
 * need to be present in the decrypted object.
 */
export async function addSmallLeaf(req, res) {
  console.log(`${new Date().toISOString()} addSmallLeaf: entered`);

  const args = req.query.args;
  if (!args) {
    return res.status(400).json({ error: `No arguments found in query string.` });
  }

  try {
    // command == python enclave_client.py generate-proofs [some_string]
    const { stdout, stderr } = await exec(
      `${pyExecutable} ${enclaveClientScript} generate-proof addSmallLeaf ${args} false`
    );
    const parsedStdout = JSON.parse(stdout);

    return res.status(200).json({ data: parsedStdout });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * Generates proveKnowledgeOfPreimageOfMemberLeaf proof.
 * The encrypted string is sent to the secure enclave where it is decrypted
 * and where the proof is generated. The proof is re-encrypted and returned
 * to the requestor.
 * @param {string} args Encrypted string. See the proof function for what params
 * need to be present in the decrypted object.
 */
export async function proveKnowledgeOfPreimageOfMemberLeaf(req, res) {
  console.log(
    `${new Date().toISOString()} proveKnowledgeOfPreimageOfMemberLeaf: entered`
  );

  const { args, sharded } = req.query;
  if (!args || !sharded) {
    return res.status(400).json({ error: `No arguments found in query string.` });
  }

  try {
    // command == python enclave_client.py generate-proofs [some_string]
    const { stdout, stderr } = await exec(
      `${pyExecutable} ${enclaveClientScript} generate-proof proveKnowledgeOfPreimageOfMemberLeaf ${args} ${sharded}`
    );
    const parsedStdout = JSON.parse(stdout);

    return res.status(200).json({ data: parsedStdout });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}
