import { ObjectId } from "mongodb";
import { Session, UserVerifications } from "../../init.js";
import { createVeriffSession } from "../../utils/veriff.js";
import { createIdenfyToken } from "../../utils/idenfy.js";
import {
  createOnfidoApplicant,
  createOnfidoSdkToken,
  createOnfidoCheck,
} from "../../utils/onfido.js";
import { sessionStatusEnum } from "../../constants/misc.js";
import logger from "../../utils/logger.js";

const postEndpointLogger = logger.child({
  msgPrefix: "[POST /admin/set-session-idv-provider] ",
});

/**
 * This endpoint sets the IDV provider used to verify a user. For example,
 * if a user tried verifying with Onfido but verification failed, we can
 * let them verify with Veriff by calling this endpoint and specifying
 * "veriff" as the idv-provider. Importantly, if a user has already tried
 * verifying with a provider and failed, we do not create a new session
 * with that provider; this is to prevent creating multiple sessions
 * with each provider, something we want to prevent to avoid excessive costs.
 */
async function setSessionIdvProvider(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY_LOW_PRIVILEGE) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const id = req.body.id;
    const newIdvProvider = req.body.idvProvider;

    if (!id) {
      return res.status(400).json({ error: "No user ID specified." });
    }

    if (!newIdvProvider) {
      return res.status(400).json({ error: "No IDV provider specified." });
    }

    const supportedIdvProviders = ["onfido", "veriff", "idenfy"];
    if (supportedIdvProviders.indexOf(newIdvProvider) === -1) {
      return res.status(400).json({
        error: `Invalid IDV provider. Must be one of ${supportedIdvProviders}`,
      });
    }

    let objectId = null;
    try {
      objectId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const acceptableSessionStatuses = [
      sessionStatusEnum.IN_PROGRESS,
      sessionStatusEnum.VERIFICATION_FAILED,
    ];
    if (acceptableSessionStatuses.indexOf(session.status) === -1) {
      return res.status(400).json({
        error: `Session status is ${session.status}. Must be one of ${acceptableSessionStatuses}`,
      });
    }

    if (session.idvProvider === newIdvProvider) {
      return res.status(400).json({
        message: `IDV provider for this session is already ${newIdvProvider}`,
      });
    }

    // TODO: Come back to this.
    // There's very likely a better way to do this, but... To avoid creating a new IDV session
    // with a provider the user has already verified with (for this session), we check that
    // the IDV session ID (e.g. Veriff's "sessionId") is null. If it's not null, that means
    // an IDV session has already been created with that provider.
    if (newIdvProvider === "idenfy" && session.scanRef) {
      return res.status(400).json({
        message:
          "Cannot change IDV provider to iDenfy. User has already verified with iDenfy",
      });
    }

    if (newIdvProvider === "veriff" && session.sessionId) {
      return res.status(400).json({
        message:
          "Cannot change IDV provider to Veriff. User has already verified with Veriff",
      });
    }

    if (newIdvProvider === "onfido" && session.check_id) {
      return res.status(400).json({
        message:
          "Cannot change IDV provider to Onfido. User has already verified with Onfido",
      });
    }

    session.status = sessionStatusEnum.IN_PROGRESS;
    session.idvProvider = newIdvProvider;

    if (newIdvProvider === "veriff") {
      const veriffSession = await createVeriffSession();
      if (!veriffSession) {
        return res.status(500).json({ error: "Error creating Veriff session" });
      }

      session.sessionId = veriffSession.verification.id;
      session.veriffUrl = veriffSession.verification.url;
      await session.save();

      postEndpointLogger.info(
        { sessionId: veriffSession.verification.id, idvProvider: "veriff" },
        "Created Veriff session"
      );

      return res.status(200).json({
        url: veriffSession.verification.url,
        id: veriffSession.verification.id,
      });
    } else if (newIdvProvider === "idenfy") {
      const tokenData = await createIdenfyToken(session.sigDigest);
      if (!tokenData) {
        return res.status(500).json({ error: "Error creating iDenfy token" });
      }

      session.scanRef = tokenData.scanRef;
      session.idenfyAuthToken = tokenData.authToken;
      await session.save();

      postEndpointLogger.info(
        { authToken: tokenData.authToken, idvProvider: "idenfy" },
        "Created iDenfy session"
      );

      return res.status(200).json({
        url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${tokenData.authToken}`,
        scanRef: tokenData.scanRef,
      });
    } else if (newIdvProvider === "onfido") {
      const applicant = await createOnfidoApplicant();
      if (!applicant) {
        return res.status(500).json({ error: "Error creating Onfido applicant" });
      }

      session.applicant_id = applicant.id;

      postEndpointLogger.info(
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
    }
  } catch (err) {
    postEndpointLogger.error({ error: err });
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { setSessionIdvProvider };
