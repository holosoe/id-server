const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(`${__dirname}/../database/db.sqlite3`);
process.on('SIGTERM', () => db.close());
db.serialize(() => {
  /**
   * Users table records user's address, their secret, and their Merkle root.
   * 
   * Leaves table records all leaves in the user's Merkle tree. The merkleRoot
   * column in this table serves as a key used to link to the Users table.
   */
  const usersColumns = '(address TEXT, secret BLOB, merkleRoot BLOB)'
  const leavesColumns = '(merkleRoot BLOB, firstName BLOB, lastName BLOB, state BLOB)'

  db.prepare(`CREATE TABLE IF NOT EXISTS Users ${usersColumns}`).run().finalize();
  db.prepare(`CREATE TABLE IF NOT EXISTS Leaves ${leavesColumns}`).run().finalize();
});


module.exports = {
  db: db,
}
