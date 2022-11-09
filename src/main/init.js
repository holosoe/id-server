import mysql from "mysql2/promise";
import { Sequelize, DataTypes } from "sequelize";
import mongoose from "mongoose";
import config from "../../config.js";
import { mockSequelize } from "./utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

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
  try {
    await mongoose.connect(process.env.MONGO_DB_CONNECTION_STR);
    console.log("Connected to MongoDB database.");
  } catch (err) {
    console.log("Unable to connect to MongoDB database", err);
  }
  const userCredentialsSchema = new Schema({
    address: String,
    // NOTE: encryptedCredentials is stored as base64 string. Convert back to blob with LitJsSdk.base64StringToBlob()
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
