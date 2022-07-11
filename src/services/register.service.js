const crypto = require('crypto')
const { MerkleTree } = require('merkletreejs')
const express = require('express')
const dbWrapper = require('../utils/dbWrapper')

/**
 * Hash function for Merkle tree
 */
function hash(data) {
  // returns Buffer
  return crypto.createHash('sha256').update(data).digest()
}

function generateSecret() {
  return crypto.randomBytes(256)
}

/**
 * Sign data with the server's private key
 */
 function sign(data) {
  // TODO...
  return ''
}

async function startPersonaInquiry() {
  // TOOD
}

async function getPersonaVerification() {
  // TODO
}

/**
 * 
 * @param verification API response from Persona verifications endpoint
 */
async function getStateFromVerification(verification) {
  // TOOD
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

/**
 * Register a user. 
 * Steps: 
 * 1. Have user go through ID verification on Persona
 * 2. Ensure verification checks pass
 * 3. Get user's info from Persona (name, address, etc.)
 * 4. Generate Merkle tree with user's info as leaves
 * 5. Generate secret for the user
 * 6. Store the user's address, secret, Merkle root, and leaves (i.e., hashes of info) in db.
 * 7. Return encrypted Merkle root and server's signature of encrypted Merkle root
 */
async function register(req, res) {
  // TODO: 
  // - Get address from req.query. 
  // - Get user signature from req.query. 
  // - Verify address == signature.
  // - Call Persona API. Have user go through verification process. Then retrieve info.

  const address = '0x0000000000000000000000000000000000000000'
  const stateOfResidence = await getStateFromVerification({})
  const firstName = 'John'
  const lastName = 'Doe'

  // Ensure user hasn't already registered
  const user = await dbWrapper.getUserByAddress(address)
  if (user) {
    return res.status(400).json({ error: 'User has already registered'})
  }

  const creds = [stateOfResidence, firstName, lastName]
  const tree = await generateMerkleTree(creds)
  const merkleRoot = tree.getRoot() // as bytes
  const secret = generateSecret() // as bytes

  // Insert info into db
  const userColumns = 'address=?, secret=?, merkleRoot=?'
  const userParams = [address, secret, merkleRoot]
  dbWrapper.runSql(`INSERT Users SET ${userColumns} WHERE address=?`, userParams)
  const leavesColumns = 'merkleRoot=?, firstName=?, lastName=?, state=?'
  const leavesParams = [merkleRoot, firstName, lastName, stateOfResidence]  
  dbWrapper.runSql(`INSERT Users SET ${leavesColumns} WHERE address=?`, leavesParams)

  // Return server's signature + encrypted root of user's Merkle tree.
  // (This should be given to the user.)
  const encryptedRoot = hash(Buffer.concat([merkleRoot, secret]))
  const signature = sign(Buffer.concat([address, encryptedRoot]))
  return res.status(200).json({signature: signature, enryptedRoot: encryptedRoot})
}

module.exports = {
  register: register
}
