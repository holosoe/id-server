import axios from "axios";
import { ObjectId } from "mongodb";
import { Session } from "../../init.js";
import {
  sessionStatusEnum,
  facetecServerBaseURL,
} from "../../constants/misc.js";
import {
  getDateAsInt,
  sha256,
  govIdUUID,
  objectIdElevenMonthsAgo,
} from "../../utils/utils.js";
import {
  validateFaceTecResponse,
  saveCollisionMetadata,
  saveUserToDb,
  updateSessionStatus,
} from "./functions-creds.js";
import { ethers } from "ethers";
import { poseidon } from "circomlibjs-old";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { pinoOptions, logger } from "../../utils/logger.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

export async function enrollment3d(req, res) {
  try {
    const sid = req.body.sid;
    const faceTecParams = req.body.faceTecParams;
    const issuanceNullifier = req.params.nullifier;

    // sessionType = "kyc" | "personhood"
    const sessionType = issuanceNullifier ? "personhood" : "kyc";

    let groupName = "";
    if (sessionType === "personhood") {
      groupName = process.env.FACETEC_GROUP_NAME_FOR_PERSONHOOD;
    } else if (sessionType === "kyc") {
      groupName = process.env.FACETEC_GROUP_NAME_FOR_KYC;
    }

    let duplicationCheck = false;
    if (sessionType === "personhood" || sessionType === "kyc") {
      duplicationCheck = true;
    }

    if (!sid) {
      return res
        .status(400)
        .json({ error: true, errorMessage: "sid is required" });
    }
    if (!faceTecParams) {
      return res
        .status(400)
        .json({ error: true, errorMessage: "faceTecParams is required" });
    }

    // --- Validate id-server session ---
    let objectId = null;
    try {
      objectId = new ObjectId(sid);
    } catch (err) {
      return res.status(400).json({ error: true, errorMessage: "Invalid sid" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res
        .status(404)
        .json({ error: true, errorMessage: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.IN_PROGRESS) {
      return res
        .status(400)
        .json({ error: true, errorMessage: "Session is not in progress" });
    }

    if (session.num_facetec_liveness_checks >= 5) {
      const failureReason =
        "User has reached the maximum number of allowed FaceTec liveness checks";
      // Fail session so user can collect refund
      await updateSessionStatus(
        session,
        sessionStatusEnum.VERIFICATION_FAILED,
        failureReason
      );

      return res.status(400).json({
        error: failureReason,
      });
    }

    // --- Forward request to FaceTec server ---

    let data = null;
    // TODO: For rate limiting, allow the user to enroll up to 5 times.
    // Once the user has reached this limit, do not allow them to create any more
    // facetec session tokens; also, obviously, do not let them enroll anymore.

    // Increment num_facetec_liveness_checks.
    // TODO: Make this atomic. Right now, this endpoint is subject to a
    // time-of-check-time-of-use attack. It's not a big deal since we only
    // care about a loose upper bound on the number of FaceTec checks per
    // user, but atomicity would be nice.
    await Session.updateOne(
      { _id: objectId },
      { $inc: { num_facetec_liveness_checks: 1 } }
    );

    try {
      if (sessionType === "personhood") faceTecParams.storeAsFaceVector = true;
      // console.log('enrollment-3d faceTecParams', faceTecParams)
      req.app.locals.sseManager.sendToClient(sid, {
        status: "in_progress",
        message: "liveness check: sending to server",
      });

      const enrollmentResponse = await axios.post(
        `${facetecServerBaseURL}/enrollment-3d`,
        faceTecParams,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Device-Key": req.headers["x-device-key"],
            "X-User-Agent": req.headers["x-user-agent"],
            "X-Api-Key": process.env.FACETEC_SERVER_API_KEY,
          },
        }
      );

      // check for enrollment success
      if (!enrollmentResponse.data.success) {
        // YES, session is still IN_PROGRESS
        // TODO: facetec: user should be able to retry enrollment
        let falseChecks = Object.values(
          enrollmentResponse.data.faceScanSecurityChecks
        ).filter((value) => value === false).length;

        if (falseChecks > 0) {
          return res.status(400).json({
            error: true,
            errorMessage: `liveness check failed. ${falseChecks} out of ${
              Object.keys(enrollmentResponse.data.faceScanSecurityChecks).length
            } checks failed`,
            triggerRetry: true,
          });
        } else {
          return res.status(400).json({
            error: true,
            errorMessage: "liveness enrollment failed",
            triggerRetry: true,
          });
        }
      }

      data = enrollmentResponse.data;
    } catch (err) {
      // For face scan and enrollment, one relevant error could come from faceScanSecurityChecks
      // user would be able to retry untill max attempts are reached
      // TODO: facetec: Look into facetec errors. For some, we
      // might want to fail the user's id-server session. For most,
      // we probably just want to forward the error to the user.

      if (err.request) {
        console.error(
          { error: err.request.data },
          "(err.request) Error during facetec enrollment-3d"
        );

        return res.status(502).json({
          error: true,
          errorMessage: "Did not receive a response from the FaceTec server",
          triggerRetry: true,
        });
      } else if (err.response) {
        console.error(
          { error: err.response.data },
          "(err.response) Error during facetec enrollment-3d"
        );

        return res.status(err.response.status).json({
          error: true,
          errorMessage: "FaceTec server returned an error",
          data: err.response.data,
          triggerRetry: true,
        });
      } else {
        console.error("err");
        console.error({ error: err }, "Error during FaceTec enrollment-3d");
        return res.status(500).json({
          error: true,
          errorMessage: "An unknown error occurred",
          triggerRetry: true,
        });
      }
    }

    // console.log("facetec POST /enrollment-3d response:", data);

    if (duplicationCheck) {
      // do duplication check here
      req.app.locals.sseManager.sendToClient(sid, {
        status: "in_progress",
        message: "duplicates check: sending to server",
      });

      console.log("/3d-db/search", {
        externalDatabaseRefID: faceTecParams.externalDatabaseRefID,
        minMatchLevel: 15,
        groupName: groupName,
      });
      const faceDbSearchResponse = await axios.post(
        `${facetecServerBaseURL}/3d-db/search`,
        {
          externalDatabaseRefID: faceTecParams.externalDatabaseRefID,
          minMatchLevel: 15,
          groupName: groupName,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Device-Key": req.headers["x-device-key"],
            "X-User-Agent": req.headers["x-user-agent"],
            "X-Api-Key": process.env.FACETEC_SERVER_API_KEY,
          },
        }
      );
      console.log("faceDbSearchResponse.data", faceDbSearchResponse.data);

      if (!faceDbSearchResponse.data.success) {
        return res.status(400).json({
          error: true,
          errorMessage: "duplicate check: search failed",
          triggerRetry: true,
        });
      }

      if (faceDbSearchResponse.data.results.length > 0) {
        // duplicates found, return error
        console.log(
          "duplicate check: found duplicates",
          faceDbSearchResponse.data.results.length,
          faceDbSearchResponse.data.results
        );
        await updateSessionStatus(
          session,
          sessionStatusEnum.VERIFICATION_FAILED,
          `Proof of personhood failed as highly matching duplicates are found.`
        );

        return res.status(400).json({
          error: true,
          errorMessage: "duplicate check: found duplicates",
          triggerRetry: false,
        });
      }
    }

    let issueV2Response = null;
    if (sessionType === "personhood") {
      // here we are all good to issue proof of personhood credential
      const uuidNew = govIdUUID(data.externalDatabaseRefID, "", "");

      // Store UUID for Sybil resistance
      const dbResponse = await saveUserToDb(
        uuidNew,
        data.additionalSessionData.sessionID
      );
      if (dbResponse.error) return res.status(400).json(dbResponse);

      console.log("issuev2", issuanceNullifier, data.externalDatabaseRefID);

      const refBuffers = data.externalDatabaseRefID
        .split("-")
        .map((x) => Buffer.from(x));
      const refArgs = refBuffers.map((x) =>
        ethers.BigNumber.from(x).toString()
      );
      const referenceHash = ethers.BigNumber.from(poseidon(refArgs)).toString();

      issueV2Response = JSON.parse(
        issuev2(
          process.env.HOLONYM_ISSUER_PRIVKEY,
          issuanceNullifier,
          referenceHash,
          "0".toString() // or use hash of scanResultBlob ???
        )
      );
      console.log("issueV2Response", issueV2Response);
      // issueV2Response.metadata = creds;

      // endpointLogger.info(
      //   { uuidV2: uuidNew, sessionId: sid },
      //   "Issuing credentials"
      // );
      console.log({ uuidV2: uuidNew, sessionId: sid }, "Issuing credentials");

      await updateSessionStatus(session, sessionStatusEnum.ISSUED);

      req.app.locals.sseManager.sendToClient(sid, {
        status: "completed",
        message: "proof of personhood: issued credentials, proceed to mint SBT",
      });
    }

    if (duplicationCheck) {
      // do /3d-db/enroll
      console.log("/3d-db/enroll", {
        externalDatabaseRefID: faceTecParams.externalDatabaseRefID,
        groupName: groupName,
      });
      const faceDbEnrollResponse = await axios.post(
        `${facetecServerBaseURL}/3d-db/enroll`,
        {
          externalDatabaseRefID: faceTecParams.externalDatabaseRefID,
          groupName: groupName,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Device-Key": req.headers["x-device-key"],
            "X-User-Agent": req.headers["x-user-agent"],
            "X-Api-Key": process.env.FACETEC_SERVER_API_KEY,
          },
        }
      );

      // this should be a rare case
      if (!faceDbEnrollResponse.data.success) {
        // TODO: facetec: if that happens, we would need to rewind above issueV2 steps
        return res
          .status(400)
          .json({ error: "duplicate check: enrollment failed" });
      }
    }

    // NOTE: This response shape is different from the veriff and onfido issuance
    // endpoints. This one includes some of the response from FaceTec
    if (sessionType === "personhood") {
      return res.status(200).json({
        issuedCreds: issueV2Response,
        scanResultBlob: data.scanResultBlob,
      });
    }

    // --- Forward response from FaceTec server ---

    if (data) return res.status(200).json(data);
    else return res.status(500).json({ error: "An unknown error occurred" });
  } catch (err) {
    console.log("POST /enrollment-3d: Error encountered", err.message);
    return res.status(500).json({
      error: true,
      errorMessage: "An unknown error occurred",
      triggerRetry: true,
    });
  }
}
