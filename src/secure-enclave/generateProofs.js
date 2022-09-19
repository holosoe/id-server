import assert from "assert";
import { randomBytes, webcrypto } from "crypto";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
// import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";
import holoMerkleUtils from "holo-merkle-utils";
const { Tree } = holoMerkleUtils;
import { chunk } from "../zok/JavaScript/zokUtils.js";
import {
  poseidonHash,
  createLeaf,
  addLeaf,
  proveKnowledgeOfPreimageOfMemberLeaf,
} from "../zok/JavaScript/zokWrapper.js";
import dotenv from "dotenv";
dotenv.config();

// NOTE: privateKey and publicKey are for tests only. Use AWS KMS for production
const maxEncryptableLength = 446;
const privateKey = {
  key_ops: ["decrypt"],
  ext: true,
  kty: "RSA",
  n: "wZQBp5vWiFTU9ORIzlySpULJQB7XuZIZ46CH3DKweg-eukKfU1YGX8H_aNLFzDThSR_Gv7xnZ2AfoN_-EAqrLGf0T310j-FfAbe5JUMvxrH02Zk5LhZw5tu5n4XEJRHIAqJPUy_0vFS4-zfmGLIDpDgidRFh8eg_ghTEkOWybe99cg2qo_sa1m-ANr5j4qzpUFnOjZwvaWyhmBdlu7gtOC15BRwBP97Rp0bNeGEulEpoxPtks8XjgWXJ4MM7L8m2SkyHOTKGrrTXmAStvlbolWnq27S1QqTznMec4s2r9pUpfNwQGbbi7xTruTic-_zuvcvYqJwx-mpG7EQrwNIFK2KvM1PogezS6_2zYRy2uQTqpsLTEsaP-o-J4cylWQ3fikGh2EShzVKhgr1DWOy2Bmv9pZq5C7R_5OpApfwvTt3lFAWFjOez0ggHM9UbuKuUNay_D4bTEOaupBzDbkrn1hymgFuQtO97Wh6bFQKTHqpFiEy-LbPkoTKq6K0wNzsTne8-laBOPpYzTgtV9V_XFnR7EjsAYOaqLYU2pnr8UrhcMqsY1AIQDWvKqKMzDo25g6wQFtYnKQ8xEnVC1pT2P4Dt3Fx4Y6Uzg866rifn7MRpZBfXc5vsOnN46rSQLksWJrt8noxEbBGzi7Qi67O9EE9gWYSW2vWp3N6v81Isx9k",
  e: "AQAB",
  d: "uYR28YLQX2etj-UYQW1GvUr8RI9Kf3YdiaFXkxihONmvbSJcPym6ghsSBAu7tLEZF1N0zlxpXREqPqtseUNAORaHdYbuJtX-j07cCXISX4I8_i1yN1EacqUxiEhSapRX8u5Kx5a2Hae0gE5aHmC8TK3fmAJIs-W4t5nfqF36WpGiz6N5Xh5Q4iGJ5u0gHSVJlM_8vIpqhcauN2x0-yrPa39o9BSavfN1SbL5R90bHtMRBXdIU2HbXy-GAfoYxvux0BL3pUFfAiAeXnpdaIUx8b_IbTcKYAxlzGMhX9tsaq0ZTag5Zet4IVkTcDdpe7Yzt4Gc6jqHS05_Gf9bTzf36qmhNuifsbpitBiC-HvunCkT2lOmfKNg5Ns0pTv5IvejTY_6tjUAinoILgcpFYJrWCZaRhG1E7b9kaYDVcgDDltxip0Rsu4pGpUk-ET7gynjadHo60vSTn-7PVJTkf12c_Bx22gKOg35ruMV4ZW9iNKIGnVgAEzt1OIwLL-tGJ1kcRixWSK3iNhphAki_FJQKb9d3PWFbtqfYYpIfy9gCOMC1TP7OatVEr9MEiDMCXe2zcLg2souH-0qzx6NkfGCf24mT8n3eQg4R3mdq9vyTLGtiwAd4JO4cOlBi_dieIsGPZ7QTkwTV0F18_wtI2eszOa-QQG3p3UIy1Fam-MsuAE",
  p: "4_hPwZpEC6yP8eYssi29sE8o4LnvNbdvJy-8eAm_s2tJVABbqE31CRSlo3vyR6a90zRpLfdtApcTePwYNKEe37d9GHYeshOMoAPLok2GlY-zYqVXH6tth-mHPA-_-yLsp7hQtLdFqp-OnbhMpa-gTkiMtszOyFBXHcjwgUWARj4MDj5LGNs_QTZEzvujDje36XQ1ErRqELZGEAUKFbpyEuEHZBirCCtSsMvwPbmpb2wgmmMQxo4y-1kqPge5s2wt7XfWMSlWkEk3GAoQKSgyABhyDq619bNLdD-G38j4ch-AAkRnnnZ-mLEOFMbYGEAlc7LwzKa25np7fBqNmo1VeQ",
  q: "2WEpgbbWHVMrDotd1PgTEeSNA9fsUkhSS6bNxwA6waF1cfuWkTap2BDj82-za7Mwp_ihCOZg_D-2yaVZdrfudVNbU1TzBQZUN5fg73S4eKkYdQAijZN2Cahl1IkktFxmWOWo8XbrXx_0_j3V-lpaZKhxu3a-gTjJL059qp8QhL4IlMmy9CjExPwjNoUlM4pSL9NkVWIFgkHJOVnf_bMfJGf-vZd3sjHzjBPxHP7hTehplWpA30UN1bceiLKNJtgoyi9wC0JBvmcWzleC_Vq1oZzmw2A8UnuQZXAmImPS1E47XBGm4nNMX31VNp7TUZlVFArlLkRtDEgxcY8M1rpNYQ",
  dp: "xzaYy8A5MlJrv6G68UGTf9zNBgS1iyVvFrlaYzNxuCJLBAMEFcF6HaNTU9feUsrdGxGz0B1lv1uyAomZxXP-_NTllliyXj9DJhnq-zvwHgZjZhLCXcR6hMiICu5gf993GuGwdRuq331rLVx-blNZLM-tV5kGInpChp6vvOe1Pqy98Dxzd5cwYZZA7vdq9-Os7W9FacEK5uvBsgIVXAN_6AuJX-lGnG7vZdvxZp81905v9zoW0Mw2tPqoNWie2LHyOI_-Nxu-r3urj3BLywt7FiZGlZoLHFi_2SgifrCqm1_3hwOr4Qf_fQNMIM_ayuZTVBXM46nULvhdrIevsp1LUQ",
  dq: "zUhmbCr_9N2PscKHMBG94I3XZaPJdsL5hJvXhHCBDE6vnJ6cyDG5H2SEAGaiJ7km39l6Ke9184Ev2ymdXPHB7WZ0vjNg9IPPkFiLgVbWxovZntQrzUtOkzxGPfntga4osRbg_nbxO_nv4REAO9aLurcgAIrYySuZQmV7Y1-nt9PGQsxfhRfjCquZjWkbgprDloqpG8DftuztXI21a952MGlNNjoOPWfSuZwzfNBucKZk30diT_bkY8j0ut7zUZWcn6NAykEd2PN9pAsclqnNEPwdKLB_Bt3NtR29xYhDl17xy7aXxQ5hN2Qiztwab9q_b5gCajkQSiL7HmSbGUUCwQ",
  qi: "ODvEylqBCSdyZ6EiPIpovv-mdn8J9xJOdqSry6uxfSyNvahqxpCBwLVGxZC3i_T8yRLdHaTgMEWDW8menacphGBF0cFTA8H7lNJVHWS_296Nf69sEct9n4yTetJPZFxGY0rnCamkjla7bHpkHPMKf-6GcimKQnDCvrk7XWORquElFxAH4iGf2lRMn-OQlaP9eoM1QvbTkSszTmL3Il_v35b1-83RvwF7gY-gGmvv60BYQs-1MrB4kkjxdSRWS7K-M0Rz_NQXFi63fO1_v0PVhG6Awc13TAQE1grzXrJN9CwHuKEAGdlzhea6JgMcqH2pV8NOuGDg69LuBVDuGjtQ3w",
  alg: "RSA-OAEP-256",
};
const publicKey = {
  key_ops: ["encrypt"],
  ext: true,
  kty: "RSA",
  n: "wZQBp5vWiFTU9ORIzlySpULJQB7XuZIZ46CH3DKweg-eukKfU1YGX8H_aNLFzDThSR_Gv7xnZ2AfoN_-EAqrLGf0T310j-FfAbe5JUMvxrH02Zk5LhZw5tu5n4XEJRHIAqJPUy_0vFS4-zfmGLIDpDgidRFh8eg_ghTEkOWybe99cg2qo_sa1m-ANr5j4qzpUFnOjZwvaWyhmBdlu7gtOC15BRwBP97Rp0bNeGEulEpoxPtks8XjgWXJ4MM7L8m2SkyHOTKGrrTXmAStvlbolWnq27S1QqTznMec4s2r9pUpfNwQGbbi7xTruTic-_zuvcvYqJwx-mpG7EQrwNIFK2KvM1PogezS6_2zYRy2uQTqpsLTEsaP-o-J4cylWQ3fikGh2EShzVKhgr1DWOy2Bmv9pZq5C7R_5OpApfwvTt3lFAWFjOez0ggHM9UbuKuUNay_D4bTEOaupBzDbkrn1hymgFuQtO97Wh6bFQKTHqpFiEy-LbPkoTKq6K0wNzsTne8-laBOPpYzTgtV9V_XFnR7EjsAYOaqLYU2pnr8UrhcMqsY1AIQDWvKqKMzDo25g6wQFtYnKQ8xEnVC1pT2P4Dt3Fx4Y6Uzg866rifn7MRpZBfXc5vsOnN46rSQLksWJrt8noxEbBGzi7Qi67O9EE9gWYSW2vWp3N6v81Isx9k",
  e: "AQAB",
  alg: "RSA-OAEP-256",
};
/**
 * @returns {Promise<string>}
 */
