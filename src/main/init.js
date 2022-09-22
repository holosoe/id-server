import sqlite3 from "sqlite3";
import { LowSync, JSONFileSync } from "lowdb";
import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const redisClient = createClient();
redisClient.on("error", (err) => console.log("Redis Client Error", err));
redisClient
  .connect()
  .then(() => console.log("Connected to redis"))
  .catch((err) => console.log("Redis Client Error", err));

const sqlDb = new sqlite3.Database(process.env.PATH_TO_SQLITE_DB);
sqlDb.serialize(() => {
  const columns = `(tempSecret TEXT, uuid BLOB, inquiryId TEXT)`;
  sqlDb.prepare(`CREATE TABLE IF NOT EXISTS Users ${columns}`).run().finalize();
});

const lowdbAdapter = new JSONFileSync(process.env.PATH_TO_JSON_DB);
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

export { sqlDb, jsonDb, redisClient };
