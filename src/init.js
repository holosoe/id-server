import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize } from "zokrates-js";
import { logWithTimestamp } from "./utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;

async function initializeVerificationCount(VerificationCount) {
  const verificationCountCollection = await VerificationCount.find();
  if (verificationCountCollection.length == 0) {
    const url = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp = await axios.get(url, {
      headers: { "X-API-Key": process.env.VOUCHED_PRIVATE_KEY },
    });
    const vouchedJobCount = resp.data?.total || 0;
    // TODO: Get total Veriff verifications
    const newVerificationCount = new VerificationCount({
      vouched: {
        totalVerifications: vouchedJobCount,
        lastUpdated: Date.now(),
      },
      veriff: {
        totalVerifications: 0,
        lastUpdated: Date.now(),
      },
    });
    await newVerificationCount.save();
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
  const VerificationCountSchema = new Schema({
    vouched: {
      type: {
        // total verifications in Vouched == total number of Vouched jobs
        totalVerifications: Number,
        lastUpdated: Number, // timestamp
      },
      required: false,
    },
    veriff: {
      type: {
        // total verifications in Veriff == total number of Veriff session decisions
        totalVerifications: Number,
        lastUpdated: Number, // timestamp
      },
      required: false,
    },
  });
  const VerificationCount = mongoose.model(
    "VerificationCount",
    VerificationCountSchema
  );
  await initializeVerificationCount(VerificationCount);
  return { UserVerifications, UserCredentials, UserProofMetadata, VerificationCount };
}

let UserVerifications, UserCredentials, UserProofMetadata, VerificationCount;
initializeMongoDb().then((result) => {
  if (result) {
    UserVerifications = result.UserVerifications;
    UserCredentials = result.UserCredentials;
    UserProofMetadata = result.UserProofMetadata;
    VerificationCount = result.VerificationCount;
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
  VerificationCount,
  zokProvider,
};