async function decryptShard(input) {
  const algo = {
    name: "RSA-OAEP",
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };
  const privateKeyAsCryptoKey = await webcrypto.subtle.importKey(
    "jwk",
    privateKey,
    algo,
    false,
    ["decrypt"]
  );
  const encodedInput = new Uint8Array(JSON.parse(input)).buffer;
  const decryptedShard = await webcrypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKeyAsCryptoKey,
    encodedInput
  );
  const decoder = new TextDecoder("utf-8");
  const decodedMessage = decoder.decode(decryptedShard);
  return decodedMessage;
}
/**
 *
 * @param {*} input
 * @param {*} sharded
 * @returns
 */
async function decrypt(input, sharded) {
  let shards;
  if (sharded) {
    // Re-stringify the singly nested arrays
    shards = JSON.parse(input).map((shard) => JSON.stringify(shard));
  } else {
    shards = [input];
  }
  const decryptedShards = [];
  for (const shard of shards) {
    const decryptedShard = await decryptShard(shard);
    decryptedShards.push(decryptedShard);
  }
  return decryptedShards.join("");
}

/**
 * @typedef UserProofs
 * @property {Object} leafProof Proof needed to add leaf to merkle tree // TODO: Should be of type string
 * @property {Object} residenceProof Proof that countryCode in leaf == "US" // TODO: Should be of type string
 * @property {string} newSecret Encrypted secret
 */

