import { ObjectId } from "mongodb";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { AMLChecksSession, SessionRefundMutex } from "../../init.js";
import { getAccessToken as getPayPalAccessToken } from "../../utils/paypal.js";
import {
  createVeriffSession,
  patchVeriffSession,
  getVeriffSessionWatchlistScreening,
  deleteVeriffSession,
} from "../../utils/veriff.js";
import {
  validateTxForSessionCreation,
  refundMintFeeOnChain,
} from "../../utils/transactions.js";
import {
  supportedChainIds,
  amlChecksSessionStatusEnum,
  amlSessionUSDPrice,
} from "../../constants/misc.js";
// import {
//   refundMintFeePayPal,
//   capturePayPalOrder,
//   handleIdvSessionCreation,
// } from "./functions.js";
import { pinoOptions, logger } from "../../utils/logger.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

/**
 * ENDPOINT.
 * Creates a session.
 */
async function postSession(req, res) {
  try {
    const sigDigest = req.body.sigDigest;
    if (!sigDigest) {
      return res.status(400).json({ error: "sigDigest is required" });
    }

    let silkDiffWallet = null;
    if (req.body.silkDiffWallet === "silk") {
      silkDiffWallet = "silk";
    } else if (req.body.silkDiffWallet === "diff-wallet") {
      silkDiffWallet = "diff-wallet";
    }

    const session = new AMLChecksSession({
      sigDigest: sigDigest,
      status: amlChecksSessionStatusEnum.NEEDS_PAYMENT,
      silkDiffWallet,
    });
    await session.save();

    return res.status(201).json({ session });
  } catch (err) {
    console.log("POST /veriff-aml-sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT.
 */
async function createPayPalOrder(req, res) {
  // Implement this. See sessions/endpoints.js for reference implementation.
}

/**
 * ENDPOINT.
 * Pay for session and create a Veriff session.
 */
async function payForSession(req, res) {
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

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await AMLChecksSession.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== amlChecksSessionStatusEnum.NEEDS_PAYMENT) {
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${amlChecksSessionStatusEnum.NEEDS_PAYMENT}'`,
      });
    }

    if (session.txHash) {
      return res
        .status(400)
        .json({ error: "Session is already associated with a transaction" });
    }

    const otherSession = await AMLChecksSession.findOne({ txHash: txHash }).exec();
    if (otherSession) {
      return res
        .status(400)
        .json({ error: "Transaction has already been used to pay for a session" });
    }

    const validationResult = await validateTxForSessionCreation(
      session,
      chainId,
      txHash,
      amlSessionUSDPrice
    );
    if (validationResult.error) {
      return res
        .status(validationResult.status)
        .json({ error: validationResult.error });
    }

    session.status = amlChecksSessionStatusEnum.IN_PROGRESS_PAID;
    session.chainId = chainId;
    session.txHash = txHash;
    await session.save();

    return res.status(200).json({
      message: "success",
    });
  } catch (err) {
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT.
 */
async function payForSessionV2(req, res) {
  // Implement this. See sessions/endpoints.js for reference implementation.
}

/**
 * ENDPOINT.
 * Use on-chain payment. Does not validate
 * transaction data. Requires admin API key.
 */
async function payForSessionV3(req, res) {
  // Implement this. See sessions/endpoints.js for reference implementation.
}

/**
 * ENDPOINT.
 * Allows a user to request a refund for a failed session.
 */
async function refund(req, res) {
  const _id = req.params._id;
  const to = req.body.to;
  try {
    if (!to || to.length !== 42) {
      return res.status(400).json({
        error: "to is required and must be a 42-character hexstring (including 0x)",
      });
    }
    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }
    const session = await AMLChecksSession.findOne({ _id: objectId }).exec();
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.status !== amlChecksSessionStatusEnum.VERIFICATION_FAILED) {
      return res
        .status(400)
        .json({ error: "Only failed verifications can be refunded." });
    }
    if (session.refundTxHash) {
      return res
        .status(400)
        .json({ error: "This session has already been refunded." });
    }
    // Create mutex. We use mutex here so that only one refund request
    // per session can be processed at a time. Otherwise, if the user
    // spams this refund endpoint, we could send multiple transactions
    // before the first one is confirmed.
    const mutex = await SessionRefundMutex.findOne({ _id: objectId }).exec();
    if (mutex) {
      return res.status(400).json({ error: "Refund already in progress" });
    }
    const newMutex = new SessionRefundMutex({ _id: objectId });
    await newMutex.save();
    // Perform refund logic
    const response = await refundMintFeeOnChain(session, to);
    // Delete mutex
    await SessionRefundMutex.deleteOne({ _id: _id }).exec();
    // Return response
    return res.status(response.status).json(response.data);
  } catch (err) {
    // Delete mutex. We have this here in case an unknown error occurs above.
    try {
      await SessionRefundMutex.deleteOne({ _id: _id }).exec();
    } catch (err) {
      console.log(
        "POST refund AML checks session: Error encountered while deleting mutex",
        err.message
      );
    }
    if (err.response) {
      console.error({ error: err.response.data }, "Error during refund");
    } else if (err.request) {
      console.error({ error: err.request.data }, "Error during refund");
    } else {
      console.error({ error: err }, "Error during refund");
    }
    console.log("POST refund AML checks session: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT.
 */
async function refundV2(req, res) {
  // Implement this, but for AMLChecksSession.
  // if (req.body.to) {
  //   return refund(req, res);
  // }
  // const _id = req.params._id;
  // try {
  //   let objectId = null;
  //   try {
  //     objectId = new ObjectId(_id);
  //   } catch (err) {
  //     return res.status(400).json({ error: "Invalid _id" });
  //   }
  //   const session = await Session.findOne({ _id: objectId }).exec();
  //   if (!session) {
  //     return res.status(404).json({ error: "Session not found" });
  //   }
  //   if (session.status !== amlChecksSessionStatusEnum.VERIFICATION_FAILED) {
  //     return res
  //       .status(400)
  //       .json({ error: "Only failed verifications can be refunded." });
  //   }
  //   if (session.refundTxHash) {
  //     return res
  //       .status(400)
  //       .json({ error: "This session has already been refunded." });
  //   }
  //   // Create mutex. We use mutex here so that only one refund request
  //   // per session can be processed at a time. Otherwise, if the user
  //   // spams this refund endpoint, we could send multiple transactions
  //   // before the first one is confirmed.
  //   const mutex = await SessionRefundMutex.findOne({ _id: _id }).exec();
  //   if (mutex) {
  //     return res.status(400).json({ error: "Refund already in progress" });
  //   }
  //   const newMutex = new SessionRefundMutex({ _id: _id });
  //   await newMutex.save();
  //   // Perform refund logic
  //   const response = await refundMintFeePayPal(session);
  //   // Delete mutex
  //   await SessionRefundMutex.deleteOne({ _id: _id }).exec();
  //   // Return response
  //   return res.status(response.status).json(response.data);
  // } catch (err) {
  //   // Delete mutex. We have this here in case an unknown error occurs above.
  //   try {
  //     await SessionRefundMutex.deleteOne({ _id: _id }).exec();
  //   } catch (err) {
  //     console.log(
  //       "POST /sessions/:_id/idv-session/refund: Error encountered while deleting mutex",
  //       err.message
  //     );
  //   }
  //   if (err.response) {
  //     console.error(
  //       { error: JSON.stringify(err.response.data, null, 2) },
  //       "Error during refund"
  //     );
  //   } else if (err.request) {
  //     console.error(
  //       { error: JSON.stringify(err.request.data, null, 2) },
  //       "Error during refund"
  //     );
  //   } else {
  //     console.error({ error: err }, "Error during refund");
  //   }
  //   console.log(
  //     "POST /sessions/:_id/idv-session/refund: Error encountered",
  //     err.message
  //   );
  //   return res.status(500).json({ error: "An unknown error occurred" });
  // }
}

async function getSession(veriffSessionId) {
  const amlChecksSession = await AMLChecksSession.findOne({ veriffSessionId }).exec();

  if (!amlChecksSession) {
    throw new Error("Session not found");
  }

  return amlChecksSession;
}

async function parsePublicSignals(publicSignals) {
  // TODO: Implement. Extract these values from publicSignals
  return {
    firstName: "John",
    lastName: "Doe",
    dateOfBirth: "YYYY-MM-DD",
  };
}

/**
 * @typedef Groth16FullProveResult
 * @property {object} proof
 * @property {array} publicSignals
 */

/**
 * ENDPOINT.
 */
async function createVeriffSessionFromZKP(req, res) {
  // zkp should be of type Groth16FullProveResult (a proof generated with snarkjs.groth16)
  const { sessionId, zkp } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "No sessionId specified" });
  }

  if (!zkp?.proof || !zkp?.publicSignals) {
    return res.status(400).json({ error: "No zkp found" });
  }

  const amlChecksSession = await getSession(sessionId);
  if (amlChecksSession.status !== amlChecksSessionStatusEnum.IN_PROGRESS_PAID) {
    if (amlChecksSession.status === amlChecksSessionStatusEnum.VERIFICATION_FAILED) {
      return res.status(400).json({
        error: `Verification failed. Reason(s): ${amlChecksSession.verificationFailureReason}`,
      });
    }
    return res.status(400).json({
      error: `Session status is '${amlChecksSession.status}'. Expected '${amlChecksSessionStatusEnum.IN_PROGRESS_PAID}'`,
    });
  }

  // TODO: Verify ZKP that proves user's first name, last name, date of birth

  const { firstName, lastName, dateOfBirth } = parsePublicSignals(zkp.publicSignals);

  const veriffSession = await createVeriffSession({
    verification: {
      person: {
        firstName,
        lastName,
        dateOfBirth,
      },
    },
  });
  if (!veriffSession) {
    return res.status(500).json({ error: "Error creating Veriff session" });
  }

  amlChecksSession.status = amlChecksSessionStatusEnum.IN_PROGRESS_CHECK_CREATED;
  amlChecksSession.veriffSessionId = veriffSession.verification.id;
  await amlChecksSession.save();

  return res.status(200).json({
    message: "success",
  });
}

