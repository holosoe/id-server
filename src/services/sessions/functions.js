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

export { capturePayPalOrder, handleIdvSessionCreation };
