import { ObjectId } from "mongodb";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { groth16 } from "snarkjs";
import { 
  UserVerifications, 
  AMLChecksSession, 
  SessionRefundMutex 
} from "../../init.js";
import { getAccessToken as getPayPalAccessToken } from "../../utils/paypal.js";
import {
  validateTxForSessionCreation,
  refundMintFeeOnChain,
} from "../../utils/transactions.js";
import { cleanHandsDummyUserCreds } from "../../utils/constants.js";
import { getDateAsInt, govIdUUID } from "../../utils/utils.js";
import {
  supportedChainIds,
  amlChecksSessionStatusEnum,
  amlSessionUSDPrice,
} from "../../constants/misc.js";
import V3NameDOBVKey from "../../constants/zk/V3NameDOB.verification_key.json" assert { type: "json" };
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

function parsePublicSignals(publicSignals) {
  return {
    expiry: new Date(Number(publicSignals[1]) * 1000),
    firstName: Buffer.from(BigInt(publicSignals[2]).toString(16), 'hex').toString(),
    lastName: Buffer.from(BigInt(publicSignals[3]).toString(16), 'hex').toString(),
    dateOfBirth: new Date((Number(publicSignals[4]) - 2208988800) * 1000),
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

function extractCreds(personData) {
  const person = personData.person;
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

    if (session.status !== amlChecksSessionStatusEnum.IN_PROGRESS_CHECK_CREATED) {
      if (session.status === amlChecksSessionStatusEnum.VERIFICATION_FAILED) {
        return res.status(400).json({
          error: `Verification failed. Reason(s): ${session.verificationFailureReason}`,
        });
      }
      return res.status(400).json({
        error: `Session status is '${session.status}'. Expected '${amlChecksSessionStatusEnum.IN_PROGRESS_CHECK_CREATED}'`,
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

    const sanctionsUrl = new URL('https://api.sanctions.io/search')
    sanctionsUrl.searchParams.append('min_score', '0.85')
    // TODO: Create a constant for the data sources
    sanctionsUrl.searchParams.append('data_source', 'PEP,SDN,HM Treasury,CCMC,CFSP,FATF,FBI,FINCEN,INTERPOL,MEU')
    sanctionsUrl.searchParams.append('name', `${firstName} ${lastName}`)
    sanctionsUrl.searchParams.append('date_of_birth', dateOfBirth.toISOString().slice(0, 10))
    sanctionsUrl.searchParams.append('entity_type', 'individual')
    sanctionsUrl.searchParams.append('country_residence', 'us')
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

      session.status = amlChecksSessionStatusEnum.VERIFICATION_FAILED;
      session.verificationFailureReason = validationResult.error;
      await session.save()

      return res.status(400).json({ error: validationResult.error });
    }
  
    const uuid = govIdUUID(
      personResp.person.firstName, 
      personResp.person.lastName, 
      personResp.person.dateOfBirth
    );

    const dbResponse = await saveUserToDb(uuid);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(personResp);
  
    const response = JSON.parse(
      issuev2(
        process.env.HOLONYM_ISSUER_CLEAN_HANDS_PRIVKEY,
        issuanceNullifier,
        getDateAsInt(creds.rawCreds.birthdate).toString(),
        creds.derivedCreds.nameHash.value,
      )
    );
    response.metadata = creds;
    
    session.status = amlChecksSessionStatusEnum.ISSUED;
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
  // createPayPalOrder,
  payForSession,
  refund,
  // refundV2,
  issueCreds,
  getSessions,
};
