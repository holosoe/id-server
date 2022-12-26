import axios from "axios";
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "crypto";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import { UserVerifications } from "../init.js";
import { sign, createLeaf, getDateAsInt, logWithTimestamp } from "../utils/utils.js";
import { newDummyUserCreds, countryCodeToPrime } from "../utils/constants.js";

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
  countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

  return [
    creds.issuer,
    creds.secret,
    "0x" + countryBuffer.toString("hex"),
    creds.derivedCreds.nameDobCitySubdivisionZipStreetHash.value,
    getDateAsInt(creds.rawCreds.completedAt).toString(),
    getDateAsInt(creds.rawCreds.birthdate).toString(),
  ];
}

function validateJob(job, jobID) {
  if (!job) {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: failed to retrieve Vouched job ${jobID}. Exiting.`
    );
    return { error: "Failed to retrieve Vouched job" };
  }
  // Assert job complete
  if (job.status !== "completed") {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: job status is ${job.status}. Exiting.`
    );
    return { error: "Job status is not completed." };
  }
  // Assert verifcation passed
  if (!job.result.success) {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: success is ${job.result?.success}. Exiting.`
    );
    return { error: "Verification failed" };
  }
  // Assert ID not expired
  if (new Date(job.result.expireDate) < new Date()) {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: ID expired. expireDate is ${job.result.expireDate}. Exiting.`
    );
    return { error: "ID expired" };
  }
  // Assert no errors in job
  if (job.result.errors?.length > 0) {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: errors in job (see next log). Exiting.`
    );
    console.log(job.result.errors);
    const errorNames = job.result.errors.map((err) => err.type);
    return { error: `Errors in job: ${errorNames}` };
  }
  return { success: true };
}

function extractCreds(job) {
  const countryCode = countryCodeToPrime[job.result.country];
  assert.ok(countryCode, "Unsupported country");
  let birthdate = job.result?.dob?.split("/");
  if (birthdate?.length == 3) {
    assert.equal(birthdate[2].length, 4, "Birthdate year is not 4 characters"); // Ensures we are placing year in correct location in formatted birthdate
    birthdate = [birthdate[2], birthdate[0], birthdate[1]].join("-");
  } else {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: birthdate == ${birthdate}. Setting birthdate to ""`
    );
    birthdate = "";
  }
  const birthdateBuffer = birthdate ? Buffer.from(birthdate) : Buffer.alloc(1);
  const firstNameStr = job.result?.firstName ? job.result.firstName : "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  const middleNameStr = job.result?.middleName ? job.result.middleName : "";
  const middleNameBuffer = middleNameStr
    ? Buffer.from(middleNameStr)
    : Buffer.alloc(1);
  const lastNameStr = job.result?.lastName ? job.result.lastName : "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  const cityStr = job.result?.idAddress?.city ? job.result.idAddress.city : "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = job.result?.state ? job.result.state : "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  const streetNumber = Number(
    job.result?.idAddress?.streetNumber ? job.result?.idAddress?.streetNumber : 0
  );
  const streetNameStr = job.result?.idAddress?.street
    ? job.result?.idAddress?.street
    : "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  const streetUnit = Number(
    job.result?.idAddress?.unit ? job.result?.idAddress?.unit : 0
  );
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  const zipCode = Number(
    job.result?.idAddress?.postalCode ? job.result.idAddress.postalCode : 0
  );
  const nameDobCitySubStreetZipArgs = [
    nameHash,
    birthdateBuffer,
    cityBuffer,
    subdivisionBuffer,
    zipCode,
    streetHash,
  ].map((x) => ethers.BigNumber.from(x).toString());
  const nameDobCitySubZipStreet = ethers.BigNumber.from(
    poseidon(nameDobCitySubStreetZipArgs)
  ).toString();
  return {
    rawCreds: {
      countryCode: countryCode,
      firstName: firstNameStr,
      middleName: middleNameStr,
      lastName: lastNameStr,
      city: cityStr,
      subdivision: subdivisionStr,
      zipCode: job.result?.idAddress?.postalCode ? job.result.idAddress.postalCode : 0,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: job.updatedAt ? job.updatedAt.split("T")[0] : "",
      birthdate: birthdate,
    },
    derivedCreds: {
      nameDobCitySubdivisionZipStreetHash: {
        value: nameDobCitySubZipStreet,
        derivationFunction: "poseidon",
        inputFields: [
          "derivedCreds.nameHash.value",
          "rawCreds.birthdate",
          "rawCreds.city",
          "rawCreds.subdivision",
          "rawCreds.zipCode",
          "derivedCreds.streetHash.value",
        ],
      },
      streetHash: {
        value: streetHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.streetNumber",
          "rawCreds.streetName",
          "rawCreds.streetUnit",
        ],
      },
      nameHash: {
        value: nameHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.firstName",
          "rawCreds.middleName",
          "rawCreds.lastName",
        ],
      },
    },
    fieldsInLeaf: [
      "issuer",
      "secret",
      "rawCreds.countryCode",
      "derivedCreds.nameDobCitySubdivisionZipStreetHash.value",
      "rawCreds.completedAt",
      "scope",
    ],
  };
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
  countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

  const leafAsBigInt = await createLeaf(
    Buffer.from(serverAddress.replace("0x", ""), "hex"),
    Buffer.from(creds.secret.replace("0x", ""), "hex"),
    countryBuffer,
    creds.derivedCreds.nameDobCitySubdivisionZipStreetHash.value,
    getDateAsInt(creds.rawCreds.completedAt),
    getDateAsInt(creds.rawCreds.birthdate)
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsBigInt));
  return await sign(leaf);
}

