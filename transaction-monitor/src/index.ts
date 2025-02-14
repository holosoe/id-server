import { ethers } from "ethers";
import { promises as fs } from "fs";
import { JSONFilePreset } from 'lowdb/node'
import { ObjectId } from 'mongodb'
import {
  auroraProvider,
  avalancheProvider,
  baseProvider,
  ethereumProvider,
  fantomProvider,
  idServerPaymentAddress,
  optimismGoerliProvider,
  optimismProvider,
  sessionStatusEnum,
  supportedChainIds,
} from "./constants/misc.js";
import { AMLChecksSession, Session } from "./init.js";
import { handleIdvSessionCreation } from './idv-sessions.js'

const txHashesDbName = "processedTxHashes.json";
const defaultDbValue = ['0x2287db81fb436c58f53c62cb700e7198f99a522fa8352f6cbcbae7e75489bca1']
const moralisApiKey = process.env.MORALIS_API_KEY!

async function isProcessed(hash: string): Promise<boolean> {
  const db = await JSONFilePreset(txHashesDbName, defaultDbValue)
  return db.data.includes(hash)
}

async function setProcessed(hash: string) {
  const db = await JSONFilePreset(txHashesDbName, defaultDbValue)
  await db.update((txHashes: string[]) => txHashes.push(hash))
}

// Mapping chain IDs to their respective providers
const chainProviders: Record<number, ethers.providers.JsonRpcProvider> = {
  1: ethereumProvider,
  10: optimismProvider,
  // 250: fantomProvider, // ignoring fantom for now
  8453: baseProvider,
  43114: avalancheProvider,
  1313161554: auroraProvider,
};

// Function to fetch transactions from the last 48 hours for an address
async function getTransactionsHashesByChainLast48Hrs(ourAddress: string) {
  const chainIds = Object.keys(chainProviders).map(Number);

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const provider = chainProviders[chainId];
      try {
        const latestBlock = await provider.getBlockNumber();
        // TODO: Make this more sophisticated. We can only query 10,000 blocks (for some chains; for others, 
        // it's ~2k) at a time. We should get all blocks within the last 48 hours, and then all blocks 
        // within last year. For now, we just get the last 2,000 blocks.
        const startBlock = latestBlock - 2_000; 
        // const blocksPerDay = 7200; // Approx. 15s per block
        // const startBlock = latestBlock - blocksPerDay * 2; // 48 hours ago

        console.log(
          `Fetching transactions for ${ourAddress} on chain ${chainId} from block ${startBlock} to ${latestBlock}`,
        );

        // Use getLogs() to fetch transactions within the block range
        const logs = await provider.getLogs({
          fromBlock: startBlock,
          toBlock: latestBlock,
          address: ourAddress,
        });

        console.log('logs', logs)

        // Extract transaction hashes from logs
        const txHashes = logs.map((log) => log.transactionHash);

        return { chainId, txHashes };
      } catch (error) {
        console.error(
          `Error fetching transactions from chain ${chainId}:`,
          error,
        );
        return { chainId, txHashes: [] };
      }
    }),
  );

  // Convert results into an object mapping chainId to transaction hashes
  const txHashesByChain: Record<number, string[]> = {};
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      txHashesByChain[result.value.chainId] = result.value.txHashes;
    }
  });

  return txHashesByChain;
}