const unitedStatesCredsBuffer = Buffer.from("00".repeat(26) + "0002", "hex");

// Handling params for merkle proof in proofOfKnowledgeOfPreimage:
// User only provides creds + secret.
// Server provides all leaves and root.
// Secure enclave determines path + directionSelector.

/**
 * Proof for Lobby3.
 * Generate a proof that creds==2 (2 represents "US").
 * NOTE: Not generic. Only supports case where creds == 2.
 * TODO: Make it generic.
 * @param {number} countryCode
 * @param {string} subdivision
 * @param {number} completedAt
 * @param {number} birthdate
 * @param {string} secret 16-byte hex string
 * @param {Array} merkleProof Nested array. Output of holo-merkle-utils.createSerializedProof
 * @returns {Promise<Proof>} Encrypted proof // TODO: write typedef for this proof
 */
async function genKnowledgeOfPreimageProof(
  countryCode,
  subdivision,
  completedAt,
  birthdate,
  secret,
  merkleProof
) {
  assert.equal(countryCode, 2, "User is not a US resident");
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const secretAsBuffer = Buffer.from(secret.replace("0x", ""), "hex");
  const countryCodeAsBuffer = Buffer.alloc(2);
  countryCodeAsBuffer.writeUInt16BE(countryCode || 0);
  const subdivisionAsBuffer = Buffer.from(subdivision);
  const completedAtAsBuffer = Buffer.from(completedAt.replace("0x", ""), "hex");
  const birthdateAsBuffer = Buffer.from(birthdate.replace("0x", ""), "hex");

  const proofOfKnowledgeOfPreimage = await proveKnowledgeOfPreimageOfMemberLeaf(
    serverAddress,
    countryCodeAsBuffer,
    subdivisionAsBuffer,
    completedAtAsBuffer,
    birthdateAsBuffer,
    secretAsBuffer,
    merkleProof
  );

  // TODO: Encrypt proofs with user's public key // Use AWS KMS and ACM

  return {
    proofOfKnowledgeOfPreimage: proofOfKnowledgeOfPreimage,
  };
}

