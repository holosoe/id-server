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
   * secret == nullifier. String. Must be converted to bytes for proofs.
   */
  const credsColumns =
    [
      "firstName",
      "lastName",
      "middleInitial",
      "countryCode",
      "streetAddress1",
      "streetAddress2",
      "city",
      "subdivision",
      "postalCode",
      "completedAt",
      "birthdate",
    ].join(" TEXT, ") + " TEXT";
  const columns = `(tempSecret TEXT, uuid BLOB, address TEXT, secret BLOB, ${credsColumns})`;
  db.prepare(`CREATE TABLE IF NOT EXISTS Users ${columns}`).run().finalize();
});

module.exports = {
  db: db,
  cache: cache,
};
