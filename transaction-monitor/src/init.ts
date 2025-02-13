import fs from "fs";
import assert from "assert";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import {
  userVerificationsSchema,
  idvSessionsSchema,
  sessionSchema,
  sessionRefundMutexSchema,
  amlChecksSessionSchema,
} from "./schemas";
import dotenv from "dotenv";
dotenv.config();

// const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;
if (process.env.ENVIRONMENT == "dev") mongoose.set("debug", true);

function validateEnv() {
  // assert.ok(process.env.PRIVATE_KEY, "PRIVATE_KEY environment variable is not set");
  // assert.ok(process.env.ADDRESS, "ADDRESS environment variable is not set");

  assert.ok(
    process.env.HOLONYM_ISSUER_PRIVKEY,
    "HOLONYM_ISSUER_PRIVKEY environment variable is not set"
  );

  assert.ok(process.env.ENVIRONMENT, "ENVIRONMENT environment variable is not set");
  assert.ok(process.env.NODE_ENV, "NODE_ENV environment variable is not set");

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

async function initializeMongoDb() {
  if (process.env.ENVIRONMENT != "dev") {
    // Download certificate used for TLS connection
    try {
      const s3 = new AWS.S3({
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
        },
        region: "us-east-1",
      });
      const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: process.env.MONGO_CERT_FILE_NAME,
      };
      await new Promise<void>((resolve, reject) => {
        console.log("Downloading certificate for MongoDB connection...");
        s3.getObject(params, async (getObjectErr: any, data: any) => {
          if (getObjectErr) reject(getObjectErr);
          const bodyStream = data.Body;
          const bodyAsString = await bodyStream.transformToString();
          fs.writeFile(
            `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME}`,
            bodyAsString,
            (writeFileErr) => {
              if (writeFileErr) {
                console.error(
                  { error: writeFileErr },
                  "Encountered error while trying to write cert file for MongoDB connection."
                );
                return resolve();
              }
              console.log(
                "Successfully downloaded certificate for MongoDB connection"
              );
              resolve();
            }
          );
        });
      });
    } catch (err) {
      console.error(
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
      process.env.MONGO_DB_CONNECTION_STR as string,
      process.env.ENVIRONMENT == "dev" ? {} : mongoConfig
    );
    console.log("Connected to MongoDB database.");
  } catch (err) {
    console.error({ error: err }, "Unable to connect to MongoDB database.");
    return;
  }
//   const UserVerifications = mongoose.model(
//     "UserVerifications",
//     userVerificationsSchema
//   );
//   const IDVSessions = mongoose.model("IDVSessions", idvSessionsSchema);

//   const Session = mongoose.model("Session", sessionSchema);

//   const SessionRefundMutex = mongoose.model(
//     "SessionRefundMutex",
//     sessionRefundMutexSchema
//   );

//   const AMLChecksSession = mongoose.model("AMLChecksSession", amlChecksSessionSchema);

  return {
    // UserVerifications,
    // IDVSessions,
    // Session,
    // SessionRefundMutex,
    // AMLChecksSession,
  };
}

validateEnv();

// let UserVerifications,
//   IDVSessions,
//   Session,
//   SessionRefundMutex,
//   AMLChecksSession;

const UserVerifications = mongoose.model(
    "UserVerifications",
    userVerificationsSchema
);
const IDVSessions = mongoose.model("IDVSessions", idvSessionsSchema);

const Session = mongoose.model("Session", sessionSchema);

const SessionRefundMutex = mongoose.model(
    "SessionRefundMutex",
    sessionRefundMutexSchema
);

const AMLChecksSession = mongoose.model("AMLChecksSession", amlChecksSessionSchema);


initializeMongoDb().then((result) => {
  if (result) {
    console.log("Initialized MongoDB connection");
    // UserVerifications = result.UserVerifications;
    // IDVSessions = result.IDVSessions;
    // Session = result.Session;
    // SessionRefundMutex = result.SessionRefundMutex;
    // AMLChecksSession = result.AMLChecksSession;
  } else {
    console.error("MongoDB initialization failed");
  }
});

export {
  mongoose,
  UserVerifications,
  IDVSessions,
  Session,
  SessionRefundMutex,
  AMLChecksSession,
};