function validateScreeningResult(result) {
  if (result.status !== "success") {
    return {
      error: `Verification failed. Status is '${result.status}'. Expected 'success'.`,
      log: {
        msg: "Verification failed. status !== 'success'",
        data: {
          status: result.status,
        },
      },
    };
  }
  if (result.data.matchStatus == "possible_match") {
    return {
      error: `Verification failed. matchStatus is '${result.data.matchStatus}'. Expected 'no_match'.`,
      log: {
        msg: "Verification failed. matchStatus == 'possible_match'",
        data: {
          matchStatus: result.data.matchStatus,
        },
      },
    };
  }
  if (result.data.totalHits > 0) {
    return {
      error: `Verification failed. totalHits is '${result.data.totalHits}'. Expected '0'.`,
      log: {
        msg: "Verification failed. totalHits > 0",
        data: {
          totalHits: result.data.totalHits,
        },
      },
    };
  }
  // TODO: How strict do we want to be? Maybe some hits are acceptable?
  return { success: true };
}

function extractCreds(screeningResult) {
  return {
    rawCreds: {
      totalHits: screeningResult.data.totalHits,
      customField1: 0,
    },
    fieldsInLeaf: [
      "issuer",
      "secret",
      "rawCreds.totalHits",
      "rawCreds.customField1",
      "iat", // TODO: Is this correct?
      "scope",
    ],
  };
}

