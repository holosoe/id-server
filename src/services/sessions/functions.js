import axios from "axios";
import { ethers } from "ethers";
import { Session } from "../../init.js";
import {
  idServerPaymentAddress,
  sessionStatusEnum,
  ethereumProvider,
  optimismProvider,
  optimismGoerliProvider,
  fantomProvider,
  avalancheProvider,
  payPalApiUrlBase,
} from "../../constants/misc.js";
import { ethereumCMCID, fantomCMCID, avalancheCMCID } from "../../constants/cmc.js";
import {
  getAccessToken as getPayPalAccessToken,
  getOrder as getPayPalOrder,
  getRefundDetails as getPayPalRefundDetails,
} from "../../utils/paypal.js";
import { createVeriffSession } from "../../utils/veriff.js";
import { createIdenfyToken } from "../../utils/idenfy.js";
import {
  createOnfidoApplicant,
  createOnfidoSdkToken,
  createOnfidoCheck,
} from "../../utils/onfido.js";
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

async function usdToAVAX(usdAmount) {
  const resp = await getLatestCryptoPrice(avalancheCMCID);
  const avalanchePrice = resp?.data?.data?.[avalancheCMCID]?.quote?.USD?.price;
  const ftmAmount = usdAmount / avalanchePrice;
  return ftmAmount;
}

/**
 * Check blockchain for tx.
 * - Ensure recipient of tx is id-server's address.
 * - Ensure amount is > desired amount.
 * - Ensure tx is confirmed.
 */
async function validateTxForIDVSessionCreation(session, chainId, txHash) {
  let tx;
  if (chainId === 1) {
    tx = await ethereumProvider.getTransaction(txHash);
  } else if (chainId === 10) {
    tx = await optimismProvider.getTransaction(txHash);
  } else if (chainId === 250) {
    tx = await fantomProvider.getTransaction(txHash);
  } else if (chainId === 43114) {
    tx = await avalancheProvider.getTransaction(txHash);
  } else if (process.env.NODE_ENV === "development" && chainId === 420) {
    tx = await optimismGoerliProvider.getTransaction(txHash);
  }

  if (!tx) {
    return {
      status: 400,
      error: "Could not find transaction with given txHash",
    };
  }

  const txReceipt = await tx.wait();

  if (idServerPaymentAddress !== tx.to.toLowerCase()) {
    return {
      status: 400,
      error: `Invalid transaction recipient. Recipient must be ${idServerPaymentAddress}`,
    };
  }

  // NOTE: This const must stay in sync with the frontend.
  // We allow a 5% margin of error.
  const expectedAmountInUSD = 10.0 * 0.95;

  let expectedAmountInToken;
  if ([1, 10].includes(chainId)) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  } else if (chainId === 250) {
    expectedAmountInToken = await usdToFTM(expectedAmountInUSD);
  } else if (chainId === 43114) {
    expectedAmountInToken = await usdToAVAX(expectedAmountInUSD);
  }
  // else if (process.env.NODE_ENV === "development" && chainId === 420) {
  //   expectedAmount = ethers.BigNumber.from("0");
  // }
  else if (process.env.NODE_ENV === "development" && chainId === 420) {
    expectedAmountInToken = await usdToETH(expectedAmountInUSD);
  }

  if (!txReceipt.blockHash || txReceipt.confirmations === 0) {
    return {
      status: 400,
      error: "Transaction has not been confirmed yet.",
    };
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
      error: `Invalid transaction amount. Expected: ${expectedAmount.toString()}. Found: ${tx.value.toString()}. (chain ID: ${chainId})`,
    };
  }

  const sidDigest = ethers.utils.keccak256("0x" + session._id);
  if (tx.data !== sidDigest) {
    return {
      status: 400,
      error: "Invalid transaction data",
    };
  }

  return {};
}

