import { ethers } from "ethers";
import { retry } from "../../../utils/utils.js";
import {
  idvSessionUSDPrice,
  idServerStellarPaymentAddress,
  horizonServer,
} from "../../../constants/misc.js";
import { usdToXLM } from "../../../utils/cmc.js";

async function getTransaction(txHash) {
  return horizonServer.transactions().transaction(txHash).call();
}

/**
 * Check blockchain for tx.
 * - Ensure recipient of tx is id-server's address.
 * - Ensure amount is > desired amount (within 5%).
 * - Ensure tx is confirmed.
 */
async function validateTx(txHash, externalOrderId, desiredAmount) {
  const tx = await retry(
    async () => {
      const result = await getTransaction(txHash);
      if (!result)
        throw new Error(
          `Could not find transaction with txHash ${txHash} on Stellar`
        );
      return result;
    },
    10,
    5000
  );

  // If it's still not found, return an error.
  if (!tx) {
    throw new Error(
      `TX error: Could not find transaction with txHash ${txHash} on Stellar`
    );
  }

  if (!tx.successful) {
    throw new Error('Transaction is not marked successful')
  }

  const operations = await tx.operations()
  const record = operations?.records?.[0]

  if (!record) {
    throw new Error('Transaction has no operation records');
  }

  if (idServerStellarPaymentAddress !== record.to) {
    throw new Error(
      `Invalid transaction recipient. Recipient must be ${idServerStellarPaymentAddress}`
    );
  }

  if (!tx.memo) {
    throw new Error('Invalid transaction memo. No memo found.')
  }

  const memo = '0x' + Buffer.from(tx.memo, 'base64').toString('hex')
  if (!memo) {
    throw new Error
  }

  const externalOrderIdDigest = ethers.utils.keccak256(externalOrderId);
  if (memo !== externalOrderIdDigest) {
    throw new Error('Invalid transaction memo. Memo does not match external order ID.')
  }

  // NOTE: This const must stay in sync with the frontend.
  // We allow a 5% margin of error.
  const expectedAmountInUSD = desiredAmount * 0.95;

  const expectedAmountInToken = await usdToXLM(expectedAmountInUSD);

  if (Number(record.amount) < expectedAmountInToken) {
    throw new Error(
      `Invalid transaction amount. Expected: ${expectedAmountInToken}. Found: ${record.amount}`
    );
  }

  return tx;
}

// /**
//  * Refund 69.1% of the transaction denoted by order.txHash on chain order.chainId.
//  * started off with refundMintFeeOnChain from utils/transactions.js
//  * Sets order.refundTxHash and order.status after successful refund.
//  */
// async function handleRefund(order) {
//   const tx = await getTransaction(order.chainId, order.txHash);
//   const provider = getProvider(order.chainId);

//   if (!tx) {
//     return {
//       status: 404,
//       data: {
//         error: "Could not find transaction with given txHash.",
//       },
//     };
//   }

//   const validTx = await validateTx(
//     order.chainId,
//     order.txHash,
//     order.externalOrderId,
//     idvSessionUSDPrice
//   );
//   const validTxConfirmation = await validateTxConfirmation(validTx);

//   // check if tx is already fulfilled
//   if (order.fulfilled) {
//     return {
//       status: 400,
//       data: {
//         error: "The order has already been fulfilled, cannot refund.",
//       },
//     };
//   }

//   // check if tx is already refunded
//   if (order.refunded) {
//     return {
//       status: 400,
//       data: {
//         error: "The order has already been refunded, cannot refund again.",
//       },
//     };
//   }

//   const wallet = new ethers.Wallet(process.env.PAYMENTS_PRIVATE_KEY, provider);

//   // Refund 50% of the transaction amount. This approximates the mint cost.
//   // const refundAmount = tx.value.mul(5).div(10);
//   // In Feb 2025, we changed the refund amount be the full tx amount.
//   const refundAmount = tx.value

//   // Ensure wallet has enough funds to refund
//   const balance = await wallet.getBalance();
//   if (balance.lt(refundAmount)) {
//     return {
//       status: 500,
//       data: {
//         error:
//           "Wallet does not have enough funds to refund. Please contact support.",
//       },
//     };
//   }

//   const txReq = await wallet.populateTransaction({
//     to: tx.from,
//     value: refundAmount,
//   });

//   // For some reason gas estimates from Fantom are way off. We manually increase
//   // gas to avoid "transaction underpriced" error. Hopefully this is unnecessary
//   // in the future. The following values happened to be sufficient at the time
//   // of adding this block.
//   if (order.chainId === 250) {
//     txReq.maxFeePerGas = txReq.maxFeePerGas.mul(2);
//     txReq.maxPriorityFeePerGas = txReq.maxPriorityFeePerGas.mul(14);

//     if (txReq.maxPriorityFeePerGas.gt(txReq.maxFeePerGas)) {
//       txReq.maxPriorityFeePerGas = txReq.maxFeePerGas;
//     }
//   }

//   const txResponse = await wallet.sendTransaction(txReq);

//   const receipt = await txResponse.wait();

//   return {
//     status: 200,
//     data: {
//       txReceipt: receipt,
//     },
//   };
// }

export {
  getTransaction,
  validateTx,
  // handleRefund,
};
