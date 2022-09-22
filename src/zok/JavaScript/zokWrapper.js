/**
 * Wrapper for executing CLI ZoKrates commands on
 * .zok files in the zok/ directory.
 */

import fs from "fs";
import assert from "assert";
import util from "util";
import { ethers } from "ethers";
import zokrates from "zokrates-js";
import { exec as nonPromisifiedExec } from "child_process";
import config from "../../../config.js";
import dotenv from "dotenv";
dotenv.config();
const exec = util.promisify(nonPromisifiedExec);
const { initialize } = zokrates;

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
    const createLeafPath = config.ZOK_PATH_TO_CREATE_LEAF;
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

export { createLeaf };
