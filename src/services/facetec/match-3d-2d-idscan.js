import axios from "axios";
import { ObjectId } from "mongodb";
import {
  Session,
  UserVerifications,
  VerificationCollisionMetadata,
} from "../../init.js";
import {
  sessionStatusEnum,
  facetecServerBaseURL,
} from "../../constants/misc.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import {
  getDateAsInt,
  sha256,
  govIdUUID,
  objectIdElevenMonthsAgo,
} from "../../utils/utils.js";
import {
  flattenScannedValues,
  validateFaceTecResponse,
  extractCreds,
  saveCollisionMetadata,
  saveUserToDb,
  updateSessionStatus
} from "./functions-creds.js";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /sessions] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

export async function match3d2dIdScan(req, res) {
  try {
    const sid = req.body.sid;
    const faceTecParams = req.body.faceTecParams;
    const issuanceNullifier = req.params.nullifier;

    if (!sid) {
      return res.status(400).json({ error: true, errorMessage: "sid is required" });
    }
    if (!faceTecParams) {
      return res.status(400).json({ error: true, errorMessage: "faceTecParams is required" });
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
      return res.status(404).json({ error: true, errorMessage: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.IN_PROGRESS) {
      return res.status(400).json({ error: true, errorMessage: "Session is not in progress" });
    }

    // --- Forward request to FaceTec server ---

    let data = null;
    try {
      console.log('idscan faceTecParams', faceTecParams)
      // set minMatchLevel from id-server
      faceTecParams.minMatchLevel =
        process.env.FACETEC_3D_2D_IDSCAN_MIN_MATCH_LEVEL;

      req.app.locals.sseManager.sendToClient(sid, {
        status: "in_progress",
        message: "id check: sending to server",
      });

      const resp = await axios.post(
        `${facetecServerBaseURL}/match-3d-2d-idscan`,
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
      data = resp.data;
    } catch (err) {
      // TODO: facetec: Look into facetec errors. For some, we
      // might want to fail the user's id-server session. For most,
      // we probably just want to forward the error to the user.

      if (err.request) {
        console.error(
          { error: err.request.data },
          "(err.request) Error during facetec match-3d-2d-idscan"
        );

        return res.status(502).json({
          error: true,
          errorMessage: "Did not receive a response from the FaceTec server",
          triggerRetry: true,
        });
      } else if (err.response) {
        console.error(
          { error: err.response.data },
          "(err.response) Error during facetec match-3d-2d-idscan"
        );

        return res.status(err.response.status).json({
          error: true,
          errorMessage: "FaceTec server returned an error",
          data: err.response.data,
          triggerRetry: true,
        });
      } else {
        console.error("err");
        console.error(
          { error: err },
          "Error during FaceTec match-3d-2d-idscan"
        );
        return res.status(500).json({
          error: true,
          errorMessage: "An unknown error occurred",
          triggerRetry: true,
        });
      }
    }

    console.log("facetec POST /match-3d-2d-idscan response:", data);

    // skip user confirmation and get credentials
    if (
      data.isReadyForUserConfirmation &&
      data.matchLevel >= process.env.FACETEC_3D_2D_IDSCAN_MIN_MATCH_LEVEL
    ) {
      console.log("match-3d-2d-idscan: isReadyForUserConfirmation");
      req.app.locals.sseManager.sendToClient(sid, {
        status: "in_progress",
        message: "id check: issuing credentials",
      });

      // copied off from match-3d-2d-idscan-and-get-creds.js
      const validationResult = validateFaceTecResponse(data);
      if (validationResult.error) {
        // endpointLogger.error(validationResult.log.data, validationResult.log.msg);

        // only update session status as VERIFICATION_FAILED
        // if triggerRetry is FALSE
        if (!validationResult.triggerRetry) {
          await updateSessionStatus(
            session,
            sessionStatusEnum.VERIFICATION_FAILED,
            validationResult.error
          );
        }

        return res.status(400).json({
          error: true,
          errorMessage: validationResult.errorMessage,
          triggerRetry: validationResult.triggerRetry,
        });
      }

      const creds = extractCreds(data);

      // Get UUID
      const uuidConstituents =
        (creds.rawCreds.firstName || "") +
        (creds.rawCreds.lastName || "") +
        (creds.rawCreds.zipCode || "") +
        (creds.rawCreds.birthdate || "");
      const uuidOld = sha256(Buffer.from(uuidConstituents)).toString("hex");

      const uuidNew = govIdUUID(
        creds.rawCreds.firstName,
        creds.rawCreds.lastName,
        creds.rawCreds.birthdate
      );
      console.log('uuidNew', uuidNew, creds.rawCreds.firstName, creds.rawCreds.lastName, creds.rawCreds.birthdate)

      // We started using a new UUID generation method on May 24, 2024, but we still
      // want to check the database for the old UUIDs too.

      // TODO: facetec: re-evaluate if below check is necessary for the new KYC flow
      // as OCR data might not be reliable, and we are doing deduplication based on /3d-db/search face search
      // Assert user hasn't registered yet
      const user = await UserVerifications.findOne({
        $or: [{ "govId.uuid": uuidOld }, { "govId.uuidV2": uuidNew }],
        // Filter out documents older than one year
        _id: { $gt: objectIdElevenMonthsAgo() },
      }).exec();
      if (user) {
        await saveCollisionMetadata(
          uuidOld,
          uuidNew,
          data.additionalSessionData.sessionID
        );

        // endpointLogger.error({ uuidV2: uuidNew }, "User has already registered.");
        console.error({ uuidV2: uuidNew }, "User has already registered.");
        await updateSessionStatus(
          session,
          sessionStatusEnum.VERIFICATION_FAILED,
          `User has already registered. User ID: ${user._id}`
        );
        return res
          .status(400)
          .json({ error: true, errorMessage: `User has already registered. User ID: ${user._id}`, triggerRetry: false });
      }

      // Store UUID for Sybil resistance
      const dbResponse = await saveUserToDb(
        uuidNew,
        data.additionalSessionData.sessionID
      );
      if (dbResponse.error) return res.status(400).json(dbResponse);

      console.log("issuev2", process.env.HOLONYM_ISSUER_PRIVKEY, issuanceNullifier, creds.rawCreds.countryCode.toString(), creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value)
      const response = JSON.parse(
        issuev2(
          process.env.HOLONYM_ISSUER_PRIVKEY,
          issuanceNullifier,
          creds.rawCreds.countryCode.toString(),
          creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
        )
      );
      response.metadata = creds;

      // TODO: facetec: FaceTec doesn't expose any DELETE endpoints. We should
      // add delete endpoints to the custom FaceTec server that we run.
      // await deleteFaceTecSession(data.additionalSessionData.sessionID);

      // endpointLogger.info(
      //   { uuidV2: uuidNew, sessionId: req.query.sessionId },
      //   "Issuing credentials"
      // );
      console.log(
        { uuidV2: uuidNew, sessionId: req.query.sessionId },
        "Issuing credentials"
      );

      await updateSessionStatus(session, sessionStatusEnum.ISSUED);

      req.app.locals.sseManager.sendToClient(sid, {
        status: "completed",
        message: "id check: issued credentials, proceed to mint SBT",
      });

      // NOTE: This response shape is different from the veriff and onfido issuance
      // endpoints. This one includes some of the response from FaceTec
      return res.status(200).json({
        issuedCreds: response,
        scanResultBlob: data.scanResultBlob,
      });
    }

    // --- Forward response from FaceTec server ---
    if (data) return res.status(200).json(data);
    else return res.status(500).json({ error: true, errorMessage: "An unknown error occurred", triggerRetry: true });
  } catch (err) {
    console.log("POST /match-3d-2d-idscan: Error encountered", err.message);
    return res.status(500).json({ error: true, errorMessage: "An unknown error occurred", triggerRetry: true });
  }
}