async function refundUnusedTransaction(
  txHash: string,
  chainId: number,
  to: string,
) {
  try {
    // const apiKey = "OUR_API_KEY";

    // if (apiKey !== process.env.ADMIN_API_KEY_LOW_PRIVILEGE) {
    //   console.error("Invalid API key.");
    //   return;
    // }

    if (!txHash) {
      console.error("No txHash specified.");
      return;
    }

    if (!chainId) {
      console.error("No chainId specified.");
      return;
    }

    if (supportedChainIds.indexOf(chainId) === -1) {
      console.error(`chainId must be one of ${supportedChainIds.join(", ")}`);
      return;
    }

    if (!to) {
      console.error("No 'to' specified.");
      return;
    }

    const session = await Session.findOne({ txHash }).exec();

    if (session) {
      console.error(
        `Transaction ${txHash} is already associated with a session.`,
      );
      return;
    }

    const cleanHandsSession = await AMLChecksSession.findOne({ txHash }).exec();

    if (cleanHandsSession) {
      console.error(
        `Transaction ${txHash} is already associated with a clean hands session.`,
      );
      return;
    }

    // ------------ begin tx validation ------------
    let provider;
    if (chainId === 1) {
      provider = ethereumProvider;
    } else if (chainId === 10) {
      provider = optimismProvider;
    } else if (chainId === 250) {
      provider = fantomProvider;
    } else if (chainId === 8453) {
      provider = baseProvider;
    } else if (chainId === 43114) {
      provider = avalancheProvider;
    } else if (chainId === 1313161554) {
      provider = auroraProvider;
    } else if (process.env.NODE_ENV === "development" && chainId === 420) {
      provider = optimismGoerliProvider;
    } else {
      throw new Error('Invalid chainId');
    }
    // optimismProvider.getLogs
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      console.log(`Could not find ${txHash} on chain ${chainId}.`);
      return;
    }

    if (idServerPaymentAddress !== (tx.to ?? '').toLowerCase()) {
      console.log(
        `Invalid transaction recipient. Recipient must be ${idServerPaymentAddress}`,
      );
      return;
    }

    if (!tx.blockHash || tx.confirmations === 0) {
      console.log(`Transaction ${txHash} has not been confirmed yet.`);
      return;
    }

    // We have commented out the expectedAmount check because ID verification
    // and phone verification are now both $5. Checking the amount will no
    // longer help filter out transactions that were used for phone.
    // const expectedAmountInUSD = 6.0;

    // let expectedAmountInToken;
    // if ([1, 10, 1313161554].includes(chainId)) {
    //   expectedAmountInToken = await usdToETH(expectedAmountInUSD);
    // } else if (chainId === 250) {
    //   expectedAmountInToken = await usdToFTM(expectedAmountInUSD);
    // } else if (chainId === 43114) {
    //   expectedAmountInToken = await usdToAVAX(expectedAmountInUSD);
    // } else if (process.env.NODE_ENV === "development" && chainId === 420) {
    //   expectedAmountInToken = await usdToETH(expectedAmountInUSD);
    // }

    // Round to 18 decimal places to avoid this underflow error from ethers:
    // "fractional component exceeds decimals"
    // const decimals = 18;
    // const multiplier = 10 ** decimals;
    // const rounded = Math.round(expectedAmountInToken * multiplier) / multiplier;

    // const expectedAmount = ethers.utils.parseEther(rounded.toString());

    // if (tx.value.lt(expectedAmount)) {
    //   return res.status(400).json({
    //     error: `Invalid transaction amount. Expected it to be greater than: ${expectedAmount.toString()}. Found: ${tx.value.toString()}. (chain ID: ${chainId})`,
    //   });
    // }

    // ------------ end tx validation ------------

    const priv_key = process.env.PAYMENTS_PRIVATE_KEY;
    if (!priv_key) {
      console.error("No private key found in env.");
      return;
    }
    const wallet = new ethers.Wallet(priv_key, provider);

    // Send 90% of tx.value back to sender. We keep some to cover gas
    const refundAmount = tx.value.mul(9).div(10);

    // Ensure wallet has enough funds to refund
    const balance = await wallet.getBalance();
    if (balance.lt(refundAmount)) {
      console.error("Wallet does not have enough funds to issue refund.");
      return;
    }

    const txReq = await wallet.populateTransaction({
      to: to,
      value: refundAmount,
    });

    // For some reason gas estimates from Fantom are way off. We manually increase
    // gas to avoid "transaction underpriced" error. Hopefully this is unnecessary
    // in the future. The following values happened to be sufficient at the time
    // of adding this block.
    if (chainId === 250) {
      //   txReq.maxFeePerGas = txReq.maxFeePerGas.mul(2);
      //   txReq.maxPriorityFeePerGas = txReq.maxPriorityFeePerGas.mul(14);

      //   if (txReq.maxPriorityFeePerGas.gt(txReq.maxFeePerGas)) {
      //     txReq.maxPriorityFeePerGas = txReq.maxFeePerGas;
      //   }

      console.error("Fantom is currently not appliable.");
      return;
    }

    const txResponse = await wallet.sendTransaction(txReq);

    await txResponse.wait();

    // create new session to ensure this transaction cannot be used again
    const newSession = new Session({
      sigDigest: "n/a",
      idvProvider: "n/a",
      status: sessionStatusEnum.REFUNDED,
      txHash,
      chainId,
      refundTxHash: txResponse.hash,
    });
    await newSession.save();

    console.log(
      `Successfully refunded user ${to} for transaction ${txHash} on chain ${chainId}.`,
    );
    return;
  } catch (err) {
    // postEndpointLogger.error({ error: err, errMsg: err.message });
    console.error("An unknown error occurred");
    return;
  }
}

