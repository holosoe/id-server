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
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: config.PATH_TO_SQLITE_DB,
});
sequelize
  .authenticate()
  .then(() => console.log("Connected to SQL database."))
  .catch((err) => console.error("Unable to connect to SQL database:", err));
// Model name == "User". Table name == "Users"
const User = sequelize.define(
  "User",
  {
    uuid: {
      type: DataTypes.BLOB,
      allowNull: false,
      primaryKey: true,
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
