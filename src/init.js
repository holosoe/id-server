import fs from "fs";
import assert from "assert";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize } from "zokrates-js";
import { logWithTimestamp, hash } from "./utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;
if (process.env.ENVIRONMENT == "dev") mongoose.set("debug", true);

function validateEnv() {
  assert.ok(process.env.PRIVATE_KEY, "PRIVATE_KEY environment variable is not set");
  assert.ok(process.env.ADDRESS, "ADDRESS environment variable is not set");

  assert.ok(
    process.env.HOLONYM_ISSUER_PRIVKEY,
    "HOLONYM_ISSUER_PRIVKEY environment variable is not set"
  );

  assert.ok(process.env.ENVIRONMENT, "ENVIRONMENT environment variable is not set");
  assert.ok(process.env.NODE_ENV, "NODE_ENV environment variable is not set");

  assert.ok(
    process.env.VOUCHED_PUBLIC_KEY,
    "VOUCHED_PUBLIC_KEY environment variable is not set"
  );
  assert.ok(
    process.env.VOUCHED_PRIVATE_KEY,
    "VOUCHED_PRIVATE_KEY environment variable is not set"
  );

  assert.ok(
    process.env.VERIFF_PUBLIC_API_KEY,
    "VERIFF_PUBLIC_API_KEY environment variable is not set"
  );
  assert.ok(
    process.env.VERIFF_SECRET_API_KEY,
    "VERIFF_SECRET_API_KEY environment variable is not set"
  );

  assert.ok(
    process.env.MONGO_DB_CONNECTION_STR,
    "MONGO_DB_CONNECTION_STR environment variable is not set"
  );

  if (process.env.NODE_ENV !== "development") {
    assert.ok(process.env.BUCKET_NAME, "BUCKET_NAME environment variable is not set");
    assert.ok(
      process.env.MONGO_CERT_FILE_NAME,
      "MONGO_CERT_FILE_NAME environment variable is not set"
    );
    assert.ok(
      process.env.AWS_ACCESS_KEY_ID,
      "AWS_ACCESS_KEY_ID environment variable is not set"
    );
    assert.ok(
      process.env.AWS_SECRET_ACCESS_KEY,
      "AWS_SECRET_ACCESS_KEY environment variable is not set"
    );
    assert.ok(
      process.env.ADMIN_EMAILS,
      "ADMIN_EMAILS environment variable is not set"
    );
    assert.ok(
      process.env.SENDGRID_API_KEY,
      "SENDGRID_API_KEY environment variable is not set"
    );
  }
}

async function initializeDailyVerificationCount(DailyVerificationCount) {
  const DailyverificationCountCollection = await DailyVerificationCount.find();
  if (DailyverificationCountCollection.length == 0) {
    const url = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp = await axios.get(url, {
      headers: { "X-API-Key": process.env.VOUCHED_PRIVATE_KEY },
    });
    const vouchedJobCount = resp.data?.total || 0;
    // TODO: Get total Veriff verifications
    // TODO: Get total iDenfy verifications
    const newDailyVerificationCount = new DailyVerificationCount({
      date: new Date().toISOString().slice(0, 10),
      vouched: {
        jobCount: vouchedJobCount,
      },
      veriff: {
        sessionCount: 0,
      },
      idenfy: {
        sessionCount: 0,
      },
    });
    await newDailyVerificationCount.save();
  }
}

async function initializeDailyVerificationDeletions(DailyVerificationDeletions) {
  const DailyVerificationDeletionsCollection = await DailyVerificationDeletions.find();
  if (DailyVerificationDeletionsCollection.length == 0) {
    const newDailyVerificationDeletions = new DailyVerificationDeletions({
      date: new Date().toISOString().slice(0, 10),
      deletionCount: 0,
    });
    await newDailyVerificationDeletions.save();
  }
}

async function initializeMongoDb() {
  if (process.env.ENVIRONMENT != "dev") {
    // Download certificate used for TLS connection
    try {
      const s3 = new AWS.S3({
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
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
        s3.getObject(params, async (getObjectErr, data) => {
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
                resolve();
              }
              logWithTimestamp(
                "Successfully downloaded certificate for MongoDB connection"
              );
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
      issuedAt: Date,
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
    idenfy: {
      type: {
        sessionCount: Number,
      },
      required: false,
    },
  });
  const DailyVerificationCount = mongoose.model(
    "DailyVerificationCount",
    DailyVerificationCountSchema
  );
  const DailyVerificationDeletionsSchema = new Schema({
    date: {
      type: String, // use: new Date().toISOString().slice(0, 10)
      required: true,
    },
    deletionCount: Number,
  });
  const DailyVerificationDeletions = mongoose.model(
    "DailyVerificationDeletionsSchema",
    DailyVerificationDeletionsSchema
  );
  const VerificationCollisionMetadataSchema = new Schema({
    uuid: String,
    timestamp: Date,
    sessionId: {
      type: String,
      required: false,
    },
    scanRef: {
      type: String,
      required: false,
    },
    uuidConstituents: {
      firstName: {
        populated: Boolean,
      },
      lastName: {
        populated: Boolean,
      },
      postcode: {
        populated: {
          type: Boolean,
          required: false,
        },
      },
      address: {
        populated: {
          type: Boolean,
          required: false,
        },
      },
      dateOfBirth: {
        populated: Boolean,
      },
    },
  });
  const VerificationCollisionMetadata = mongoose.model(
    "VerificationCollisionMetadata",
    VerificationCollisionMetadataSchema
  );
  await initializeDailyVerificationCount(DailyVerificationCount);
  await initializeDailyVerificationDeletions(DailyVerificationDeletions);
  return {
    UserVerifications,
    UserCredentials,
    UserProofMetadata,
    DailyVerificationCount,
    DailyVerificationDeletions,
    VerificationCollisionMetadata,
  };
}

validateEnv();

let UserVerifications,
  UserCredentials,
  UserProofMetadata,
  DailyVerificationCount,
  DailyVerificationDeletions,
  VerificationCollisionMetadata;
initializeMongoDb().then((result) => {
  if (result) {
    UserVerifications = result.UserVerifications;
    UserCredentials = result.UserCredentials;
    UserProofMetadata = result.UserProofMetadata;
    DailyVerificationCount = result.DailyVerificationCount;
    DailyVerificationDeletions = result.DailyVerificationDeletions;
    VerificationCollisionMetadata = result.VerificationCollisionMetadata;
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
  DailyVerificationDeletions,
  VerificationCollisionMetadata,
  zokProvider,
};
