const { MerkleTree } = require('merkletreejs')
const crypto = require('crypto')


/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return crypto.createHash('sha256').update(data).digest()
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
  return "NY"
}

/**
 * @param creds Array of credentials to be hashed into Merkle tree
 */
async function generateMerkleTree(creds) {
  const leaves = creds.map(value => hash(value))
  const tree = new MerkleTree(leaves, hash)
  return tree
}

function generateSecret() {
  return crypto.randomBytes(256)
}


async function main() {
  const address = '0x0000000000000000000000000000000000000000'
  const stateOfResidence = await getStateFromVerification({})
  const firstName = 'John'
  const lastName = 'Doe'

  const creds = [stateOfResidence, firstName, lastName]
  const tree = await generateMerkleTree(creds)
  const merkleRoot = tree.getRoot() // as bytes
  const secret = generateSecret() // as bytes

  // pseudocode: 
  // db.insert(address, merkleRoot, secret)
  // db.insert(leaf1, leaf2, leaf3, ...)
  // const encryptedRoot = hash(Buffer.concat([merkleRoot, secret]))
  // return sign(Buffer.concat([address, encryptedRoot]))

  // NOTE: The tree can be reconstructed from its leaves. Just store the leaves


  // console.log(tree)
  // console.log(Object.keys(tree))
  console.log(tree.leaves)
  console.log(tree.getRoot())
  console.log(tree.getLayersAsObject())
  // console.log(tree.getProof(tree.leaves[0]))
  // console.log(Buffer.byteLength(tree.leaves[0]))
}

main()
