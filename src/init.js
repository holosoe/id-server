const sqlite3 = require("sqlite3").verbose();
const NodeCache = require("node-cache");
require("dotenv").config();

// NOTE: stdTTL of 10 min might not be enough. User might take >10 min to complete Persona verification
const cache = new NodeCache({ stdTTL: 600, checkperiod: 100 });

const db = new sqlite3.Database(`${__dirname}/../database/db.sqlite3`);
process.on("SIGTERM", () => db.close());
db.serialize(() => {
  /**
   * uuid == hash(user's driver license number)
   * address == blockchain address
   * creds == concatenation of the creds as bytes (see README)
   * secrets == nullifiers for each credential. This is a bytestream, where each secret is 16 bytes
   */
  const columns = "(uuid BLOB, address TEXT, creds BLOB, secrets BLOB)";
  db.prepare(`CREATE TABLE IF NOT EXISTS Users ${columns}`).run().finalize();
});

module.exports = {
  db: db,
  cache: cache,
};
