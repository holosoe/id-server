import axios from "axios";
import { createHash, randomBytes } from "crypto";
import express, { response } from "express";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import config from "../../../config.js";
import { sequelize } from "../init.js";
import { createLeaf } from "../../zok/JavaScript/zokWrapper.js";
import { sign, getDaysSinceNewYear } from "../utils/utils.js";
import {
  dummyUserCreds,
  stateAbbreviations,
  countryCodeToPrime,
} from "../utils/constants.js";
import { strict as assert } from "node:assert";

const threeZeroedBytes = Buffer.concat([Buffer.from("")], 3);

/**
 * TODO: Test this.
 * Convert date string to 3 bytes with the following structure:
 * byte 1: number of years since 1900
 * bytes 2-3: number of days since beginning of the year
 * @param {string} date Must be of form yyyy-mm-dd
 */
function getDateAsBytes(date) {
  const [year, month, day] = date.split("-");
  const yearsSince1900 = parseInt(year) - 1900;
  const daysSinceNewYear = getDaysSinceNewYear(parseInt(month), parseInt(day));

  // Convert yearsSince1900 and daysSinceNewYear to bytes
  const yearsBuffer = Buffer.alloc(1, yearsSince1900);
  let daysBuffer;
  if (daysSinceNewYear > 255) {
    daysBuffer = Buffer.concat([
      Buffer.from([0x01]),
      Buffer.alloc(1, daysSinceNewYear - 256),
    ]);
  } else {
    daysBuffer = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.alloc(1, daysSinceNewYear),
    ]);
    daysBuffer = Buffer.alloc(1, daysSinceNewYear);
  }

  return Buffer.concat([yearsBuffer, daysBuffer], 3);
}

/**
 * NOTE: Only handles case where countryCode == 2.
 * Convert state (e.g., "California" or "CA") to a hex string representation of its abbreviation.
 */
function getStateAsBytes(state, countryCode) {
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
    getStateAsBytes(creds.subdivision, creds.countryCode), // 2 bytes
    creds.completedAt ? getDateAsBytes(creds.completedAt) : threeZeroedBytes,
    creds.birthdate ? getDateAsBytes(creds.birthdate) : threeZeroedBytes
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsStr));
  console.log("signing leaf");
  return await sign(leaf);
}

async function getVouchedJob(jobID) {
  try {
    const resp = await axios.get(`https://verify.vouched.id/api/jobs?id=${jobID}`, {
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
    const resp = await axios.delete(`https://verify.vouched.id/api/jobs/${jobID}`, {
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
async function acceptFrontendRedirect(req, res) {
  console.log(`${new Date().toISOString()} acceptFrontendRedirect: Entered`);

  if (!req?.query?.jobID) {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: No job specified. Exiting.`
    );
    return res.status(400).json({ error: "No job specified" });
  }
  const job = await getVouchedJob(req.query.jobID);

  if (!job) {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: failed to retrieve Vouched job ${
        req.query.jobID
      }. Exiting.`
    );
    return res.status(400).json({ error: "Failed to retrieve Vouched job" });
  }

  // Assert job complete
  if (job.status !== "completed") {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: job status is ${
        job.status
      }. Exiting.`
    );
    return res.status(400).json({ error: "Job status is not completed." });
  }

  // Assert verifcation passed
  if (!job.result.success) {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: success is ${
        job.result?.success
      }. Exiting.`
    );
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
  if (process.env.ENVIRONMENT != "dev" && process.env.ENVIRONMENT != "alpha") {
    const user = await sequelize.models.User.findOne({
      where: {
        uuid: uuid,
      },
    });
    if (user) {
      console.log(
        `${new Date().toISOString()} acceptFrontendRedirect: User has already registered. Exiting.`
      );
      return res.status(400).json({ error: "User has already registered" });
    }
  }

  console.log(
    `${new Date().toISOString()} acceptFrontendRedirect: creating one in database`
  );
  // Create new user
  await sequelize.models.User.create({
    uuid: uuid,
    jobID: req.query.jobID,
  });

  // Get each credential
  const countryCode = countryCodeToPrime[job.result.country];
  assert.ok(countryCode, "Unsupported country");
  let birthdate = job.result?.dob?.split("/");
  if (birthdate?.length == 3) {
    assert.equal(birthdate[2].length, 4, "Birthdate year is not 4 characters");
    birthdate = [birthdate[2], birthdate[0], birthdate[1]].join("-");
  } else {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: birthdate == ${birthdate}. Setting birthdate to ""`
    );
    birthdate = "";
  }
  const realCreds = {
    countryCode: countryCode,
    subdivision: job.result?.state || "",
    completedAt: job.updatedAt?.split("T")[0] || "",
    birthdate: birthdate,
  };

  const creds =
    process.env.ENVIRONMENT == "dev" || process.env.ENVIRONMENT == "alpha"
      ? dummyUserCreds
      : realCreds;

  const secret = generateSecret();
  console.log(
    `${new Date().toISOString()} acceptFrontendRedirect: Generating signature`
  );
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

export { acceptFrontendRedirect };

// TODO: Add something in frontend that, upon error on verified/, says, "Please contact Holonym support <insert email address>"
// TODO: Standardize error handling in this file
