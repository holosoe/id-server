import { ObjectId } from "mongodb";
import { poseidon } from "circomlibjs-old";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { groth16 } from "snarkjs";
import { 
  UserVerifications, 
  AMLChecksSession, 
  SessionRefundMutex 
} from "../../init.js";
import { 
  getAccessToken as getPayPalAccessToken,
  capturePayPalOrder,
  refundMintFeePayPal
} from "../../utils/paypal.js";
import {
  validateTxForSessionCreation,
  refundMintFeeOnChain,
} from "../../utils/transactions.js";
import { cleanHandsDummyUserCreds } from "../../utils/constants.js";
import { getDateAsInt, govIdUUID } from "../../utils/utils.js";
import {
  supportedChainIds,
  amlSessionUSDPrice,
  payPalApiUrlBase,
  sessionStatusEnum,
} from "../../constants/misc.js";
import V3NameDOBVKey from "../../constants/zk/V3NameDOB.verification_key.json" assert { type: "json" };
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
      status: sessionStatusEnum.NEEDS_PAYMENT,
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
  try {
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

    const accessToken = await getPayPalAccessToken();

    const url = `${payPalApiUrlBase}/v2/checkout/orders`;
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "1.00",
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
        Authorization: `Bearer ${accessToken}`,
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
      console.error("Error creating PayPal order", err.response.data);
    } else if (err.request) {
      console.error("Error creating PayPal order", err.request.data);
    } else {
      console.error("Error creating PayPal order", err);
    }
    return res.status(500).json({ error: "An unknown error occurred" });
  }
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

    if (session.status !== sessionStatusEnum.NEEDS_PAYMENT) {
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${sessionStatusEnum.NEEDS_PAYMENT}'`,
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

    session.status = sessionStatusEnum.IN_PROGRESS;
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
  try {
    if (req.body.chainId && req.body.txHash) {
      return payForSession(req, res);
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

    const session = await AMLChecksSession.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.NEEDS_PAYMENT) {
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${sessionStatusEnum.NEEDS_PAYMENT}'`,
      });
    }

    const filteredOrders = (session.payPal?.orders ?? []).filter(
      (order) => order.id === orderId
    );
    if (filteredOrders.length === 0) {
      return res.status(400).json({
        error: `Order ${orderId} is not associated with session ${_id}`,
      });
    }

    const sessions = await AMLChecksSession.find({
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

    const order = await capturePayPalOrder(orderId);

    if (order.status !== "COMPLETED") {
      return res.status(400).json({
        error: `Order ${orderId} has status ${order.status}. Must be COMPLETED`,
      });
    }

    const expectedAmountInUSD = 1;

    let successfulOrder;
    for (const pu of order.purchase_units) {
      for (const payment of pu.payments.captures) {
        if (payment.status === "COMPLETED") {
          if (Number(payment.amount.value) >= expectedAmountInUSD) {
            successfulOrder = order;
          }
          break;
        }
      }
    }

    if (!successfulOrder) {
      return res.status(400).json({
        error: `Order ${orderId} does not have a successful payment capture with amount >= ${expectedAmountInUSD}`,
      });
    }

    session.status = sessionStatusEnum.IN_PROGRESS;
    await session.save();

    return res.status(200).json({
      message: "success",
    });
  } catch (err) {
    if (err.response) {
      console.error('error paying for aml session', err.response.data);
    } else if (err.request) {
      console.error('error paying for aml session', err.request.data);
    } else {
      console.error('error paying for aml session', err);
    }

    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT.
 * Use on-chain payment. Does not validate
 * transaction data. Requires admin API key.
 */
async function payForSessionV3(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY_LOW_PRIVILEGE) {
      return res.status(401).json({ error: "Invalid API key." });
    }

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

    if (session.status !== sessionStatusEnum.NEEDS_PAYMENT) {
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${sessionStatusEnum.NEEDS_PAYMENT}'`,
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
    if (
      validationResult.error &&
      // We ignore "Invalid transaction data" here
      validationResult.error !== "Invalid transaction data"
    ) {
      // We ignore "Invalid transaction amount" here if the tx amount is
      // at least 50% of the expected amount.
      if (validationResult.error.includes("Invalid transaction amount")) {
        const expected = ethers.BigNumber.from(
          validationResult.error.split("Expected: ")[1].split(".")[0]
        );
        const found = ethers.BigNumber.from(
          validationResult.error.split("Found: ")[1].split(".")[0]
        );

        // Make sure found is at least 50% of expected
        if (found.lt(expected.div(2))) {
          return res
            .status(validationResult.status)
            .json({ error: validationResult.error });
        }
      } else {
        return res
          .status(validationResult.status)
          .json({ error: validationResult.error });
      }
    }

    // Note: We do not immediately call session.save() after adding txHash to
    // the session because we want the session to be saved only if the rest of
    // this function executes successfully.
    session.status = sessionStatusEnum.IN_PROGRESS;
    session.chainId = chainId;
    session.txHash = txHash;
    await session.save();

    return res.status(200).json({
      message: "success",
    });
  } catch (err) {
    console.log("err.message", err.message);
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

    return res.status(500).json({ error: "An unknown error occurred", err });
  }
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
    if (session.status !== sessionStatusEnum.VERIFICATION_FAILED) {
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
  if (req.body.to) {
    return refund(req, res);
  }
  const _id = req.params._id;
  try {
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
    if (session.status !== sessionStatusEnum.VERIFICATION_FAILED) {
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
    const mutex = await SessionRefundMutex.findOne({ _id: _id }).exec();
    if (mutex) {
      return res.status(400).json({ error: "Refund already in progress" });
    }
    const newMutex = new SessionRefundMutex({ _id: _id });
    await newMutex.save();
    // Perform refund logic
    const response = await refundMintFeePayPal(session);
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
        "POST /aml-sessions/:_id/refund/v2: Error encountered while deleting mutex",
        err.message
      );
    }
    if (err.response) {
      console.error(
        { error: JSON.stringify(err.response.data, null, 2) },
        "Error during refund"
      );
    } else if (err.request) {
      console.error(
        { error: JSON.stringify(err.request.data, null, 2) },
        "Error during refund"
      );
    } else {
      console.error({ error: err }, "Error during refund");
    }
    console.log(
      "POST /aml-sessions/:_id/refund/v2: Error encountered",
      err.message
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

function parsePublicSignals(publicSignals) {
  return {
    expiry: new Date(Number(publicSignals[1]) * 1000),
    firstName: Buffer.from(BigInt(publicSignals[2]).toString(16), 'hex').toString(),
    lastName: Buffer.from(BigInt(publicSignals[3]).toString(16), 'hex').toString(),
    dateOfBirth: (new Date((Number(publicSignals[4]) - 2208988800) * 1000)).toISOString().slice(0, 10)
  };
}

/**
 * @typedef Groth16FullProveResult
 * @property {object} proof
 * @property {array} publicSignals
 */


function validateScreeningResult(result) {
  if (result.count > 0) {
    return {
      error: `Verification failed. count is '${result.count}'. Expected '0'.`,
      log: {
        msg: "Verification failed. count > 0",
        data: {
          status: result.status,
        },
      },
    };
  }
  // TODO: How strict do we want to be? Maybe some hits are acceptable?
  return { success: true };
}

function extractCreds(person) {
  const birthdate = person.dateOfBirth ? person.dateOfBirth : "";
  // const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = person.firstName ? person.firstName : "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  const lastNameStr = person.lastName ? person.lastName : "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();

  return {
    rawCreds: {
      birthdate,
      firstName: firstNameStr,
      lastName: lastNameStr
    },
    derivedCreds: {
      nameHash: {
        value: nameHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.firstName",
          "rawCreds.lastName",
        ],
      },
    },
    fieldsInLeaf: [
      "issuer",
      "secret",
      "rawCreds.birthdate",
      "derivedCreds.nameHash",
      "iat", // TODO: Is this correct?
      "scope",
    ],
  };
}

async function saveUserToDb(uuid) {
  const userVerificationsDoc = new UserVerifications({
    aml: {
      uuid: uuid,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    endpointLogger.error(
      { error: err },
      "An error occurred while saving user verification to database"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function issueCreds(req, res) {
  try {
    const issuanceNullifier = req.params.nullifier;
    const _id = req.params._id;

    if (process.env.ENVIRONMENT == "dev") {
      const creds = cleanHandsDummyUserCreds;

      const response = JSON.parse(
        issuev2(
          process.env.HOLONYM_ISSUER_CLEAN_HANDS_PRIVKEY,
          issuanceNullifier,
          getDateAsInt(creds.rawCreds.birthdate).toString(),
          creds.derivedCreds.nameHash.value,
        )
      );
      response.metadata = cleanHandsDummyUserCreds;
  
      return res.status(200).json(response);
    }
  
    // zkp should be of type Groth16FullProveResult (a proof generated with snarkjs.groth16)
    // it should be stringified
    let zkp = null;
    try {
      zkp = JSON.parse(req.query.zkp);
    } catch (err) {
      return res.status(400).json({ error: "Invalid zkp" });
    }
    
    if (!zkp?.proof || !zkp?.publicSignals) {
      return res.status(400).json({ error: "No zkp found" });
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

    if (session.status !== sessionStatusEnum.IN_PROGRESS) {
      if (session.status === sessionStatusEnum.VERIFICATION_FAILED) {
        return res.status(400).json({
          error: `Verification failed. Reason(s): ${session.verificationFailureReason}`,
        });
      }
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${sessionStatusEnum.IN_PROGRESS}'`,
      });
    }
  
    const zkpVerified = await groth16.verify(V3NameDOBVKey, zkp.publicSignals, zkp.proof);
    if (!zkpVerified) {
      return res.status(400).json({ error: "ZKP verification failed" });
    }
  
    const { 
      expiry,
      firstName, 
      lastName, 
      dateOfBirth, 
    } = parsePublicSignals(zkp.publicSignals);
  
    if (expiry < new Date()) {
      return res.status(400).json({ error: "Credentials have expired" });
    }

    // sanctions.io returns 301 if we query "<base-url>/search" but returns the actual result
    // when we query "<base-url>/search/" (with trailing slash).
    const sanctionsUrl = 'https://api.sanctions.io/search/' +
      '?min_score=0.85' +
      // TODO: Create a constant for the data sources
      // `&data_source=${encodeURIComponent('CFSP')}` +
      `&data_source=${encodeURIComponent('CAP,CCMC,CMIC,DPL,DTC,EL,FATF,FBI,FINCEN,FSE,INTERPOL,ISN,MEU,NONSDN,NS-MBS LIST,OFAC-COMPREHENSIVE,OFAC-MILITARY,OFAC-OTHERS,PEP,PLC,SDN,SSI,US-DOS-CRS')}` +
      `&name=${encodeURIComponent(`${firstName} ${lastName}`)}` +
      `&date_of_birth=${encodeURIComponent(dateOfBirth)}` +
      '&entity_type=individual';
    // TODO: Add country_residence to zkp
    // sanctionsUrl.searchParams.append('country_residence', 'us')
    const config = {
      headers: {
        'Accept': 'application/json; version=2.2',
        'Authorization': 'Bearer ' + process.env.SANCTIONS_API_KEY
      }
    }
    const resp = await fetch(sanctionsUrl, config)
    const data = await resp.json()

    if (data.count > 0) {
      return res.status(400).json({ error: 'Sanctions match found' });
    }
  
    const validationResult = validateScreeningResult(data);
    if (validationResult.error) {
      endpointLogger.error(validationResult.log.data, validationResult.log.msg);

      session.status = sessionStatusEnum.VERIFICATION_FAILED;
      session.verificationFailureReason = validationResult.error;
      await session.save()

      return res.status(400).json({ error: validationResult.error });
    }
  
    const uuid = govIdUUID(
      firstName, 
      lastName, 
      dateOfBirth, 
    );

    const dbResponse = await saveUserToDb(uuid);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds({
      firstName, 
      lastName, 
      dateOfBirth,
    });
  
    const response = JSON.parse(
      issuev2(
        process.env.HOLONYM_ISSUER_CLEAN_HANDS_PRIVKEY,
        issuanceNullifier,
        getDateAsInt(creds.rawCreds.birthdate).toString(),
        creds.derivedCreds.nameHash.value,
      )
    );
    response.metadata = creds;
    
    session.status = sessionStatusEnum.ISSUED;
    await session.save()
  
    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
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
  createPayPalOrder,
  payForSession,
  payForSessionV2,
  payForSessionV3,
  refund,
  refundV2,
  issueCreds,
  getSessions,
};
