import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize } from "zokrates-js";
import { logWithTimestamp, hash } from "./utils/utils.js";
import dotenv from "dotenv";
import { SALT } from "./utils/constants.js";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;
if (process.env.ENVIRONMENT == "dev") mongoose.set("debug", true);

async function initializeDailyVerificationCount(DailyVerificationCount) {
  const DailyverificationCountCollection = await DailyVerificationCount.find();
  if (DailyverificationCountCollection.length == 0) {
    const url = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp = await axios.get(url, {
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

async function initializeProofClient(ProofClient) {
  if (process.env.ENVIRONMENT == "dev") {
    const passwordDigest = hash(
      Buffer.from(process.env.ADMIN_PASSWORD + SALT)
    ).toString("hex");
    const testClientData = {
      clientId: "0",
      name: "Holonym",
      username: "holonym",
      passwordDigest,
      apiKeys: [{ key: "123", active: true }],
    };
    const testClientDoc = await ProofClient.findOne({
      clientId: testClientData.clientId,
    }).exec();
    if (!testClientDoc) {
      const newProofClient = new ProofClient(testClientData);
      await newProofClient.save();
    }
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
    encryptedCredentials: String,
    encryptedSymmetricKey: String,
  });
  const UserCredentials = mongoose.model("UserCredentials", userCredentialsSchema);
  const userProofMetadataSchema = new Schema({
    sigDigest: String,
    encryptedProofMetadata: String,
    encryptedSymmetricKey: String,
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
  // ProofClients are clients of off-chain proofs
  const ProofClientSchema = new Schema({
    // TODO: What information do we need to do proper accounting for off-chain proofs?
    // We will need more identifying info for each client, but it will depend on what
    // we use to handle payments.
    clientId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    // passwordDigest == sha256(password + salt)
    passwordDigest: {
      type: String,
      required: true,
    },
    // TODO: Implement endpoints for API key management
    apiKeys: {
      type: [
        {
          type: {
            key: {
              type: String,
              required: true,
            },
            active: {
              type: Boolean,
              required: true,
            },
          },
        },
      ],
      required: true,
    },
    // TODO: Add public encryption key for client. This will be used to encrypt
    // proofs sent to client.
  });
  const ProofClient = mongoose.model("ProofClient", ProofClientSchema);
  // ProofSessions are for off-chain proofs
  const ProofSessionSchema = new Schema({
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    createdAt: {
      // UNIX timestamp
      type: Number,
      required: true,
    },
    consumedAt: {
      // UNIX timestamp
      type: Number,
      required: false,
    },
    consumedBy: {
      // IP address
      type: String,
      required: false,
    },
  });
  const ProofSession = mongoose.model("ProofSession", ProofSessionSchema);
  await initializeDailyVerificationCount(DailyVerificationCount);
  await initializeProofClient(ProofClient);
  return {
    UserVerifications,
    UserCredentials,
    UserProofMetadata,
    DailyVerificationCount,
    ProofClient,
    ProofSession,
  };
}

let UserVerifications,
  UserCredentials,
  UserProofMetadata,
  DailyVerificationCount,
  ProofClient,
  ProofSession;
initializeMongoDb().then((result) => {
  if (result) {
    UserVerifications = result.UserVerifications;
    UserCredentials = result.UserCredentials;
    UserProofMetadata = result.UserProofMetadata;
    DailyVerificationCount = result.DailyVerificationCount;
    ProofClient = result.ProofClient;
    ProofSession = result.ProofSession;
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
  ProofClient,
  ProofSession,
  zokProvider,
};
