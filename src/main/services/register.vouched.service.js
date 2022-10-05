import axios from "axios";
import { createHash, randomBytes } from "crypto";
import express, { response } from "express";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import config from "../../../config.js";
import { sequelize, redisClient } from "../init.js";
import { createLeaf } from "../../zok/JavaScript/zokWrapper.js";
import {
  getLastZeroed,
  getVerificationCount,
  setVerificationCountToZero,
  incrementVerificationCount,
} from "../utils/dbWrapper.js";
import { assertSignerIsAddress, sign, getDaysSinceNewYear } from "../utils/utils.js";
import {
  stdTTL,
  dummyUserCreds,
  stateAbbreviations,
  countryCodeToPrime,
} from "../utils/constants.js";
import { assert } from "console";

const personaHeaders = {
  headers: {
    Authorization: `Bearer ${process.env.PERSONA_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Persona-Version": "2021-05-14",
    "Key-Inflection": "camel", // get response in camelCase
  },
};

const threeZeroedBytes = Buffer.concat([Buffer.from("")], 3);

/**
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
    daysBuffer = Buffer.alloc(1, daysSinceNewYear);
  }

  return Buffer.concat([yearsBuffer, daysBuffer], 3);
}

/**
 * Convert state (e.g., "California") to a hex string representation of its abbreviation.
 */
function getStateAsBytes(state) {
  if (!state) {
    return "0x" + new TextEncoder("utf-8").encode("").toString().replaceAll(",", "");
  }
  state = stateAbbreviations[state.toUpperCase()];
  return "0x" + new TextEncoder("utf-8").encode(state).toString().replaceAll(",", "");
}

function handleVerificationCount() {
  if (getLastZeroed() < new Date().getMonth()) {
    setVerificationCountToZero();
  }
  incrementVerificationCount();
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
  countryBuffer.writeUInt16BE(creds.countryCode || 0);
  const leafAsStr = await createLeaf(
    Buffer.from(serverAddress.replace("0x", ""), "hex"),
    Buffer.from(secret.replace("0x", ""), "hex"),
    countryBuffer,
    getStateAsBytes(creds.subdivision), // 2 bytes
    creds.completedAt ? getDateAsBytes(creds.completedAt) : threeZeroedBytes,
    creds.birthdate ? getDateAsBytes(creds.birthdate) : threeZeroedBytes
  );
  const leaf = ethers.utils.arrayify(ethers.BigNumber.from(leafAsStr));
  console.log("signing leaf")
  return await sign(leaf);
}

async function getVouchedJob(jobID) {
  try {
    const resp = await axios.get(`https://verify.vouched.id/api/jobs?id=${jobID}`, 
      { headers: {  "X-API-Key" : process.env.VOUCHED_PRIVATE_KEY } }
    );

    assert(resp.data.items.length == 1, `There should only be one job with ID ${jobID}`);
    return resp.data.items[0];
  } catch (err) {
      console.error(`Error getting job with ID ${jobID}`, err)
      return {};
  }
}

async function redactVouchedJob(jobID) {
  console.error("redactVouchedJob: not implemented yet");
  return;
  // try {
  //   const inqResp = await axios.delete(
  //     `https://withpersona.com/api/v1/inquiries/${inqId}`,
  //     personaHeaders
  //   );
  //   return inqResp.data;
  // } catch (err) {
  //   return {};
  // }
}

// async function getPersonaVerification(verId) {
//   try {
//     const verResp = await axios.get(
//       `https://withpersona.com/api/v1/verifications/${verId}`,
//       personaHeaders
//     );
//     return verResp.data;
//   } catch (err) {
//     return {};
//   }
// }

// async function redactPersonaInquiry(inqId) {
//   try {
//     const inqResp = await axios.delete(
//       `https://withpersona.com/api/v1/inquiries/${inqId}`,
//       personaHeaders
//     );
//     return inqResp.data;
//   } catch (err) {
//     return {};
//   }
// }

/**
 * End helper functions
 * ---------------------------------------------------
 * Persona verification
 */