async function refundMintFeeOnChain(session, to) {
  let provider;
  if (session.chainId === 1) {
    provider = ethereumProvider;
  } else if (session.chainId === 10) {
    provider = optimismProvider;
  } else if (session.chainId === 250) {
    provider = fantomProvider;
  } else if (session.chainId === 43114) {
    provider = avalancheProvider;
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

async function refundMintFeePayPal(session) {
  const accessToken = await getPayPalAccessToken();

  const orders = session.payPal?.orders ?? [];

  if (orders.length === 0) {
    return {
      status: 404,
      data: {
        error: "No PayPal orders found for session",
      },
    };
  }

  let successfulOrder;
  for (const { id: orderId } of orders) {
    const order = await getPayPalOrder(orderId, accessToken);
    if (order.status === "COMPLETED") {
      successfulOrder = order;
      break;
    }
  }

  if (!successfulOrder) {
    return {
      status: 404,
      data: {
        error: "No successful PayPal orders found for session",
      },
    };
  }

  // Get the first successful payment capture
  let capture;
  for (const pu of successfulOrder.purchase_units) {
    for (const payment of pu.payments.captures) {
      if (payment.status === "COMPLETED") {
        capture = payment;
        break;
      }
    }
  }

  if (!capture) {
    return {
      status: 404,
      data: {
        error: "No successful PayPal payment captures found for session",
      },
    };
  }

  const paymentId = capture.id;

  // PayPal returns a 403 when trying to get refund details. Not sure if this
  // is because no refund exists had been performed yet or because of some other.
  // issue I tried creating new credentials and using the sandbox API but still
  // got a 403.
  // const refundDetails = await getPayPalRefundDetails(paymentId, accessToken);

  // if (refundDetails.status === "COMPLETED") {
  //   return {
  //     status: 400,
  //     data: {
  //       error: "Payment has already been refunded",
  //     },
  //   };
  // }

  const url = `${payPalApiUrlBase}/v2/payments/captures/${paymentId}/refund`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  };
  const data = {
    amount: {
      value: "7.53",
      currency_code: "USD",
    },
    // invoice_id: "INVOICE-123",
    note_to_payer: "Failed verification",
  };
  const resp = await axios.post(url, data, config);

  if (resp.data?.status !== "COMPLETED") {
    return {
      status: 500,
      data: {
        error: "Error refunding payment",
      },
    };
  }

  session.status = sessionStatusEnum.REFUNDED;
  await session.save();

  return {
    status: 200,
    data: {},
  };
}

async function capturePayPalOrder(orderId) {
  const accessToken = await getPayPalAccessToken();

  const url = `${payPalApiUrlBase}/v2/checkout/orders/${orderId}/capture`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  };
  const resp = await axios.post(url, {}, config);

  return resp.data;
}

async function handleIdvSessionCreation(res, session, logger) {
  if (session.idvProvider === "veriff") {
    const veriffSession = await createVeriffSession();
    if (!veriffSession) {
      return res.status(500).json({ error: "Error creating Veriff session" });
    }

    session.sessionId = veriffSession.verification.id;
    session.veriffUrl = veriffSession.verification.url;
    await session.save();

    logger.info(
      { sessionId: veriffSession.verification.id, idvProvider: "veriff" },
      "Created Veriff session"
    );

    return res.status(200).json({
      url: veriffSession.verification.url,
      id: veriffSession.verification.id,
    });
  } else if (session.idvProvider === "idenfy") {
    const tokenData = await createIdenfyToken(session.sigDigest);
    if (!tokenData) {
      return res.status(500).json({ error: "Error creating iDenfy token" });
    }

    session.scanRef = tokenData.scanRef;
    session.idenfyAuthToken = tokenData.authToken;
    await session.save();

    logger.info(
      { authToken: tokenData.authToken, idvProvider: "idenfy" },
      "Created iDenfy session"
    );

    return res.status(200).json({
      url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${tokenData.authToken}`,
      scanRef: tokenData.scanRef,
    });
  } else if (session.idvProvider === "onfido") {
    const applicant = await createOnfidoApplicant();
    if (!applicant) {
      return res.status(500).json({ error: "Error creating Onfido applicant" });
    }

    session.applicant_id = applicant.id;

    logger.info(
      { applicantId: applicant.id, idvProvider: "onfido" },
      "Created Onfido applicant"
    );

    const sdkTokenData = await createOnfidoSdkToken(applicant.id);
    if (!sdkTokenData) {
      return res.status(500).json({ error: "Error creating Onfido SDK token" });
    }

    session.onfido_sdk_token = sdkTokenData.token;
    await session.save();

    return res.status(200).json({
      applicant_id: applicant.id,
      sdk_token: sdkTokenData.token,
    });
  } else {
    return res.status(500).json({ error: "Invalid idvProvider" });
  }
}

export {
  validateTxForIDVSessionCreation,
  refundMintFeeOnChain,
  refundMintFeePayPal,
  capturePayPalOrder,
  handleIdvSessionCreation,
};
