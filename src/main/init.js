import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { Sequelize, DataTypes } from "sequelize";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import config from "../../config.js";
import { mockSequelize } from "./utils/utils.js";
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
      console.log("process.env.BUCKET_NAME:", process.env.BUCKET_NAME);
      console.log(
        "process.env.MONGO_CERT_FILE_NAME:",
        process.env.MONGO_CERT_FILE_NAME
      );
      const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: process.env.MONGO_CERT_FILE_NAME,
      };
      await new Promise((resolve, reject) => {
        console.log("downloading cert...");
        s3.getObject(params, (getObjectErr, data) => {
          if (getObjectErr) reject(getObjectErr);
          console.log("writing cert to disk...");
          fs.writeFile(
            `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME}`,
            data.Body,
            (writeFileErr) => {
              if (writeFileErr) {
                console.log("encountered error writing cert to disk,", writeFileErr);
                reject(writeFileErr);
              }
              console.log(
                `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME} has been created`
              );
              // DEBUGGING BLOCK
              console.log(
                `${__dirname}/../../${process.env.MONGO_CERT_FILE_NAME} contents...`
              );
              console.log(data.Body);
              // END DEBUGGING BLOCK
              resolve();
            }
          );
        });
      });

      // DEBUGGING BLOCK
      console.log(`reading files in ${__dirname}`);
      const filesInDir = await new Promise((resolve, reject) => {
        fs.readdir(__dirname, (err, files) => {
          if (err) reject();
          resolve(files);
        });
      });
      console.log(`files in ${__dirname}...`);
      console.log(filesInDir);
      // END DEBUGGING BOCK
    } catch (err) {
      console.log("Unable to download certificate for MongoDB connection.", err);
      return;
    }
  }

  try {
    const mongoConfig = {
      ssl: process.env.ENVIRONMENT != "dev",
    };
    await mongoose.connect(process.env.MONGO_DB_CONNECTION_STR, mongoConfig);
    console.log("Connected to MongoDB database.");
  } catch (err) {
    console.log("Unable to connect to MongoDB database", err);
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