async function getTransaction(chainId: number, txHash: string) {
  const provider = chainProviders[chainId];
  return provider.getTransaction(txHash);
}

// type SessionType = {
//     _id: string;
//     status: keyof typeof sessionStatusEnum;
//     chainId: number;
//     txHash: string;
// }


async function getAuroraTransaction(ourAddress: string) {
  const provider = auroraProvider;
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const timeWindowInSeconds = 48 * 60 * 60; // 48 hours in seconds
  const startTime = currentTime - timeWindowInSeconds;

  let transactions = [];
  let currentBlockNumber = await provider.getBlockNumber();

  while (true) {
    const block = await provider.getBlock(currentBlockNumber);

    if (!block) {
      // console.log("block is null");
      break;
    }
    if (block.timestamp < startTime) {
      // console.log("reached blocks older than the start time");
      break; // Stop when we reach blocks older than the start time
    }
    if (!block.transactions) {
      console.log("block.transactions is null");
      break;
    }
    for (const txHash of block.transactions) {
      // console.log("txHash", txHash);
      try {
        const tx = await provider.getTransaction(txHash);
        if (tx && (tx.to === ourAddress)) {
          // console.log("tx", tx);
          transactions.push(tx);
        }
      } catch (error) {
        console.error(`Error fetching transaction ${txHash}:`, error);
      }
    }

    currentBlockNumber--;
  }

  return transactions;
}


// chainId -> Moralis chain param
const chainIdToMoralisChainParam: Record<number, string> = {
  1: "0x1",             // Ethereum
  10: "0xa",            // Optimism
  // 250: "0xfa",         // Fantom // ? discuss with team as fantom is sonic now 
  8453: "0x2105",         // Base mainnet
  43114: "0xa86a",      // Avalanche C-chain
  // 1313161554: "0x4e454153", // Aurora  // ? moralis does not support this chain
};


async function fetchMoralisTxsForChain({
  address,
  chainId,
  fromDate,
  toDate,
}: {
  address: string;
  chainId: number;
  fromDate: string;
  toDate: string;
}) {
  const chainParam = chainIdToMoralisChainParam[chainId];
  if (!chainParam) {
    console.warn(`ChainId ${chainId} is not mapped or supported by Moralis param`);
    return [];
  }

  let allTxs: any[] = [];
  let cursor = "";
  let page = 0;

  while (true) {

    const url = new URL(`https://deep-index.moralis.io/api/v2.2/${address}`);
    url.searchParams.set("chain", chainParam);
    url.searchParams.set("order", "DESC");
    url.searchParams.set("from_date", fromDate);
    url.searchParams.set("to_date", toDate);

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        "X-API-Key": moralisApiKey,
        "accept": "application/json",
      },
    });

    if (!resp.ok) {
      console.error(
        `Moralis request failed (chainId=${chainId}): ${resp.status} ${resp.statusText}`,
      );
      break;
    }

    const data = await resp.json();
    if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
      // No more transactions to page through
      break;
    }

    // Add them to our array
    // Attach chainId manually 
    for (const tx of data.result) {
      tx.chainId = chainId;
    }
    allTxs.push(...data.result);

    // If Moralis provides a next cursor, use it
    // If there's no cursor, we've fetched everything
    if (data.cursor) {
      cursor = data.cursor;
    } else {
      break;
    }

    page++;
  }

  return allTxs;
}

