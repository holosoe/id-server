import { Session } from "../../init.js";
import { createVeriffSession } from "../../utils/veriff.js";
import { createIdenfyToken } from "../../utils/idenfy.js";
import { createOnfidoApplicant, createOnfidoCheck } from "../../utils/onfido.js";
import { supportedChainIds, sessionStatusEnum } from "../../constants/misc.js";
import { validateTxForIDVSessionCreation } from "./functions.js";
import { pinoOptions, logger } from "../../utils/logger.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });
// const createIdvSessionLogger = logger.child({
//   msgPrefix: "[POST /sessions/:_id/idv-session] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });
// const getSessionsLogger = logger.child({
//   msgPrefix: "[GET /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

// Session object
// - _id: created by id-server (not by an idv provider)
// - sigDigest: string, allows user to have the same session across multiple browser sessions
// - txHash: string
// - chainId: number
// - idvProvider: string, e.g., 'veriff'
// - [sessionId | scanRef | check_id]: string

// POST /sessions
// - Creates a session
// - body: { sigDigest, idvProvider }

// POST /sessions/:_id/idv-session
// - Allows a user to create an IDV session by associating a transaction with an id-server session

// GET /sessions?id=<id>&sigDigest=<sigDigest>
// - id or sigDigest or both must be provided.
// - Gets a session or array of sessions.
// - Helpful for frontend to check whether a session has been paid for

/**
 * Creates a session.
 */
async function postSession(req, res) {
  try {
    const sigDigest = req.body.sigDigest;
    const idvProvider = req.body.idvProvider;
    if (!sigDigest) {
      return res.status(400).json({ error: "sigDigest is required" });
    }
    if (!idvProvider || ["veriff", "idenfy", "onfido"].indexOf(idvProvider) === -1) {
      return res
        .status(400)
        .json({ error: "idvProvider must be one of 'veriff', 'idenfy', 'onfido'" });
    }

    const session = new Session({
      sigDigest: sigDigest,
      idvProvider: idvProvider,
      status: sessionStatusEnum.NEEDS_PAYMENT,
    });
    await session.save();

    return res.status(201).json({ session });
  } catch (err) {
    console.log("POST /sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * Allows a user to create an IDV session by associating a transaction
 * with an id-server session.
 */
async function createIdvSession(req, res) {
  try {
    const _id = req.params._id;
    const chainId = Number(req.body.chainId);
    const txHash = req.body.txHash;
    if (!chainId || supportedChainIds.indexOf(chainId) === -1) {
      return res.status(400).json({
        error: `Missing chainId. chainId must be one of ${supportedChainIds.join(
          ", "
        )}`,
      });
    }
    if (!txHash) {
      return res.status(400).json({ error: "txHash is required" });
    }

    const session = await Session.findOne({ _id: _id }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.txHash) {
      return res
        .status(400)
        .json({ error: "Session is already associated with a transaction" });
    }

    const validationResult = await validateTxForIDVSessionCreation(chainId, txHash);
    if (validationResult.error) {
      return res
        .status(validationResult.status)
        .json({ error: validationResult.error });
    }

    // Note: We do not immediately call session.save() after adding txHash to
    // the session because we want the session to be saved only if the rest of
    // this function executes successfully.
    session.status = sessionStatusEnum.IN_PROGRESS;
    session.chainId = chainId;
    session.txHash = txHash;

    if (session.idvProvider === "veriff") {
      const veriffSession = await createVeriffSession();
      if (!veriffSession) {
        return res.status(500).json({ error: "Error creating Veriff session" });
      }

      session.sessionId = veriffSession.verification.id;
      await session.save();

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
      await session.save();

      return res.status(200).json({
        url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${tokenData.authToken}`,
        scanRef: tokenData.scanRef,
      });
    } else if (session.idvProvider === "onfido") {
      const applicant = await createOnfidoApplicant();
      if (!applicant) {
        return res.status(500).json({ error: "Error creating Onfido applicant" });
      }

      const check = await createOnfidoCheck(applicant.id);
      if (!check) {
        return res.status(500).json({ error: "Error creating Onfido check" });
      }

      session.check_id = check.id;
      await session.save();

      return res.status(200).json({
        id: check.id,
      });
    } else {
      return res.status(500).json({ error: "Invalid idvProvider" });
    }
  } catch (err) {
    console.log("POST /sessions/:_id/idv-session: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * Get session(s) associated with sigDigest or id.
 */
async function getSessions(req, res) {
  try {
    const sigDigest = req.query.sigDigest;
    const id = req.query.id;

    if (!sigDigest && !id) {
      return res.status(400).json({ error: "sigDigest or id is required" });
    }

    let sessions;
    if (id) {
      sessions = await Session.find({ _id: id }).exec();
    } else {
      sessions = await Session.find({ sigDigest }).exec();
    }

    return res.status(200).json(sessions);
  } catch (err) {
    console.log("GET /sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { postSession, createIdvSession, getSessions };