async function saveUserToDb(uuid, jobID) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuid: uuid,
      sessionId: jobID,
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    console.log(err);
    console.log(
      "registerVouched/vouchedCredentials: Could not save userVerificationsDoc. Exiting"
    );
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
  logWithTimestamp("registerVouched/vouchedCredentials: Entered");

  if (process.env.ENVIRONMENT == "dev") {
    const creds = newDummyUserCreds;
    creds.issuer = process.env.ADDRESS;
    creds.secret = generateSecret();
    creds.scope = 0;

    logWithTimestamp("registerVouched/vouchedCredentials: Generating signature");
    const signature = await generateSignature(creds);

    const serializedCreds = serializeCreds(creds);

    const response = {
      ...creds, // credentials from Vouched (plus secret and issuer)
      signature: signature, // server-generated signature
      serializedCreds: serializedCreds,
    };
    return res.status(200).json(response);
  }

  if (!req?.query?.jobID) {
    logWithTimestamp("registerVouched/vouchedCredentials: No job specified. Exiting.");
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
    (job.result.idAddress?.postalCode || "") +
    (job.result.dob || ""); // Date of birth
  const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");

  // Assert user hasn't registered yet
  const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
  if (user) {
    logWithTimestamp(
      `registerVouched/vouchedCredentials: User has already registered. Exiting. UUID == ${uuid}`
    );
    return res
      .status(400)
      .json({ error: `User has already registered. UUID: ${uuid}` });
  }

  // Store UUID for Sybil resistance
  logWithTimestamp(`registerVouched/vouchedCredentials: Inserting user into database`);
  const dbResponse = await saveUserToDb(uuid, req.query.jobID);
  if (dbResponse.error) return res.status(400).json(dbResponse);

  const creds = extractCreds(job);
  creds.issuer = process.env.ADDRESS;
  creds.secret = generateSecret();
  creds.scope = 0;

  logWithTimestamp("registerVouched/vouchedCredentials: Generating signature");
  const signature = await generateSignature(creds);

  const serializedCreds = serializeCreds(creds);

  const response = {
    ...creds, // credentials from Vouched (plus secret and issuer)
    signature: signature, // server-generated signature
    serializedCreds: serializedCreds,
  };

  await redactVouchedJob(req.query.jobID);

  logWithTimestamp(
    `registerVouched/vouchedCredentials: Returning user whose UUID is ${uuid}`
  );

  return res.status(200).json(response);
}

export { getCredentials };

// TODO: Perform as many checks as needed.
// TODO: Redact job on error
