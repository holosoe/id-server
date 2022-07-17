const crypto = require("crypto");
const { MerkleTree } = require("merkletreejs");
const dbWrapper = require("./src/utils/dbWrapper");

/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return crypto.createHash("sha256").update(data).digest();
}

// Lobby3/zk Holo Merkel Tree
// Info needed: Name, State,
async function startPersonaInquiry() {
  // TOOD
}

async function getPersonaVerification() {
  // TODO
}

/**
 *
 * @param verification API response from Persona verifications endpoint.
 */
async function getStateFromVerification(verification) {
  return "NY";
}

/**
 * @param creds Array of credentials to be hashed into Merkle tree
 */
async function generateMerkleTree(creds) {
  const leaves = creds.map((value) => hash(value));
  const tree = new MerkleTree(leaves, hash);
  return tree;
}

function generateSecret() {
  return crypto.randomBytes(256);
}

/**
 * Sign data with the server's private key
 */
function sign(data) {
  // TODO...
  return "";
}

async function main() {
  const address = "0x0000000000000000000000000000000000000000";
  const stateOfResidence = await getStateFromVerification({});
  const firstName = "John";
  const lastName = "Doe";

  const creds = [stateOfResidence, firstName, lastName];
  const tree = await generateMerkleTree(creds);
  const merkleRoot = tree.getRoot(); // as bytes
  const secret = generateSecret(); // as bytes

  // Insert info into db
  const user = await dbWrapper.getUserByAddress(address);
  if (!user) {
    const userColumns = "address=?, secret=?, merkleRoot=?";
    const userParams = [address, secret, merkleRoot];
    dbWrapper.runSql(`INSERT Users SET ${userColumns} WHERE address=?`, userParams);
    const leavesColumns = "merkleRoot=?, firstName=?, lastName=?, state=?";
    const leavesParams = [merkleRoot, firstName, lastName, stateOfResidence];
    dbWrapper.runSql(`INSERT Users SET ${leavesColumns} WHERE address=?`, leavesParams);
  }

  // Return server's signature + encrypted root of user's Merkle tree.
  // (This is given to the user.)
  const encryptedRoot = hash(Buffer.concat([merkleRoot, secret]));
  const signature = sign(Buffer.concat([address, encryptedRoot]));
  return { signature, enryptedRoot: encryptedRoot };

  // console.log(tree)
  // console.log(Object.keys(tree))
  console.log(tree.leaves);
  console.log(tree.getRoot());
  console.log(tree.getLayersAsObject());
  // console.log(tree.getProof(tree.leaves[0]))
  // console.log(Buffer.byteLength(tree.leaves[0]))
}

main();