// Create inquiry for user's gov id. Return inquiry id
// async function startPersonaInquiry(req, res) {
//   console.log(`${new Date().toISOString()} startPersonaInquiry: entered`);
//   handleVerificationCount();
//   if (getVerificationCount() >= 500) {
//     return res
//       .status(503)
//       .json({ error: "We cannot service any more verifications this month." });
//   }
//   if (!req.query.address || !req.query.signature) {
//     return res.status(400).json({ error: "Missing argument(s)" });
//   }
//   const address = req.query.address.toLowerCase();
//   const userSignature = req.query.signature;
//   const secretMessage = await redisClient.get(address);
//   if (!secretMessage) {
//     console.log(
//       `${new Date().toISOString()} startPersonaInquiry: secret message expired. Exiting.`
//     );
//     return res
//       .status(400)
//       .json({ error: "Temporary secret expired. Please try again." });
//   }
//   if (!assertSignerIsAddress(secretMessage, userSignature, address)) {
//     console.log(
//       `${new Date().toISOString()} startPersonaInquiry: signer != address. Exiting.`
//     );
//     return res.status(400).json({ error: "signer != address" });
//   }

//   const payload = {
//     data: {
//       attributes: {
//         "inquiry-template-id": "itmpl_q7otFYTBCsjBXCcNfcvw42QU", // Government ID template
//         "redirect-uri": `${config.THIS_URL}/register/redirect/`, // Persona redirects user to "<redirect-uri>/redirect"
//       },
//     },
//   };
//   const resp = await axios.post(
//     "https://withpersona.com/api/v1/inquiries",
//     payload,
//     personaHeaders
//   );
//   const inqId = resp.data.data.id;
//   await redisClient.set(inqId, address, { EX: stdTTL });
//   return res.redirect(`https://withpersona.com/verify?inquiry-id=${inqId}`);
// }

/**
 * After completing Persona inquiry, user should be redirected to this function.
 * This function gets the newly created data from Persona.
 */
// async function acceptVouchedResult(req, res) {
//   console.log(`${new Date().toISOString()} acceptVouchedResult: entered`);
//   const body = req?.body;
//   const jobID = body?.id;
//   if (!(body && jobID)) {
//     return res.status(400).json({ error: "No job found." });
//   }
  
//   // const inquiry = await getPersonaInquiry(inqId);

//   // Assert job complete
//   if (body.status !== "completed") {
//     console.error(
//       `${new Date().toISOString()} acceptVouchedResult: job status is not completed`
//     );
//     return res.status(400).json({ error: "job status !== completed" });
//   }

//   // const verifications = inquiry["data"]["relationships"]["verifications"];
//   // const verId = verifications["data"][0]["id"];
//   // const verification = await getPersonaVerification(verId);
//   // const verAttrs = verification["data"]["attributes"];

//   // Assert verifcation passed
//   if (!body.result.success) {
//     console.log(
//       `${new Date().toISOString()} acceptVouchedResult: success is ${result.success}`
//     );
//     return res.status(400).json({ error: "verification failed" });
//   }

//   const address = await redisClient.get(inqId);
//   const tempSecret = await redisClient.get(address);
//   const uuidConstituents =
//     (body.result.firstName || "") +
//     // (verAttrs.nameMiddle || "") +
//     (body.result.lastName || "") +
//     // (body.result.country || "") +
//     // (verAttrs.addressStreet1 || "") +
//     // (verAttrs.addressStreet2 || "") +
//     // (verAttrs.addressCity || "") +
//     // (verAttrs.addressSubdivision || "") +
//     (body.result.idAddress.postalCode || "") +
//     (body.result.dob || ""); // Date of birth
//   const uuid = hash(Buffer.from(uuidConstituents));

//   if (process.env.ENVIRONMENT != "dev" && process.env.ENVIRONMENT != "alpha") {
//     const user = await sequelize.models.User.findOne({
//       where: {
//         uuid: uuid,
//       },
//     });
//     if (user) {
//       console.log(
//         `${new Date().toISOString()} acceptVouchedResult: User has already registered. Exiting.`
//       );
//       return res.status(400).json({ error: "User has already registered" });
//     }
//   }

//   await sequelize.models.User.create({
//     uuid: uuid,
//     jobID: jobID,
//     tempSecret: tempSecret,
//   });
  
