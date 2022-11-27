import axios from "axios";
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "crypto";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { UserVerifications } from "../init.js";
import { sign, createLeaf, getDateAsInt, logWithTimestamp } from "../utils/utils.js";
import { dummyUserCreds, countryCodeToPrime } from "../utils/constants.js";

const vouchedPrivateKey = process.env.VOUCHED_PRIVATE_KEY || "test";

function hash(data) {
  // returns Buffer
  return createHash("sha256").update(data).digest();
}

function generateSecret(numBytes = 16) {
  return "0x" + randomBytes(numBytes).toString("hex");
}

/**
 * Serialize the credentials into the 6 field elements they will be as the preimage to the leaf
 * @param {Object} creds Object containing a full string representation of every credential.
 * @returns 6 string representations of the preimage's 6 field elements, in order
 */
function serializeCreds(creds) {
  let countryBuffer = Buffer.alloc(2);
  countryBuffer.writeUInt16BE(creds.countryCode);

  return [
    creds.issuer,
    creds.secret,
    "0x" + countryBuffer.toString("hex"),
    "0x" + Buffer.from(creds.subdivision).toString("hex"),
    getDateAsInt(creds.completedAt).toString(),
    getDateAsInt(creds.birthdate).toString(),
  ];
}

function validateJob(job, jobID) {
  if (!job) {
    logWithTimestamp(
      `getCredentials: failed to retrieve Vouched job ${jobID}. Exiting.`
    );
    return { error: "Failed to retrieve Vouched job" };
  }
  // Assert job complete
  if (job.status !== "completed") {
    logWithTimestamp(`getCredentials: job status is ${job.status}. Exiting.`);
    return { error: "Job status is not completed." };
  }
  // Assert verifcation passed
  if (!job.result.success) {
    logWithTimestamp(`getCredentials: success is ${job.result?.success}. Exiting.`);
    return { error: "Verification failed" };
  }
  // Assert ID not expired
  if (new Date(job.result.expireDate) < new Date()) {
    logWithTimestamp(
      `getCredentials: ID expired. expireDate is ${job.result.expireDate}. Exiting.`
    );
    return { error: "ID expired" };
  }
  // Assert no errors in job
  if (job.result.errors?.length > 0) {
    logWithTimestamp(`getCredentials: errors in job (see next log). Exiting.`);
    console.log(job.result.errors);
    const errorNames = job.result.errors.map((err) => err.type);
    return { error: `Errors in job: ${errorNames}` };
  }
  return { success: true };
}

/**
 * With the server's blockchain account, sign the given credentials.
 * @param creds Object containing a full string representation of every credential.
 * @returns Object containing one smallCreds signature for every
 *          credential and one bigCreds signature.
 */
async function generateSignature(creds) {
  const serverAddress = process.env.ADDRESS;
  let countryBuffer = Buffer.alloc(2);
  countryBuffer.writeUInt16BE(creds.countryCode);

  const leafAsStr = await createLeaf(
    Buffer.from(serverAddress.replace("0x", ""), "hex"),
    Buffer.from(creds.secret.replace("0x", ""), "hex"),
    countryBuffer,
    "0x" + Buffer.from(creds.subdivision).toString("hex"),
    getDateAsInt(creds.completedAt),
    getDateAsInt(creds.birthdate)
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsStr));
  return await sign(leaf);
}

async function saveUserToDb(uuid, jobID) {
  const userVerificationsDoc = new UserVerifications({
    uuid: uuid,
    jobID: jobID,
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    console.log(err);
    console.log("getCredentials: Could not save userVerificationsDoc. Exiting");
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getVouchedJob(jobID) {
  try {
    const testUrl = `http://localhost:3005/vouched/api/jobs?id=${jobID}`;
    const liveUrl = `https://verify.vouched.id/api/jobs?id=${jobID}`;
    const url = process.env.TESTING == "true" ? testUrl : liveUrl;
    const resp = await axios.get(url, {
      headers: { "X-API-Key": vouchedPrivateKey },
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
  // return;
  try {
    const testUrl = `http://localhost:3005/vouched/api/jobs?id=${jobID}`;
    const liveUrl = `https://verify.vouched.id/api/jobs/${jobID}`;
    const url = process.env.TESTING == "true" ? testUrl : liveUrl;
    const resp = await axios.delete(url, {
      headers: {
        "X-API-Key": vouchedPrivateKey,
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

  if (process.env.ENVIRONMENT == "dev") {
    const creds = dummyUserCreds;
    creds.issuer = process.env.ADDRESS;
    creds.secret = generateSecret();

    logWithTimestamp("getCredentials: Generating signature");
    const signature = await generateSignature(creds);

    const serializedCreds = serializeCreds(creds);

    const completeUser = {
      ...creds, // credentials from Vouched (plus secret and issuer)
      signature: signature, // server-generated signature
      serializedCreds: serializedCreds,
    };
    return res.status(200).json({ user: completeUser });
  }

  if (!req?.query?.jobID) {
    logWithTimestamp("getCredentials: No job specified. Exiting.");
    return res.status(400).json({ error: "No job specified" });
  }
  const job = await getVouchedJob(req.query.jobID);

  // TODO: Check job.result.ipFraudCheck ?

  const validationResult = validateJob(job, req.query.jobID);
  if (validationResult.error) return res.status(400).json(validationResult);

  // Get UUID
  const uuidConstituents =
    (job.result.firstName || "") +
    (job.result.lastName || "") +
    // (job.result.country || "") +
    (job.result.idAddress.postalCode || "") +
    (job.result.dob || ""); // Date of birth
  const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");

  // Assert user hasn't registered yet
  const user = await UserVerifications.findOne({ uuid: uuid }).exec();
  if (user) {
    logWithTimestamp(
      `getCredentials: User has already registered. Exiting. UUID == ${uuid}`
    );
    return res
      .status(400)
      .json({ error: `User has already registered. UUID: ${uuid}` });
  }

  // Store UUID for Sybil resistance
  logWithTimestamp(`getCredentials: Inserting user into database`);
  const dbResponse = await saveUserToDb(uuid, req.query.jobID);
  if (dbResponse.error) return res.status(400).json(dbResponse);

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
  const creds = {
    countryCode: countryCode,
    subdivision: job.result?.state || "",
    completedAt: job.updatedAt?.split("T")[0] || "",
    birthdate: birthdate,
  };
  creds.issuer = process.env.ADDRESS;
  creds.secret = generateSecret();

  logWithTimestamp("getCredentials: Generating signature");
  const signature = await generateSignature(creds);

  const serializedCreds = serializeCreds(creds);

  const completeUser = {
    ...creds, // credentials from Vouched (plus secret and issuer)
    signature: signature, // server-generated signature
    serializedCreds: serializedCreds,
  };

  await redactVouchedJob(req.query.jobID); // TODO: Does this pose an injection risk??

  logWithTimestamp(`getCredentials: Returning user whose UUID is ${uuid}`);

  return res.status(200).json({ user: completeUser });
}

export { getCredentials };

// TODO: Perform as many checks as needed.
// TODO: Redact job on error
