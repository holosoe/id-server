import { ethers } from "ethers";
import { JSONFilePreset } from 'lowdb/node'
import { ObjectId } from 'mongodb'
import logUpdate from "log-update";
import {
  idServerPaymentAddress,
  sessionStatusEnum,
} from "./constants/misc.js";
import { Session } from "./init.js";
import { logAndPersistLogUpdate } from './logger.js';
import { idServerAdmin, phoneServerAdmin } from './admin-calls.js'
import { getAllPhoneSessions } from './dynamodb.js'
import { getLast24HoursTxs } from './transaction-fetching.js'

const txHashesIdServerDbName = "processedTxHashesIdServer.json";
const txHashesPhoneServerDbName = "processedTxHashesIdServer.json";
const defaultDbValue = ['0x2287db81fb436c58f53c62cb700e7198f99a522fa8352f6cbcbae7e75489bca1']

async function isProcessedForIdServer(hash: string): Promise<boolean> {
  const db = await JSONFilePreset(txHashesIdServerDbName, defaultDbValue)
  return db.data.includes(hash)
}

async function setProcessedForIdServer(hash: string) {
  const db = await JSONFilePreset(txHashesIdServerDbName, defaultDbValue)
  await db.update((txHashes: string[]) => txHashes.push(hash))
}

async function isProcessedForPhoneServer(hash: string): Promise<boolean> {
  const db = await JSONFilePreset(txHashesPhoneServerDbName, defaultDbValue)
  return db.data.includes(hash)
}

async function setProcessedForPhoneServer(hash: string) {
  const db = await JSONFilePreset(txHashesPhoneServerDbName, defaultDbValue)
  await db.update((txHashes: string[]) => txHashes.push(hash))
}

// type SessionType = {
//     _id: string;
//     status: keyof typeof sessionStatusEnum;
//     chainId: number;
//     txHash: string;
// }

async function processIdServerTransactions() {
  const ourAddress = idServerPaymentAddress.toLowerCase();
  // logAndPersistLogUpdate('getting transaction hashes')
  // const transactionHashesByChain =
  //   await getTransactionsHashesByChainLast48Hrs(ourAddress);

  logAndPersistLogUpdate("(id-server) Fetching transactions from Moralis for last 24 hours...");
  const { allTxs, txsByChain } = await getLast24HoursTxs(ourAddress);
  logAndPersistLogUpdate("(id-server) Total TXs across all chains:", allTxs.length);

  logAndPersistLogUpdate('(id-server) getting sessions')
  
  //get all sessions within last 24 hours
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const objectId = new ObjectId(Math.floor(twentyFourHoursAgo.getTime() / 1000).toString(16) + "0000000000000000");
  const allSessions = await Session.find({
    _id: {
      $gte: objectId
    }
  }).exec();

  logAndPersistLogUpdate('(id-server) allSessions.length', allSessions.length)

  logAndPersistLogUpdate('(id-server) processing transactions against id-server sessions')

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i]

    // Print progress at 10% intervals
    if (i % (allTxs.length / 10) === 0) {
      logAndPersistLogUpdate(`(id-server) Processing transaction ${i} of ${allTxs.length}`);
    }

    const txHash = tx.hash
    const chainId = tx.chainId
    if (await isProcessedForIdServer(txHash)) {
      continue;
    }

    for (let session of allSessions) {
      try {
        const digest = ethers.utils.keccak256("0x" + session._id);

        if (tx.to_address !== ourAddress || tx.input !== digest) {
          continue;
        }

        // If the session is already associated with some other transaction, and if
        // this transaction's data matches this session ID, then we know that this transaction
        // was a retry and should be refunded.
        if (session.txHash && (session.txHash.toLowerCase() !== tx.hash.toLowerCase())) {
          logAndPersistLogUpdate(`(id-server) REFUNDING: Refunding transaction ${txHash} on chain ${chainId} for session ${JSON.stringify(session)}`);
          const resp = await idServerAdmin.refundUnusedTransaction(tx.hash, tx.chainId, tx.from_address)
          logAndPersistLogUpdate('(id-server) refund response', resp.data)

          await setProcessedForIdServer(txHash);
        }

        if (session.status === sessionStatusEnum.NEEDS_PAYMENT) {
          logAndPersistLogUpdate(`(id-server) SET IN_PROGRESS: Using transaction ${txHash} on chain ${chainId} for session ${JSON.stringify(session)}`);
          await idServerAdmin.createIDVSession(session._id.toString(), txHash, chainId)

          await setProcessedForIdServer(txHash);
        }
      } catch (err) {
        const errMsg = (err as any)?.response?.data ?? (err as any)?.message
        logAndPersistLogUpdate(`(id-server) encountered error for session ${JSON.stringify(session)}`, errMsg)
      }
    }
  }
}