async function getLast48HoursTxs(ourAddress: string) {
  const chainIds = Object.keys(chainIdToMoralisChainParam).map(Number);

  // Build date range for the last 48 hours
  // Moralis typically accepts YYYY-MM-DD or full ISO date strings
  const now = new Date();
  const fromDate = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const toDate = now.toISOString();

  const txsByChain: Record<number, any[]> = {};
  const allTxs: any[] = [];

  for (const chainId of chainIds) {
    try {
      const chainTxs = await fetchMoralisTxsForChain({
        address: ourAddress,
        chainId,
        fromDate,
        toDate,
      });
      txsByChain[chainId] = chainTxs;
      allTxs.push(...chainTxs);
      console.log(
        `Fetched ${chainTxs.length} txs on chain ${chainId} from Moralis in last 48 hrs.`,
      );
    } catch (err) {
      console.error(`Error fetching chain ${chainId}:`, err);
      txsByChain[chainId] = [];
    }
  }

  // // aurora
  // const auroraTxs = await getAuroraTransaction(ourAddress);
  // console.log(
  //   `Fetched ${auroraTxs.length} txs on chain 1313161554 from Aurora in last 48 hrs.`,
  // );
  // txsByChain[1313161554] = auroraTxs;
  // allTxs.push(...auroraTxs);

  return { allTxs, txsByChain };

}



async function main() {
  const ourAddress = "0xdcA2e9AE8423D7B0F94D7F9FC09E698a45F3c851".toLowerCase();
  console.log('getting transaction hashes')
  const transactionHashesByChain =
    await getTransactionsHashesByChainLast48Hrs(ourAddress);

  // console.log("Fetching transactions from Moralis for last 48 hours...");
  const { allTxs, txsByChain } = await getLast48HoursTxs(ourAddress);
  console.log("Total TXs across all chains:", allTxs.length);

  // Now write allTxs to a JSON file
  // await fs.writeFile("allTxs.json", JSON.stringify(allTxs, null, 2), "utf8");
  // console.log('Wrote "allTxs.json" with all transactions.');

  // const allTxsFromFile = await fs.readFile("allTxs.json", "utf8");
  // if (!allTxsFromFile) {
  //   console.error('Could not read "allTxs.json"');
  //   return;
  // }
  // const allTxsFromFileParsed = JSON.parse(allTxsFromFile);
  // console.log('allTxsFromFileParsed.length', allTxsFromFileParsed.length)

  console.log('getting sessions')
  
  //get all sessions within last 72 hours
  const now = new Date();
  const threeDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)
  const objectId = new ObjectId(Math.floor(threeDaysAgo.getTime() / 1000).toString(16) + "0000000000000000");
  const allSessions = await Session.find({
    _id: {
      $gte: objectId
    }
  }).exec();

  console.log('allSessions.length', allSessions.length)

  console.log('processing transactions')

  // for (const tx of allTxsFromFileParsed) {
  for (let i = 0; i < allTxs.length; i++) {
    console.log('i', i)
    const tx = allTxs[i]

    // Print progress at 10% intervals
    if (i % (allTxs.length / 10) === 0) {
      console.log(`Processing transaction ${i} of ${allTxs.length}`);
    }

    const txHash = tx.hash
    const chainId = tx.chainId
    if (await isProcessed(txHash)) {
      continue;
    }

    for (let session of allSessions) {
      // console.log('processing transaction', txHash, 'and session', session._id)
      const digest = ethers.utils.keccak256("0x" + session._id);

      if (tx.to_address !== ourAddress || tx.input !== digest) {
        continue;
      }

      // If the session is already associated with some other transaction, and if
      // this transaction's data matches this session ID, then we know that this transaction
      // was a retry and should be refunded.
      if (session.txHash && (session.txHash.toLowerCase() !== tx.hash.toLowerCase())) {
        console.log(`REFUNDING: Refunding transaction ${txHash} on chain ${chainId} for session ${session}`);
        await refundUnusedTransaction(
          tx.hash,
          tx.chainId,
          tx.from_address,
        );

        await setProcessed(txHash);
      }

      if (session.status === sessionStatusEnum.NEEDS_PAYMENT) {
        console.log(`SET IN_PROGRESS: Using transaction ${txHash} on chain ${chainId} for session ${session}`);
        session.status = sessionStatusEnum.IN_PROGRESS;
        session.chainId = tx.chainId;
        session.txHash = tx.hash;
        await handleIdvSessionCreation(session)
        await session.save();

        await setProcessed(txHash);
      }
    }
  }
}

main()
  .then(() => {
    console.log('done')
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })