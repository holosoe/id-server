// const sqlite3 = require("sqlite3").verbose();
import sqlite3 from "sqlite3";
import { LowSync, JSONFileSync } from "lowdb";
import NodeCache from "node-cache";
import dotenv from "dotenv";
dotenv.config();

// NOTE: stdTTL of 10 min might not be enough. User might take >10 min to complete Persona verification
const cache = new NodeCache({ stdTTL: 600, checkperiod: 100 });

const sqlDb = new sqlite3.Database(process.env.PATH_TO_SQLITE_DB);
process.on("SIGTERM", () => sqlDb.close());
sqlDb.serialize(() => {
  /**
   * uuid == hash(user's driver license number)
   * address == blockchain address
   * secret == nullifier. String. Must be converted to bytes for proofs.
   */
  const columns = `(tempSecret TEXT, uuid BLOB, address TEXT, secret TEXT, inquiryId TEXT)`;
  sqlDb.prepare(`CREATE TABLE IF NOT EXISTS Users ${columns}`).run().finalize();
});

const lowdbAdapter = new JSONFileSync(process.env.PATH_TO_JSON_DB);
const jsonDb = new LowSync(lowdbAdapter);
jsonDb.read();
if (!jsonDb.data?.verificationCount) {
  jsonDb.data.verificationCount = 0;
  jsonDb.write();
}
if (!jsonDb.data?.lastZeroed) {
  // The month in which verificationCount was last set to 0
  jsonDb.data.lastZeroed = new Date().getMonth();
  jsonDb.write();
}

export { sqlDb, jsonDb, cache };
