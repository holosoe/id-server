import { ethers } from "ethers";
import { Session } from "../../init.js";
import {
  idServerPaymentAddress,
  sessionStatusEnum,
  ethereumProvider,
  optimismProvider,
  optimismGoerliProvider,
  fantomProvider,
} from "../../constants/misc.js";
import { ethereumCMCID, fantomCMCID } from "../../constants/cmc.js";
import { getLatestCryptoPrice } from "../../utils/cmc.js";

async function usdToETH(usdAmount) {
  const resp = await getLatestCryptoPrice(ethereumCMCID);
  const ethPrice = resp?.data?.data?.[ethereumCMCID]?.quote?.USD?.price;
  const ethAmount = usdAmount / ethPrice;
  return ethAmount;
}

async function usdToFTM(usdAmount) {
  const resp = await getLatestCryptoPrice(fantomCMCID);
  const fantomPrice = resp?.data?.data?.[fantomCMCID]?.quote?.USD?.price;
  const ftmAmount = usdAmount / fantomPrice;
  return ftmAmount;
}

/**
 * Check blockchain for tx.
 * - Ensure recipient of tx is id-server's address.
 * - Ensure amount is > desired amount.
 * - Ensure tx is confirmed.
 */
async function validateTxForIDVSessionCreation(chainId, txHash) {
  let tx;
  if (chainId === 1) {
    tx = await ethereumProvider.getTransaction(txHash);
  } else if (chainId === 10) {
    tx = await optimismProvider.getTransaction(txHash);
  } else if (chainId === 250) {
    tx = await fantomProvider.getTransaction(txHash);
  } else if (process.env.NODE_ENV === "development" && chainId === 420) {
    tx = await optimismGoerliProvider.getTransaction(txHash);
  }

  if (!tx) {
    return {
      status: 400,
      error: "Could not find transaction with given txHash",
    };
  }

  if (idServerPaymentAddress !== tx.to.toLowerCase()) {
    return {
      status: 400,
      error: `Invalid transaction recipient. Recipient must be ${idServerPaymentAddress}`,
    };
  }

  // NOTE: This const must stay in sync with the frontend.
  // We allow a 2% margin of error.
  const expectedAmountInUSD = 10.0 * 0.98;

  let expectedAmountInToken;
  if ([1, 10].includes(chainId)) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  } else if (chainId === 250) {
    expectedAmountInToken = await usdToFTM(expectedAmountInUSD);
  }
  // else if (process.env.NODE_ENV === "development" && chainId === 420) {
  //   expectedAmount = ethers.BigNumber.from("0");
  // }
  else if (process.env.NODE_ENV === "development" && chainId === 420) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  }

  // Round to 18 decimal places to avoid this underflow error from ethers:
  // "fractional component exceeds decimals"
  const decimals = 18;
  const multiplier = 10 ** decimals;
  const rounded = Math.round(expectedAmountInToken * multiplier) / multiplier;

  const expectedAmount = ethers.utils.parseEther(rounded.toString());

  if (tx.value.lt(expectedAmount)) {
    return {
      status: 400,
      error: `Invalid transaction amount. Amount must be greater than ${expectedAmount.toString()} on chain ${chainId}`,
    };
  }

  if (!tx.blockHash || tx.confirmations === 0) {
    return {
      status: 400,
      error: "Transaction has not been confirmed yet.",
    };
  }

  const session = await Session.findOne({ txHash: txHash }).exec();
  if (session) {
    return {
      status: 400,
      error: "Transaction has already been used to pay for a session",
    };
  }

  return {};
}

async function refundMintFee(session, to) {
  let provider;
  if (session.chainId === 1) {
    provider = ethereumProvider;
  } else if (session.chainId === 10) {
    provider = optimismProvider;
  } else if (session.chainId === 250) {
    provider = fantomProvider;
  } else if (process.env.NODE_ENV === "development" && session.chainId === 420) {
    provider = optimismGoerliProvider;
  }

  const tx = await provider.getTransaction(session.txHash);

  if (!tx) {
    return {
      status: 404,
      data: {
        error: "Could not find transaction with given txHash",
      },
    };
  }

  const wallet = new ethers.Wallet(process.env.PAYMENTS_PRIVATE_KEY, provider);

  // Refund 69.1% of the transaction amount. This approximates the mint cost to
  // a fraction of a cent.
  const refundAmount = tx.value.mul(691).div(1000);

  // Ensure wallet has enough funds to refund
  const balance = await wallet.getBalance();
  if (balance.lt(refundAmount)) {
    return {
      status: 500,
      data: {
        error: "Wallet does not have enough funds to refund. Please contact support.",
      },
    };
  }

  const txReq = await wallet.populateTransaction({
    to: to,
    value: refundAmount,
  });

  // For some reason gas estimates from Fantom are way off. We manually increase
  // gas to avoid "transaction underpriced" error. Hopefully this is unnecessary
  // in the future. The following values happened to be sufficient at the time
  // of adding this block.
  if (session.chainId === 250) {
    txReq.maxFeePerGas = txReq.maxFeePerGas.mul(2);
    txReq.maxPriorityFeePerGas = txReq.maxPriorityFeePerGas.mul(14);
  }

  const txResponse = await wallet.sendTransaction(txReq);

  const receipt = await txResponse.wait();

  session.refundTxHash = receipt.transactionHash;
  session.status = sessionStatusEnum.REFUNDED;
  await session.save();

  return {
    status: 200,
    data: {
      txReceipt: receipt,
    },
  };
}

export { validateTxForIDVSessionCreation, refundMintFee };
