import axios from "axios";
import { ethers } from "ethers";
import { Session } from "../../init.js";
import { idServerPaymentAddress, sessionStatusEnum } from "../../constants/misc.js";

const optimismProvider = new ethers.providers.AlchemyProvider(
  "optimism",
  process.env.ALCHEMY_APIKEY
);
const optimismGoerliProvider = new ethers.providers.AlchemyProvider(
  "optimism-goerli",
  process.env.ALCHEMY_APIKEY
);
const fantomProvider = new ethers.providers.JsonRpcProvider(
  `https://fantom-rpc.gateway.pokt.network/v1/lb/${process.env.POCKET_NETWORK_APIKEY}`
);

async function usdToETH(usdAmount) {
  const { data } = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=USD"
  );
  const ethPrice = data.ethereum.usd;
  const ethAmount = usdAmount / ethPrice;
  return ethAmount;
}

async function usdToFTM(usdAmount) {
  const { data } = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price?ids=fantom&vs_currencies=USD"
  );
  const fantomPrice = data.fantom.usd;
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
  if (chainId === 10) {
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
  const expectedAmountInUSD = 12.47;

  let expectedAmount;
  if (chainId === 10) {
    const expectedAmountInETH = await usdToETH(expectedAmountInUSD);
    expectedAmount = ethers.utils.parseEther(expectedAmountInETH);
  } else if (chainId === 250) {
    const expectedAmountInFTM = await usdToFTM(expectedAmountInUSD);
    expectedAmount = ethers.utils.parseEther(expectedAmountInFTM.toString());
  } else if (process.env.NODE_ENV === "development" && chainId === 420) {
    expectedAmount = ethers.BigNumber.from("0");
  }

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

async function refundTxSender(session) {
  let provider;
  if (session.chainId === 10) {
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

  // Refund 80.2% of the transaction amount. This approximates the mint cost to
  // a fraction of a cent.
  const refundAmount = tx.value.mul(802).div(1000);

  const txResponse = await wallet.sendTransaction({
    to: tx.from,
    value: refundAmount,
  });

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

export { validateTxForIDVSessionCreation, refundTxSender };
