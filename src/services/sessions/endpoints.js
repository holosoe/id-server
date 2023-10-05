import axios from "axios";
import { ObjectId } from "mongodb";
import { Session, SessionRefundMutex } from "../../init.js";
import { createVeriffSession } from "../../utils/veriff.js";
import { createIdenfyToken } from "../../utils/idenfy.js";
import {
  createOnfidoApplicant,
  createOnfidoSdkToken,
  createOnfidoCheck,
} from "../../utils/onfido.js";
import { supportedChainIds, sessionStatusEnum } from "../../constants/misc.js";
import { desiredOnfidoReports } from "../../constants/onfido.js";
import {
  validateTxForIDVSessionCreation,
  refundMintFee,
  validateTxForIDVSessionCreationSandbox,
} from "./functions.js";
import { pinoOptions, logger } from "../../utils/logger.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });
const createIdvSessionLogger = logger.child({
  msgPrefix: "[POST /sessions/:_id/idv-session] ",
  base: {
    ...pinoOptions.base,
  },
});
const createIdvSessionV2Logger = logger.child({
  msgPrefix: "[POST /sessions/:_id/idv-session/v2] ",
  base: {
    ...pinoOptions.base,
  },
});
const createPayPalOrderLogger = logger.child({
  msgPrefix: "[POST /sessions/:_id/paypal-order] ",
  base: {
    ...pinoOptions.base,
  },
});
const capturePayPalOrderLogger = logger.child({
  msgPrefix: "[POST /sessions/:_id/paypal-order/capture] ",
  base: {
    ...pinoOptions.base,
  },
});
const refreshOnfidoTokenLogger = logger.child({
  msgPrefix: "[POST /sessions/:_id/idv-session/onfido/token] ",
  base: {
    ...pinoOptions.base,
  },
});
// const getSessionsLogger = logger.child({
//   msgPrefix: "[GET /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });
const createOnfidoCheckLogger = logger.child({
  msgPrefix: "[POST /sessions/:_id/idv-session/onfido/check] ",
  base: {
    ...pinoOptions.base,
  },
});

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

