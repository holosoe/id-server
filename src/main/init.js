import { LowSync, JSONFileSync } from "lowdb";
import { createClient } from "redis";
import { Sequelize, DataTypes } from "sequelize";
import config from "../../config.js";
import dotenv from "dotenv";
dotenv.config();

// Setup redis
const redisClient = createClient();
redisClient.on("error", (err) => console.log("Redis Client Error", err));
redisClient
  .connect()
  .then(() => console.log("Connected to redis"))
  .catch((err) => console.log("Redis Client Error", err));

// Setup sequelize
async function initializeSequelize() {
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
    console.log(`Connected to SQL database at ${process.env.MYSQL_HOST}.`);
  } catch (err) {
    console.error("Unable to connect to SQL database:", err);
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
      inquiryId: {
        type: DataTypes.STRING,
      },
      tempSecret: {
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
let sequelize;
initializeSequelize().then((result) => {
  sequelize = result;
});

// Setup jsonDb
const lowdbAdapter = new JSONFileSync(config.PATH_TO_JSON_DB);
const jsonDb = new LowSync(lowdbAdapter);
jsonDb.read();
if (!jsonDb.data) {
  jsonDb.data = {};
  jsonDb.write();
}
if (!jsonDb.data.verificationCount) {
  jsonDb.data.verificationCount = 0;
  jsonDb.write();
}
if (!jsonDb.data?.lastZeroed) {
  // The month in which verificationCount was last set to 0
  jsonDb.data.lastZeroed = new Date().getMonth();
  jsonDb.write();
}

export { sequelize, jsonDb, redisClient };