async function processPhoneServerTransactions() {
  const ourAddress = idServerPaymentAddress.toLowerCase();

  logAndPersistLogUpdate("(phone) Fetching transactions from Moralis for last 24 hours...");
  const { allTxs, txsByChain } = await getLast24HoursTxs(ourAddress);
  // const allTxs = [{hash: '0x123', chainId: 1, to_address: '0x123', input: '0x123', from_address: '0x123'}] // for testing
  logAndPersistLogUpdate("(phone) Total TXs across all chains:", allTxs.length);

  logAndPersistLogUpdate("(phone) Getting phone sessions")

  const allPhoneSessions = await getAllPhoneSessions()

  // On Feb 25, 2025, we started using mongodb ObjectIds for phone session IDs. Prior to that,
  // phone sessions did not have any timestamp in them.

  // Filter out sessions that are older than 24 hours
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const phoneSessions = allPhoneSessions.filter((session) => {
    try {
      const oid = new ObjectId(session.id);
      return oid.getTimestamp() >= twentyFourHoursAgo;
    } catch (err) {
      return false;
    }
  })

  logAndPersistLogUpdate('(phone) phoneSessions.length', phoneSessions.length)

  logAndPersistLogUpdate('(phone) processing transactions against phone-number-server sessions')

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i]

    // Print progress at 10% intervals
    if (i % (allTxs.length / 10) === 0) {
      logAndPersistLogUpdate(`(phone) Processing transaction ${i} of ${allTxs.length}`);
    }

    const txHash = tx.hash
    const chainId = tx.chainId
    if (await isProcessedForPhoneServer(txHash)) {
      continue;
    }

    for (const session of phoneSessions) {
      try {
        // Really old phone sessions have session IDs that start with 0x. We don't
        // care about those, so we filter those out.
        if (session.id.startsWith('0x')) {
          continue
        }

        let digest = null
        try {
          digest = ethers.utils.keccak256("0x" + session.id);
        } catch (err) {
          logAndPersistLogUpdate(`(phone) error hashing session id for session ${JSON.stringify(session)}... ${(err as any).message}`)
          continue;
        }

        if (tx.to_address !== ourAddress || tx.input !== digest) {
          continue;
        }

        // If the session is already associated with some other transaction, and if
        // this transaction's data matches this session ID, then we know that this transaction
        // was a retry and should be refunded.
        if (session.txHash && (session.txHash.toLowerCase() !== tx.hash.toLowerCase())) {
          logAndPersistLogUpdate(`(phone) REFUNDING: Refunding transaction ${txHash} on chain ${chainId} for session ${JSON.stringify(session)}`);
          // TODO: Update this. Call endpoint in phone server instead
          const resp = await idServerAdmin.refundUnusedTransaction(tx.hash, tx.chainId, tx.from_address)
          logAndPersistLogUpdate('(phone) refund response', resp.data)

          await setProcessedForPhoneServer(txHash);
        }

        if (session.sessionStatus === sessionStatusEnum.NEEDS_PAYMENT) {
          logAndPersistLogUpdate(`(phone) SET IN_PROGRESS: Using transaction ${txHash} on chain ${chainId} for session ${JSON.stringify(session)}`);
          await phoneServerAdmin.payForSession(session.id.toString(), txHash, chainId)

          await setProcessedForPhoneServer(txHash);
        }
      } catch (err) {
        const errMsg = (err as any)?.response?.data ?? (err as any)?.message
        logAndPersistLogUpdate(`(phone) encountered error for session ${JSON.stringify(session)}`, errMsg)
      }
    }
  }
}

const command = process.argv[2]

if (command === 'id-server') {
  processIdServerTransactions()
    .then(() => {
      logAndPersistLogUpdate('done')
      process.exit(0)
    })
    .catch((err) => {
      logAndPersistLogUpdate(err)
      process.exit(1)
    })
} else if (command === 'phone-number-server') {
  processPhoneServerTransactions()
    .then(() => {
      logAndPersistLogUpdate('done')
      process.exit(0)
    })
    .catch((err) => {
      logAndPersistLogUpdate(err)
      process.exit(1)
    })
} else if (command === 'id-and-phone') {
  await Promise.all([
    processIdServerTransactions(),
    processPhoneServerTransactions()
  ])
  logAndPersistLogUpdate('done')
  process.exit(0)
} else {
  console.log(`unknown command "${command}`)
  process.exit(1)
}