async function createPayPalOrder(req, res) {
  try {
    const _id = req.params._id;

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const url =
      process.env.NODE_ENV === "development"
        ? "https://api-m.sandbox.paypal.com/v2/checkout/orders"
        : "";
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          // reference_id: `idv-session-${_id}`,
          amount: {
            currency_code: "USD",
            value: "10.00",
          },
        },
      ],
      // payment_source: {
      //   paypal: {
      //     experience_context: {
      //       payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
      //       brand_name: "EXAMPLE INC",
      //       locale: "en-US",
      //       landing_page: "LOGIN",
      //       shipping_preference: "SET_PROVIDED_ADDRESS",
      //       user_action: "PAY_NOW",
      //       return_url: "https://example.com/returnUrl",
      //       cancel_url: "https://example.com/cancelUrl",
      //     },
      //   },
      // },
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYPAL_ACCESS_TOKEN}`,
      },
    };

    const resp = await axios.post(url, body, config);

    const order = resp.data;

    if ((session.payPal?.orders ?? []).length > 0) {
      session.payPal.orders.push({ id: order.id, createdAt: new Date() });
    } else {
      session.payPal = {
        orders: [{ id: order.id, createdAt: new Date() }],
      };
    }

    await session.save();

    return res.status(201).json(order);
  } catch (err) {
    if (err.response) {
      createPayPalOrderLogger.error(
        { error: err.response.data },
        "Error creating PayPal order"
      );
    } else if (err.request) {
      createPayPalOrderLogger.error(
        { error: err.request.data },
        "Error creating PayPal order"
      );
    } else {
      createPayPalOrderLogger.error({ error: err }, "Error creating PayPal order");
    }
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function capturePayPalOrder(req, res) {
  try {
    const _id = req.params._id;
    const orderId = req.body.orderId;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const filteredOrders = (session.payPal?.orders).filter(
      (order) => order.id === orderId
    );
    if (filteredOrders.length === 0) {
      return res.status(400).json({
        error: `Order ${orderId} is not associated with session ${_id}`,
      });
    }

    const url =
      process.env.NODE_ENV === "development"
        ? `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`
        : "";
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYPAL_ACCESS_TOKEN}`,
      },
    };
    const resp = await axios.post(url, {}, config);

    const order = resp.data;

    if (order.status !== "COMPLETED") {
      return res.status(400).json({
        error: `Order ${orderId} has status ${order.status} and cannot be captured`,
      });
    }

    return res.status(200).json(order);
  } catch (err) {
    if (err.response) {
      capturePayPalOrderLogger.error(
        { error: err.response.data },
        "Error trying to capture PayPal order"
      );
    } else if (err.request) {
      capturePayPalOrderLogger.error(
        { error: err.request.data },
        "Error trying to capture PayPal order"
      );
    } else {
      capturePayPalOrderLogger.error(
        { error: err },
        "Error trying to capture PayPal order"
      );
    }
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

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

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
      session.veriffUrl = veriffSession.verification.url;
      await session.save();

      createIdvSessionLogger.info(
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

      createIdvSessionLogger.info(
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

      createIdvSessionLogger.info(
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
  } catch (err) {
    if (err.response) {
      createIdvSessionLogger.error(
        { error: err.response.data },
        "Error creating IDV session"
      );
    } else if (err.request) {
      createIdvSessionLogger.error(
        { error: err.request.data },
        "Error creating IDV session"
      );
    } else {
      createIdvSessionLogger.error({ error: err }, "Error creating IDV session");
    }

    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * Allows a user to create an IDV session by either (a) associating a
 * transaction with an id-server session or (b) associating a PayPal
 * order with an id-server session.
 */
async function createIdvSessionV2(req, res) {
  try {
    if (req.body.chainId && req.body.txHash) {
      return createIdvSession(req, res);
    }

    const _id = req.params._id;
    const orderId = req.body.orderId;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.NEEDS_PAYMENT) {
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${sessionStatusEnum.NEEDS_PAYMENT}'`,
      });
    }

    const filteredOrders = (session.payPal?.orders).filter(
      (order) => order.id === orderId
    );
    if (filteredOrders.length === 0) {
      return res.status(400).json({
        error: `Order ${orderId} is not associated with session ${_id}`,
      });
    }

    const sessions = await Session.find({
      _id: { $ne: objectId },
      "payPal.orders": {
        $elemMatch: {
          id: orderId,
        },
      },
    }).exec();

    if (sessions.length > 0) {
      return res.status(400).json({
        error: `Order ${orderId} is already associated with session ${sessions[0]._id}`,
      });
    }

    const url =
      process.env.NODE_ENV === "development"
        ? `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`
        : "";
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYPAL_ACCESS_TOKEN}`,
      },
    };
    const resp = await axios.get(url, config);
    const order = resp.data;

    if (order.status !== "COMPLETED") {
      return res.status(400).json({
        error: `Order ${orderId} has status ${order.status}. Must be COMPLETED`,
      });
    }

    const expectedAmountInUSD = 10;
    const amount = Number(order?.purchase_units?.[0]?.amount?.value);
    if (amount < expectedAmountInUSD) {
      return res.status(400).json({
        error: `Invalid order amount. Amount must be greater than or equal to ${expectedAmountInUSD}`,
      });
    }

    // Note: We do not immediately call session.save() after adding txHash to
    // the session because we want the session to be saved only if the rest of
    // this function executes successfully.
    session.status = sessionStatusEnum.IN_PROGRESS;

    // TODO: The following is copied from createIdvSession. Refactor so that
    // there is less duplicate code.
    if (session.idvProvider === "veriff") {
      const veriffSession = await createVeriffSession();
      if (!veriffSession) {
        return res.status(500).json({ error: "Error creating Veriff session" });
      }

      session.sessionId = veriffSession.verification.id;
      session.veriffUrl = veriffSession.verification.url;
      await session.save();

      createIdvSessionV2Logger.info(
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

      createIdvSessionV2Logger.info(
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

      createIdvSessionV2Logger.info(
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
  } catch (err) {
    if (err.response) {
      createIdvSessionV2Logger.error(
        { error: err.response.data },
        "Error creating IDV session"
      );
    } else if (err.request) {
      createIdvSessionV2Logger.error(
        { error: err.request.data },
        "Error creating IDV session"
      );
    } else {
      createIdvSessionV2Logger.error({ error: err }, "Error creating IDV session");
    }

    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function refreshOnfidoToken(req, res) {
  const _id = req.params._id;

  try {
    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.applicant_id) {
      return res.status(400).json({ error: "Session is missing applicant_id" });
    }

    const sdkTokenData = await createOnfidoSdkToken(session.applicant_id);

    session.onfido_sdk_token = sdkTokenData.token;
    await session.save();

    return res.status(200).json({
      sdk_token: sdkTokenData.token,
    });
  } catch (err) {
    refreshOnfidoTokenLogger.error({ error: err }, "Error creating Onfido check");
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function createOnfidoCheckEndpoint(req, res) {
  // NOTE:
  // From Onfido docs:
  // "If you're requesting multiple checks for the same individual, you
  // should reuse the id returned in the initial applicant response object
  // in the applicant_id field when creating a check."
  // Perhaps we should associate sigDigest with applicant_id to accomplish this.
  try {
    const _id = req.params._id;

    let objectId = null;
    try {
      objectId = new ObjectId(_id);
    } catch (err) {
      return res.status(400).json({ error: "Invalid _id" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.applicant_id) {
      return res.status(400).json({ error: "Session is missing applicant_id" });
    }

    const check = await createOnfidoCheck(session.applicant_id);

    session.check_id = check.id;
    await session.save();

    createOnfidoCheckLogger.info(
      { check_id: check.id, applicant_id: session.applicant_id },
      "Created Onfido check"
    );

    return res.status(200).json({
      id: check.id,
    });
  } catch (err) {
    console.error(
      { error: err, applicant_id: req.body.applicant_id },
      "Error creating Onfido check"
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * Allows a user to request a refund for a failed IDV session.
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

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.VERIFICATION_FAILED) {
      return res
        .status(400)
        .json({ error: "Only failed verifications can be refunded." });
    }

    // Create mutex. We use mutex here so that only one refund request
    // per session can be processed at a time. Otherwise, if the user
    // spams this refund endpoint, we could send multiple transactions
    // before the first one is confirmed.
    // TODO: Do not use MongoDB for mutex purposes. Use something like
    // like Redis instead.
    const mutex = await SessionRefundMutex.findOne({ _id: _id }).exec();
    if (mutex) {
      return res.status(400).json({ error: "Refund already in progress" });
    }
    const newMutex = new SessionRefundMutex({ _id: _id });
    await newMutex.save();

    // Perform refund logic
    const response = await refundMintFee(session, to);

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
        "POST /sessions/:_id/idv-session/refund: Error encountered while deleting mutex",
        err.message
      );
    }

    console.log(
      "POST /sessions/:_id/idv-session/refund: Error encountered",
      err.message
    );
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
      let objectId = null;
      try {
        objectId = new ObjectId(id);
      } catch (err) {
        return res.status(400).json({ error: "Invalid id" });
      }
      sessions = await Session.find({ _id: objectId }).exec();
    } else {
      sessions = await Session.find({ sigDigest }).exec();
    }

    return res.status(200).json(sessions);
  } catch (err) {
    console.log("GET /sessions: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * TODO: DELETE THIS ENDPOINT AFTER TESTING.
 */
async function createIdvSessionSandbox(req, res) {
  try {
    const _id = req.params._id;
    const chainId = Number(req.body.chainId);
    const txHash = req.body.txHash;
    const supportedChainIds = [
      1, // Ethereum
      10, // Optimism
      250, // Fantom
      420, // Optimism goerli
    ];
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

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.txHash) {
      return res
        .status(400)
        .json({ error: "Session is already associated with a transaction" });
    }

    const validationResult = await validateTxForIDVSessionCreationSandbox(
      chainId,
      txHash
    );
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
      session.veriffUrl = veriffSession.verification.url;
      await session.save();

      createIdvSessionLogger.info(
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

      createIdvSessionLogger.info(
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

      createIdvSessionLogger.info(
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
  } catch (err) {
    if (err.response) {
      createIdvSessionLogger.error(
        { error: err.response.data },
        "Error creating IDV session"
      );
    } else if (err.request) {
      createIdvSessionLogger.error(
        { error: err.request.data },
        "Error creating IDV session"
      );
    } else {
      createIdvSessionLogger.error({ error: err }, "Error creating IDV session");
    }

    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export {
  postSession,
  createPayPalOrder,
  capturePayPalOrder,
  createIdvSession,
  createIdvSessionV2,
  refreshOnfidoToken,
  createOnfidoCheckEndpoint,
  refund,
  getSessions,
  createIdvSessionSandbox,
};
