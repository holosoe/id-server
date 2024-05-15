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
  auroraProvider,
  payPalApiUrlBase,
} from "../../constants/misc.js";
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
import { usdToETH, usdToFTM, usdToAVAX } from "../../utils/cmc.js";

function getTransaction(chainId, txHash) {
  if (chainId === 1) {
    return ethereumProvider.getTransaction(txHash);
  } else if (chainId === 10) {
    return optimismProvider.getTransaction(txHash);
  } else if (chainId === 250) {
    return fantomProvider.getTransaction(txHash);
  } else if (chainId === 43114) {
    return avalancheProvider.getTransaction(txHash);
  } else if (process.env.NODE_ENV === "development" && chainId === 420) {
    return optimismGoerliProvider.getTransaction(txHash);
  } else if (chainId === 1313161554) {
    return auroraProvider.getTransaction(txHash);
  }
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

export { refundMintFeePayPal, capturePayPalOrder, handleIdvSessionCreation };
