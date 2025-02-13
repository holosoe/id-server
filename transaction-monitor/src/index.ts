import { ethers } from "ethers";
import { JSONFilePreset } from 'lowdb/node'
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

const txHashesDbName = "processedTxHashes.json";
const defaultDbValue = ['0x2287db81fb436c58f53c62cb700e7198f99a522fa8352f6cbcbae7e75489bca1']

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

async function main() {
  const ourAddress = "0xdcA2e9AE8423D7B0F94D7F9FC09E698a45F3c851";
  console.log('getting transaction hashes')
  const transactionHashesByChain =
    await getTransactionsHashesByChainLast48Hrs(ourAddress);

  console.log('getting sessions')
  
  const allSessions = await Session.find({}).exec(); //get all sessions

  console.log('processing transaction')

  Object.entries(transactionHashesByChain).forEach(
    async ([chainId, txHashes]) => {
      for (let txHash in txHashes) {
        let fullTransaction;
        if (!isProcessed(txHash)) {
          fullTransaction = await getTransaction(Number(chainId), txHash);
        }
        if (!fullTransaction) {
          continue;
        }

        for (let session of allSessions) {
          const digest = ethers.utils.keccak256("0x" + session._id);

          if (fullTransaction.to !== ourAddress || fullTransaction.data !== digest) {
            continue;
          }

          // If the session is already associated with some other transaction, and if
          // this transaction's data matches this session ID, then we know that this transaction
          // was a retry and should be refunded.
          if (session.txHash && (session.txHash !== fullTransaction.hash)) {
            console.log(`REFUNDING: Refunding transaction ${txHash} on chain ${chainId} for session ${session._id}`);
            // await refundUnusedTransaction(
            //   fullTransaction.hash,
            //   fullTransaction.chainId,
            //   fullTransaction.from,
            // );

            // setProcessed(txHash);
          }

          if (session.status === sessionStatusEnum.NEEDS_PAYMENT) {
            console.log(`SET IN_PROGRESS: Using transaction ${txHash} on chain ${chainId} for session ${session._id}`);
            // const status: keyof typeof sessionStatusEnum = "IN_PROGRESS";
            // session.status = status;
            // session.chainId = fullTransaction.chainId;
            // session.txHash = fullTransaction.hash;
            // await session.save();

            // setProcessed(txHash);
          } 
          // TODO: Probably delete this if block. It's accounted for by the if (session.txHash != txHash) block
          // else if (
          //   session.status === sessionStatusEnum.IN_PROGRESS &&
          //   session.txHash !== fullTransaction.hash
          // ) {
          //   console.log(`REFUNDING: Refunding transaction ${txHash} on chain ${chainId} for session ${session._id}`);
          //   // await refundUnusedTransaction(
          //   //   fullTransaction.hash,
          //   //   fullTransaction.chainId,
          //   //   fullTransaction.from,
          //   // );

          //   // setProcessed(txHash);
          // }
        }
      }
    },
  );
}

main()