async function updateSessionStatus(veriffSessionId, status, failureReason) {
  const metaSession = await AMLChecksSession.findOne({ veriffSessionId }).exec();
  metaSession.status = status;
  if (failureReason) metaSession.verificationFailureReason = failureReason;
  await metaSession.save();
}

async function issueCreds(req, res) {
  const issuanceNullifier = req.params.nullifier;
  const _id = req.params._id;

  let objectId = null;
  try {
    objectId = new ObjectId(_id);
  } catch (err) {
    return res.status(400).json({ error: "Invalid _id" });
  }

  const session = await AMLChecksSession.findOne({ _id: objectId }).exec();

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const sessionId = session.veriffSessionId;

  if (!sessionId) {
    return res.status(400).json({ error: "No sessionId specified" });
  }

  const amlChecksSession = await getSession(sessionId);
  if (
    amlChecksSession.status !== amlChecksSessionStatusEnum.IN_PROGRESS_CHECK_CREATED
  ) {
    if (amlChecksSession.status === amlChecksSessionStatusEnum.VERIFICATION_FAILED) {
      return res.status(400).json({
        error: `Verification failed. Reason(s): ${amlChecksSession.verificationFailureReason}`,
      });
    }
    return res.status(400).json({
      error: `Session status is '${amlChecksSession.status}'. Expected '${amlChecksSessionStatusEnum.IN_PROGRESS_CHECK_CREATED}'`,
    });
  }

  const patchResult = await patchVeriffSession(sessionId, {
    status: "submitted",
  });
  if (patchResult?.status != "success") {
    return res.status(400).json({
      error: "Failed to PATCH Veriff session",
    });
  }

  const screeningResult = await getVeriffSessionWatchlistScreening(sessionId);

  const validationResult = validateScreeningResult(screeningResult);
  if (validationResult.error) {
    endpointLogger.error(validationResult.log.data, validationResult.log.msg);
    await updateSessionStatus(
      req.query.sessionId,
      amlChecksSessionStatusEnum.VERIFICATION_FAILED,
      validationResult.error
    );
    return res.status(400).json({ error: validationResult.error });
  }

  const creds = extractCreds(screeningResult);

  const response = JSON.parse(
    issuev2(
      // TODO: Use new issuer private key, one specifically for AML screening
      process.env.HOLONYM_ISSUER_PRIVKEY,
      issuanceNullifier,
      creds.rawCreds.totalHits,
      creds.rawCreds.customField1
    )
  );
  response.metadata = creds;

  await deleteVeriffSession(sessionId);

  await updateSessionStatus(rsessionId, amlChecksSessionStatusEnum.ISSUED);

  return res.status(200).json(response);
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
      let objectId = null;
      try {
        objectId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "Invalid id" });
      }
      sessions = await AMLChecksSession.find({ _id: objectId }).exec();
    } else {
      sessions = await AMLChecksSession.find({ sigDigest }).exec();
    }

    return res.status(200).json(sessions);
  } catch (err) {
    console.log("GET /aml-sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export {
  postSession,
  // createPayPalOrder,
  payForSession,
  refund,
  // refundV2,
  createVeriffSessionFromZKP,
  issueCreds,
  getSessions,
};