/**
 * Generate an addLeaf proof.
 * @param {number} countryCode
 * @param {string} subdivision
 * @param {string} completedAt 3-byte hex string
 * @param {string} birthdate 3-byte hex string
 * @param {string} secret 16-byte hex string
 * @returns {Promise<UserProofs>} Encrypted proofs and newSecret
 */
async function genAddLeafProof(
  countryCode,
  subdivision,
  completedAt,
  birthdate,
  secret
) {
  const serverAddress = Buffer.from(process.env.ADDRESS.replace("0x", ""), "hex");
  const secretAsBuffer = Buffer.from(secret.replace("0x", ""), "hex");
  const countryCodeAsBuffer = Buffer.alloc(2);
  countryCodeAsBuffer.writeUInt16BE(countryCode || 0);
  const subdivisionAsBuffer = Buffer.from(subdivision);
  const completedAtAsBuffer = Buffer.from(completedAt.replace("0x", ""), "hex");
  const birthdateAsBuffer = Buffer.from(birthdate.replace("0x", ""), "hex");
  const signedLeaf = await createLeaf(
    serverAddress,
    secretAsBuffer,
    countryCodeAsBuffer,
    subdivisionAsBuffer,
    completedAtAsBuffer,
    birthdateAsBuffer
  );
  const newSecretAsBuffer = randomBytes(16);

  // Generate addLeaf proof
  const addLeafProof = await addLeaf(
    signedLeaf,
    serverAddress,
    secretAsBuffer,
    newSecretAsBuffer,
    countryCodeAsBuffer,
    subdivisionAsBuffer,
    completedAtAsBuffer,
    birthdateAsBuffer
  );

  // TODO: Encrypt proofs with user's public key // Use AWS KMS and ACM

  return {
    addLeafProof: addLeafProof,
    newSecret: newSecretAsBuffer.toString("hex"),
  };
}

async function handler(argv) {
  const proofType = argv.proofType;
  const encryptedArgs = argv.args;
  const sharded = argv.sharded?.toLowerCase() == "true"; // whether the encrypted args were encrypted in shards

  // TODO: Decrypt with AWS KMS
  const decryptedArgs = await decrypt(encryptedArgs, sharded);
  const decryptedArgsJson = JSON.parse(decryptedArgs);

  if (proofType == "addLeaf") {
    const { countryCode, subdivision, completedAt, birthdate, secret } =
      decryptedArgsJson;
    const proof = await genAddLeafProof(
      countryCode,
      subdivision,
      completedAt,
      birthdate,
      secret
    );
    console.log(JSON.stringify(proof));
  } else if (proofType == "proveKnowledgeOfPreimageOfMemberLeaf") {
    const { countryCode, subdivision, completedAt, birthdate, secret, merkleProof } =
      decryptedArgsJson;
    const poKoP = await genKnowledgeOfPreimageProof(
      countryCode,
      subdivision,
      completedAt,
      birthdate,
      secret,
      merkleProof
    );
    console.log(JSON.stringify(poKoP));
  }

  // console.log(proofs);
}

const argv = yargs(hideBin(process.argv)).command(
  "$0 <proofType> <args> <sharded>",
  "Generate proofs",
  () => {},
  handler
).argv;
