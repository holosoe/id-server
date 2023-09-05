import fs from "fs";
import assert from "assert";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize } from "zokrates-js";
import { hash } from "./utils/utils.js";
import logger from "./utils/logger.js";
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
        logger.info("Downloading certificate for MongoDB connection...");
        s3.getObject(params, async (getObjectErr, data) => {
          if (getObjectErr) reject(getObjectErr);
          const bodyStream = data.Body;
          const bodyAsString = await bodyStream.transformToString();
          fs.writeFile(
            `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME}`,
            bodyAsString,
            (writeFileErr) => {
              if (writeFileErr) {
                logger.error(
                  { error: writeFileErr },
                  "Encountered error while trying to write cert file for MongoDB connection."
                );
                return resolve();
              }
              logger.info(
                "Successfully downloaded certificate for MongoDB connection"
              );
              resolve();
            }
          );
        });
      });
    } catch (err) {
      logger.error(
        { error: err },
        "Unable to download certificate for MongoDB connection."
      );
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
    logger.info("Connected to MongoDB database.");
  } catch (err) {
    logger.error({ error: err }, "Unable to connect to MongoDB database.");
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
  // By keeping track of a user's sessions, we can let them start verification
  // and finish issuance in separate browsing sessions, which is useful for
  // handling the delay between when a user submits their documents to the
  // IDV provider and when the provider finishes verifying the documents,
  // which can be up to 20 minutes for iDenfy, for example.
  const idvSessionsSchema = new Schema({
    sigDigest: String,
    // For "verification status" display in frontend, make it conditional on:
    // - Whether the user has govId creds
    // - Status of the *latest* IDV session
    // if (hasGovIdCreds) displayCreds
    // else if (hasIdvSession && successfulSessionExists) display "check email" or link to "finish verification"
    // else if (hasIdvSession) for each idv provider: if user has idv session with provider:
    //                         display status of most recent verification
    // else display nothing
    veriff: {
      type: {
        sessions: [
          {
            sessionId: String,
            createdAt: Date,
          },
        ],
      },
      required: false,
    },
    idenfy: {
      type: {
        sessions: [
          {
            scanRef: String,
            createdAt: Date,
          },
        ],
      },
      required: false,
    },
    onfido: {
      type: {
        checks: [
          {
            check_id: String,
            createdAt: Date,
          },
        ],
      },
      required: false,
    },
  });
  const IDVSessions = mongoose.model("IDVSessions", idvSessionsSchema);

  // Note that IDVSessions is distinct from Session.
  const sessionSchema = new Schema({
    sigDigest: String,
    idvProvider: String,
    // status here is distinct from the status of the IDV session (as
    // provided by the IDV provider). The possible values of status are:
    // 'NEEDS_PAYMENT' | 'IN_PROGRESS' | 'ISSUED' | 'VERIFICATION_FAILED' | 'REFUNDED'
    status: String,
    txHash: {
      type: String,
      required: false,
    },
    chainId: {
      type: Number,
      required: false,
    },
    // Transaction hash of the refund transaction
    refundTxHash: {
      type: String,
      required: false,
    },
    // Veriff sessionId
    sessionId: {
      type: String,
      required: false,
    },
    veriffUrl: {
      type: String,
      required: false,
    },
    // iDenfy scanRef
    scanRef: {
      type: String,
      required: false,
    },
    idenfyAuthToken: {
      type: String,
      required: false,
    },
    // Onfido applicant_id
    applicant_id: {
      type: String,
      required: false,
    },
    // Onfido check_id
    check_id: {
      type: String,
      required: false,
    },
    onfido_sdk_token: {
      type: String,
      required: false,
    },
  });
  const Session = mongoose.model("Session", sessionSchema);

  // TODO: Do not use MongoDB for mutex purposes. Use something like Redis instead.
  const sessionRefundMutexSchema = new Schema({
    // sessionId is NOT a Veriff sessionId. It is the _id of the associated Session.
    sessionId: String,
  });
  const SessionRefundMutex = mongoose.model(
    "SessionRefundMutex",
    sessionRefundMutexSchema
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
    onfido: {
      type: {
        applicantCount: {
          type: Number,
          required: false,
        },
        checkCount: {
          type: Number,
          required: false,
        },
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
    check_id: {
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
    IDVSessions,
    Session,
    SessionRefundMutex,
    UserCredentials,
    UserProofMetadata,
    DailyVerificationCount,
    DailyVerificationDeletions,
    VerificationCollisionMetadata,
  };
}

validateEnv();

let UserVerifications,
  IDVSessions,
  Session,
  SessionRefundMutex,
  UserCredentials,
  UserProofMetadata,
  DailyVerificationCount,
  DailyVerificationDeletions,
  VerificationCollisionMetadata;
initializeMongoDb().then((result) => {
  if (result) {
    logger.info("Initialized MongoDB connection");
    UserVerifications = result.UserVerifications;
    IDVSessions = result.IDVSessions;
    Session = result.Session;
    SessionRefundMutex = result.SessionRefundMutex;
    UserCredentials = result.UserCredentials;
    UserProofMetadata = result.UserProofMetadata;
    DailyVerificationCount = result.DailyVerificationCount;
    DailyVerificationDeletions = result.DailyVerificationDeletions;
    VerificationCollisionMetadata = result.VerificationCollisionMetadata;
  } else {
    logger.error("MongoDB initialization failed");
  }
});

let zokProvider;
initialize().then((provider) => {
  logger.info("Initialized zokProvider");
  zokProvider = provider;
});

export {
  mongoose,
  UserVerifications,
  IDVSessions,
  Session,
  SessionRefundMutex,
  UserCredentials,
  UserProofMetadata,
  DailyVerificationCount,
  DailyVerificationDeletions,
  VerificationCollisionMetadata,
  zokProvider,
};