//   // console.log(
//   //   `${new Date().toISOString()} acceptPersonaRedirect: Redirecting user to frontend`
//   // );
//   // return res.redirect(`${config.FRONT_END_ORIGIN}/zk-id/verified`);
// }

/**
 * Allows user to retrieve their Vouched verification info
 */
async function acceptFrontendRedirect(req, res) {
  console.log(`${new Date().toISOString()} acceptFrontendRedirect: Entered`);
  // Not needed anymore:
  // const tempSecret = req.query.secret;
  // if (!tempSecret || tempSecret.includes(" ")) {
  //   console.log(
  //     `${new Date().toISOString()} acceptFrontendRedirect: Invalid secret. Secret: ${tempSecret}`
  //   );
  //   return res.status(400).json({ error: "Invalid secret." });
  // }

  // // Get user's info from db
  // // Remove from return value the fields user doesn't need
  // const user = await sequelize.models.User.findOne({
  //   where: {
  //     tempSecret: tempSecret,
  //   },
  // });
  // if (!user) {
  //   console.log(
  //     `${new Date().toISOString()} acceptFrontendRedirect: Could not find user. Exiting.`
  //   );
  //   return res.status(400).json({ error: "Could not find user" });
  // }
  // const uuid = user.uuid;
  // user.tempSecret = undefined;
  // user.uuid = undefined;

  if(!req?.query?.jobID) {
    console.log(
          `${new Date().toISOString()} acceptFrontendRedirect: No job specified.`
        );
        return res.status(400).json({ error: "No job specified" });
  }
  const job = await getVouchedJob(req.query.jobID);

  // Assert job complete
  if (job.status !== "completed") {
    console.log(
      `${new Date().toISOString()} acceptFrontendRedirect: job status is ${job.status}`
    );
    return res.status(400).json({ error: "job status is not completed" });
  }

  // Assert verifcation passed
  if (!job.result.success) {
    console.log(
      `${new Date().toISOString()} acceptVouchedResult: success is ${job.result?.success}`
    );
    return res.status(400).json({ error: "verification failed" });
  }
  // Get UUID
  const uuidConstituents =
  (job.result.firstName || "") +
  (job.result.lastName || "") +
  // (job.result.country || "") +
  (job.result.idAddress.postalCode || "") +
  (job.result.dob || ""); // Date of birth

  console.log("finding uuid")
  const uuid = hash(Buffer.from(uuidConstituents));

  // Assert user hasn't registered yet
  if (process.env.ENVIRONMENT != "dev" && process.env.ENVIRONMENT != "alpha") {
    console.log("finding one in databse")
    const user = await sequelize.models.User.findOne({
      where: {
        uuid: uuid,
      },
    });
    if (user) {
      console.log(
        `${new Date().toISOString()} acceptVouchedResult: User has already registered. Exiting.`
      );
      return res.status(400).json({ error: "User has already registered" });
    }
  
}

console.log("creating one in database")
// Create new user
await sequelize.models.User.create({
  uuid: uuid,
  jobID: req.query.jobID,
  tempSecret: "", //No longer used
});

  // Get each credential
  let birthdate_ = job.result?.dob.split("/")
  const realCreds = {
    countryCode: countryCodeToPrime[job.result.country] || 0,
    subdivision: job.result?.state || "",
    completedAt: job.updatedAt?.split("T")[0] || "",
    birthdate: [birthdate_[2], birthdate_[0], birthdate_[1]].join("-") || "",
  };

  const creds =
    process.env.ENVIRONMENT == "dev" || process.env.ENVIRONMENT == "alpha"
      ? dummyUserCreds
      : realCreds;

  const secret = generateSecret();
  console.log("generating signature")
  const signature = await generateSignature(creds, secret);

  const completeUser = {
    // credentials from Persona
    ...creds,
    // server-generated secrets
    secret: secret,
    // server-generated signature
    signature: signature,
  };

  // No longer needed:
  // // Delete user's tempSecret from db
  // // Keep uuid to prevent sybil attacks
  // await sequelize.models.User.update(
  //   {
  //     tempSecret: "",
  //   },
  //   {
  //     where: {
  //       uuid: uuid,
  //     },
  //   }
  // );
  await redactVouchedJob(req.query.jobID);

  return res.status(200).json({ user: completeUser });
}

export { acceptFrontendRedirect };
