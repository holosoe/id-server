import axios from "axios";
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "crypto";
import express, { response } from "express";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import config from "../../../config.js";
import { sequelize } from "../init.js";
import { createLeaf } from "../../zok/JavaScript/zokWrapper.js";
import { sign, getDateAsBytes, logWithTimestamp } from "../utils/utils.js";
import {
  dummyUserCreds,
  stateAbbreviations,
  countryCodeToPrime,
} from "../utils/constants.js";

const threeZeroedBytes = Buffer.concat([Buffer.from("")], 3);

/**
 * NOTE: Only handles case where countryCode == 2.
 * Convert state (e.g., "California" or "CA") to a hex string representation of its abbreviation.
 */
function getStateAsHexString(state, countryCode) {
  if (!state || countryCode != 2) return "0x";
  state = state.length == 2 ? state : stateAbbreviations[state.toUpperCase()];
  return "0x" + new TextEncoder("utf-8").encode(state).toString().replaceAll(",", "");
}

function hash(data) {
  // returns Buffer
  return createHash("sha256").update(data).digest();
}

function generateSecret(numBytes = 16) {
  return "0x" + randomBytes(numBytes).toString("hex");
}

/**
 * With the server's blockchain account, sign the given credentials.
 * @param creds Object containing a full string representation of every credential.
 * @param {string} secret 16-byte secret represented as a hex string
 * @returns Object containing one smallCreds signature for every
 *          credential and one bigCreds signature.
 */
async function generateSignature(creds, secret) {
  const serverAddress = process.env.ADDRESS;
  let countryBuffer = Buffer.alloc(2);
  countryBuffer.writeUInt16BE(creds.countryCode);
  const leafAsStr = await createLeaf(
    Buffer.from(serverAddress.replace("0x", ""), "hex"),
    Buffer.from(secret.replace("0x", ""), "hex"),
    countryBuffer,
    getStateAsHexString(creds.subdivision, creds.countryCode), // 2 bytes
    creds.completedAt ? getDateAsBytes(creds.completedAt) : threeZeroedBytes,
    creds.birthdate ? getDateAsBytes(creds.birthdate) : threeZeroedBytes
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsStr));
  console.log("signing leaf");
  return await sign(leaf);
}

async function getVouchedJob(jobID) {
  try {
    const testUrl = `http://localhost:3005/vouched/api/jobs?id=${jobID}`;
    const liveUrl = `https://verify.vouched.id/api/jobs?id=${jobID}`;
    const url = process.env.TESTING == "true" ? testUrl : liveUrl;
    console.log("url...");
    console.log(url);
    const resp = await axios.get(url, {
      headers: { "X-API-Key": process.env.VOUCHED_PRIVATE_KEY },
    });

    assert.equal(
      resp.data.items.length,
      1,
      `There should be exactly one job with ID ${jobID}`
    );
    return resp.data.items[0];
  } catch (err) {
    console.error(`Error getting job with ID ${jobID}`, err);
    return {};
  }
}

async function redactVouchedJob(jobID) {
  try {
    const testUrl = `http://localhost:3005/vouched/api/jobs?id=${jobID}`;
    const liveUrl = `https://verify.vouched.id/api/jobs/${jobID}`;
    const url = process.env.TESTING == "true" ? testUrl : liveUrl;
    const resp = await axios.delete(url, {
      headers: {
        "X-API-Key": process.env.VOUCHED_PRIVATE_KEY,
        Accept: "application/json",
      },
    });
    return resp.data;
  } catch (err) {
    return {};
  }
}

/**
 * End helper functions
 * ---------------------------------------------------
 * Vouched verification
 */

/**
 * Allows user to retrieve their Vouched verification info
 */
async function getCredentials(req, res) {
  logWithTimestamp("getCredentials: Entered");

  if (!req?.query?.jobID) {
    logWithTimestamp("getCredentials: No job specified. Exiting.");
    return res.status(400).json({ error: "No job specified" });
  }
  const job = await getVouchedJob(req.query.jobID);
  // TODO: Check for errors, warnings, expireDate in the returned job object

  if (!job) {
    logWithTimestamp(
      `getCredentials: failed to retrieve Vouched job ${req.query.jobID}. Exiting.`
    );
    return res.status(400).json({ error: "Failed to retrieve Vouched job" });
  }

  // Assert job complete
  if (job.status !== "completed") {
    logWithTimestamp(`getCredentials: job status is ${job.status}. Exiting.`);
    return res.status(400).json({ error: "Job status is not completed." });
  }

  // Assert verifcation passed
  if (!job.result.success) {
    logWithTimestamp(`getCredentials: success is ${job.result?.success}. Exiting.`);
    return res.status(400).json({ error: "Verification failed" });
  }

  // Get UUID
  const uuidConstituents =
    (job.result.firstName || "") +
    (job.result.lastName || "") +
    // (job.result.country || "") +
    (job.result.idAddress.postalCode || "") +
    (job.result.dob || ""); // Date of birth

  const uuid = hash(Buffer.from(uuidConstituents));

  // Assert user hasn't registered yet
  if (process.env.ENVIRONMENT != "dev") {
    const user = await sequelize.models.User.findOne({
      where: {
        uuid: uuid,
      },
    });
    if (user) {
      logWithTimestamp(`getCredentials: User has already registered. Exiting.`);
      return res.status(400).json({ error: "User has already registered" });
    }
  }

  // Create new user
  logWithTimestamp(`getCredentials: Inserting user into database`);
  await sequelize.models.User.create({
    uuid: uuid,
    jobID: req.query.jobID,
  });

  // Get each credential
  const countryCode = countryCodeToPrime[job.result.country];
  assert.ok(countryCode, "Unsupported country");
  let birthdate = job.result?.dob?.split("/");
  if (birthdate?.length == 3) {
    assert.equal(birthdate[2].length, 4, "Birthdate year is not 4 characters"); // Ensures we are placing year in correct location in formatted birthdate
    birthdate = [birthdate[2], birthdate[0], birthdate[1]].join("-");
  } else {
    logWithTimestamp(
      `getCredentials: birthdate == ${birthdate}. Setting birthdate to ""`
    );
    birthdate = "";
  }
  const realCreds = {
    countryCode: countryCode,
    subdivision: job.result?.state || "",
    completedAt: job.updatedAt?.split("T")[0] || "",
    birthdate: birthdate,
  };

  const creds = process.env.ENVIRONMENT == "dev" ? dummyUserCreds : realCreds;

  const secret = generateSecret();
  logWithTimestamp("getCredentials: Generating signature");
  const signature = await generateSignature(creds, secret);

  const completeUser = {
    // credentials from Vouched
    ...creds,
    // server-generated secret
    secret: secret,
    // server-generated signature
    signature: signature,
  };

  await redactVouchedJob(req.query.jobID);

  return res.status(200).json({ user: completeUser });
}

export { getCredentials };

// TODO: Standardize error handling in this file. When should we return error message to user?
// And when should we simply log the error and return vague message to user?
