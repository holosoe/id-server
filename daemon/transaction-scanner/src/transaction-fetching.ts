import { ethers } from "ethers";
import {
  auroraProvider,
  avalancheProvider,
  baseProvider,
  ethereumProvider,
  fantomProvider,
  idServerPaymentAddress,
  optimismGoerliProvider,
  optimismProvider,
  supportedChainIds,
} from "./constants/misc.js";
import { logAndPersistLogUpdate } from './logger.js';

const moralisApiKey = process.env.MORALIS_API_KEY!

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

        logAndPersistLogUpdate(
          `Fetching transactions for ${ourAddress} on chain ${chainId} from block ${startBlock} to ${latestBlock}`,
        );

        // Use getLogs() to fetch transactions within the block range
        const logs = await provider.getLogs({
          fromBlock: startBlock,
          toBlock: latestBlock,
          address: ourAddress,
        });

        logAndPersistLogUpdate('logs', logs)

        // Extract transaction hashes from logs
        const txHashes = logs.map((log) => log.transactionHash);

        return { chainId, txHashes };
      } catch (error) {
        logAndPersistLogUpdate(
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


async function getLast24HoursOfAuroraTransactions(ourAddress: string) {
  const provider = auroraProvider;
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const timeWindowInSeconds = 24 * 60 * 60; // 24 hours in seconds
  const startTime = currentTime - timeWindowInSeconds;

  let transactions = [];
  let currentBlockNumber = await provider.getBlockNumber();

  while (true) {
    const block = await provider.getBlock(currentBlockNumber);

    if (!block) {
      // logAndPersistLogUpdate("block is null");
      break;
    }
    if (block.timestamp < startTime) {
      // logAndPersistLogUpdate("reached blocks older than the start time");
      break; // Stop when we reach blocks older than the start time
    }
    if (!block.transactions) {
      logAndPersistLogUpdate("block.transactions is null");
      break;
    }
    for (const txHash of block.transactions) {
      // logAndPersistLogUpdate("txHash", txHash);
      try {
        const tx = await provider.getTransaction(txHash);
        if (tx && (tx.to === ourAddress)) {
          // logAndPersistLogUpdate("tx", tx);
          transactions.push(tx);
        }
      } catch (error) {
        logAndPersistLogUpdate(`Error fetching transaction ${txHash}:`, error);
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

export async function fetchMoralisTxsForChain({
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
      logAndPersistLogUpdate(
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

export async function getLast24HoursTxs(ourAddress: string) {
  const chainIds = Object.keys(chainIdToMoralisChainParam).map(Number);

  // Build date range for the last 24 hours
  // Moralis typically accepts YYYY-MM-DD or full ISO date strings
  const now = new Date();
  // TODO: !!! Change this back to 24 hours
  // const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const fromDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // Last 10 days
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
      logAndPersistLogUpdate(
        `Fetched ${chainTxs.length} txs on chain ${chainId} from Moralis in last 24 hrs.`,
      );
    } catch (err) {
      logAndPersistLogUpdate(`Error fetching chain ${chainId}:`, err);
      txsByChain[chainId] = [];
    }
  }

  // Ignore aurora for now. Very few users use it.
  // Also note that the transaction object returned by moralis is different than a
  // transaction object returned by ethers
  // // aurora
  // const auroraTxs = await getLast24HoursOfAuroraTransactions(ourAddress);
  // logAndPersistLogUpdate(
  //   `Fetched ${auroraTxs.length} txs on chain 1313161554 from Aurora in last 24 hrs.`,
  // );
  // txsByChain[1313161554] = auroraTxs;
  // allTxs.push(...auroraTxs);

  return { allTxs, txsByChain };
}
