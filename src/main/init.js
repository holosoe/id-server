import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { Sequelize, DataTypes } from "sequelize";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import config from "../../config.js";
import { mockSequelize, logWithTimestamp } from "./utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;

// Setup sequelize
async function initializeSequelize() {
  // TODO: Connect to an actual MySQL server within testing environment (e.g., GitHub Actions)
  if (process.env.TESTING == "true") return mockSequelize;

  // Create database if it doesn't exist
  const connection = await mysql.createConnection({
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    host: process.env.MYSQL_HOST,
    port: 3306,
  });
  console.log(`Executing: CREATE DATABASE IF NOT EXISTS ${config.MYSQL_DB_NAME};`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.MYSQL_DB_NAME};`);
  await connection.end();

  const sequelize = new Sequelize(
    config.MYSQL_DB_NAME,
    process.env.MYSQL_USERNAME,
    process.env.MYSQL_PASSWORD,
    {
      host: process.env.MYSQL_HOST,
      dialect: "mysql",
    }
  );
  try {
    await sequelize.authenticate();
    console.log(`Connected to MySQL server at ${process.env.MYSQL_HOST}.`);
  } catch (err) {
    console.error("Unable to connect to MySQL server:", err);
  }

  // Model name == "User". Table name == "Users"
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      uuid: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      // For Vouched
      jobID: {
        type: DataTypes.STRING,
      },
    },
    {
      createdAt: false,
      updatedAt: false,
    }
  );
  sequelize.sync();
  return sequelize;
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
  const userCredentialsSchema = new Schema({
    sigDigest: String,
    // NOTE: encryptedCredentials is stored as base64 string. Use LitJsSdk.base64StringToBlob() to convert back to blob
    encryptedCredentials: String,
    encryptedSymmetricKey: String,
  });
  const UserCredentials = mongoose.model("UserCredentials", userCredentialsSchema);
  return UserCredentials;
}

let sequelize;
initializeSequelize().then((result) => {
  sequelize = result;
});

let UserCredentials;
initializeMongoDb().then((result) => {
  UserCredentials = result;
});

export { sequelize, mongoose, UserCredentials };
