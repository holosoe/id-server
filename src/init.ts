import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize } from "zokrates-js";
// @ts-expect-error TS(6133) FIXME: 'hash' is declared but its value is never read.
import { logWithTimestamp, hash } from "./utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;
if (process.env.ENVIRONMENT == "dev") mongoose.set("debug", true);

async function initializeDailyVerificationCount(DailyVerificationCount: $TSFixMe) {
  const DailyverificationCountCollection = await DailyVerificationCount.find();
  if (DailyverificationCountCollection.length == 0) {
    const url = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp = await axios.get(url, {
      // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
      headers: { "X-API-Key": process.env.VOUCHED_PRIVATE_KEY },
    });
    const vouchedJobCount = resp.data?.total || 0;
    // TODO: Get total Veriff verifications
    const newDailyVerificationCount = new DailyVerificationCount({
      date: new Date().toISOString().slice(0, 10),
      vouched: {
        jobCount: vouchedJobCount,
      },
      veriff: {
        sessionCount: 0,
      },
    });
    await newDailyVerificationCount.save();
  }
}

async function initializeMongoDb() {
  if (process.env.ENVIRONMENT != "dev") {
    // Download certificate used for TLS connection
    try {
      const s3 = new AWS.S3({
        credentials: {
          // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        region: "us-east-1",
      });
      const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: process.env.MONGO_CERT_FILE_NAME,
      };
      await new Promise((resolve, reject) => {
        logWithTimestamp("Downloading certificate for MongoDB connection...");
        s3.getObject(params, async (getObjectErr: $TSFixMe, data: $TSFixMe) => {
          if (getObjectErr) reject(getObjectErr);
          const bodyStream = data.Body;
          const bodyAsString = await bodyStream.transformToString();
          fs.writeFile(
            `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME}`,
            bodyAsString,
            (writeFileErr) => {
              console.log("entered writeFile cb");
              if (writeFileErr) {
                console.log("writeFileErr...", writeFileErr);
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
              }
              logWithTimestamp(
                "Successfully downloaded certificate for MongoDB connection"
              );
              // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
              resolve();
            }
          );
        });
      });
    } catch (err) {
      console.log("Unable to download certificate for MongoDB connection.", err);
      return;
    }
  }

  try {
    const mongoConfig = {
      ssl: true,
      sslValidate: true,
      sslCA: `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME}`,
    };
    await mongoose.connect(
      // @ts-expect-error TS(2769) FIXME: No overload matches this call.
      process.env.MONGO_DB_CONNECTION_STR,
      process.env.ENVIRONMENT == "dev" ? {} : mongoConfig
    );
    console.log("Connected to MongoDB database.");
  } catch (err) {
    console.log("Unable to connect to MongoDB database.", err);
    return;
  }
  const userVerificationsSchema = new Schema({
    govId: {
      uuid: String,
      sessionId: String,
    },
  });
  const UserVerifications = mongoose.model(
    "UserVerifications",
    userVerificationsSchema
  );
  const userCredentialsSchema = new Schema({
    proofDigest: String,
    sigDigest: String,
    // NOTE: encryptedCredentials is stored as base64 string. Use LitJsSdk.base64StringToBlob() to convert back to blob
    // For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
    encryptedCredentials: {
      type: String,
      required: false,
    },
    // For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
    encryptedSymmetricKey: {
      type: String,
      required: false,
    },
    encryptedCredentialsAES: {
      type: String,
      required: false,
    },
  });
  const UserCredentials = mongoose.model("UserCredentials", userCredentialsSchema);
  const userProofMetadataSchema = new Schema({
    sigDigest: String,
    encryptedProofMetadata: {
      type: String,
      required: false,
    },
    encryptedSymmetricKey: {
      type: String,
      required: false,
    },
    encryptedProofMetadataAES: {
      type: String,
      required: false,
    },
  });
  const UserProofMetadata = mongoose.model(
    "UserProofMetadata",
    userProofMetadataSchema
  );
  const DailyVerificationCountSchema = new Schema({
    date: {
      type: String, // use: new Date().toISOString().slice(0, 10)
      required: true,
    },
    vouched: {
      type: {
        jobCount: Number,
      },
      required: false,
    },
    veriff: {
      type: {
        // Veriff charges per _decision_. We are tracking sessions since each session
        // can have a decision, and we want to pre-emptively stop serving requests
        // for new sessions in case all current sessions end up with a decision.
        sessionCount: Number,
      },
      required: false,
    },
  });
  const DailyVerificationCount = mongoose.model(
    "DailyVerificationCount",
    DailyVerificationCountSchema
  );
  await initializeDailyVerificationCount(DailyVerificationCount);
  return {
    UserVerifications,
    UserCredentials,
    UserProofMetadata,
    DailyVerificationCount,
  };
}

let UserVerifications, UserCredentials, UserProofMetadata, DailyVerificationCount;
initializeMongoDb().then((result) => {
  if (result) {
    UserVerifications = result.UserVerifications;
    UserCredentials = result.UserCredentials;
    UserProofMetadata = result.UserProofMetadata;
    DailyVerificationCount = result.DailyVerificationCount;
  } else {
    console.log("MongoDB initialization failed");
  }
});

let zokProvider;
initialize().then((provider) => {
  zokProvider = provider;
});

export {
  mongoose,
  UserVerifications,
  UserCredentials,
  UserProofMetadata,
  DailyVerificationCount,
  zokProvider,
};
