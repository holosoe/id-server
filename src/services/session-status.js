import axios from "axios";
import { Session, IDVSessions } from "../init.js";
import logger from "../utils/logger.js";
import { getVeriffSessionDecision } from "../utils/veriff.js";
import { getIdenfySessionStatus as getIdenfySession } from "../utils/idenfy.js";
import { getOnfidoReports } from "../utils/onfido.js";

const endpointLogger = logger.child({ msgPrefix: "[GET /session-status] " });
const endpointLoggerV2 = logger.child({ msgPrefix: "[GET /session-status/v2] " });

async function getVeriffSessionStatus(sessions) {
  if (!sessions?.veriff?.sessions || sessions.veriff.sessions.length === 0) {
    return;
  }

  // Get the decision for each session. If one is "Approved", return "Approved".
  // Otherwise, return the status of the latest session.

  const decisionsWithTimestamps = [];
  for (const session of sessions.veriff.sessions) {
    const decision = await getVeriffSessionDecision(session.sessionId);
    if (!decision) continue;
    decisionsWithTimestamps.push({
      decision,
      createdAt: session.createdAt,
    });
    if (decision?.verification?.status === "approved") {
      return { status: decision?.verification?.status, sessionId: session.sessionId };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestDecision =
    decisionsWithTimestamps.length > 0
      ? decisionsWithTimestamps.reduce((prev, current) =>
          prev.createdAt > current.createdAt ? prev : current
        ).decision
      : null;

  return {
    status: latestDecision?.verification?.status,
    sessionId: latestDecision?.verification?.id,
    // failureReason should be populated with a reason for verification failure
    // iff the verification failed. If verification is in progress, it should be null.
    failureReason: latestDecision?.verification?.reason,
  };
}

async function getIdenfySessionStatus(sessions) {
  if (!sessions?.idenfy?.sessions || sessions.idenfy.sessions.length === 0) {
    return;
  }

  // Get each session. If one is "APPROVED", return "APPROVED".
  // Otherwise, return the status of the latest session.

  const sessionsWithTimestamps = [];
  for (const sessionMetadata of sessions.idenfy.sessions) {
    const session = await getIdenfySession(sessionMetadata.scanRef);
    if (!session) continue;
    sessionsWithTimestamps.push({
      session,
      createdAt: sessionMetadata.createdAt,
    });
    if (session?.status === "APPROVED") {
      return { status: session?.status, scanRef: sessionMetadata.scanRef };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestSession =
    sessionsWithTimestamps.length > 0
      ? sessionsWithTimestamps.reduce((prev, current) =>
          prev.createdAt > current.createdAt ? prev : current
        ).session
      : null;

  let failureReason = undefined;
  if (
    (latestSession?.fraudTags ?? []).length > 0 ||
    (latestSession?.mismatchTags ?? []).length > 0 ||
    (latestSession?.manualDocument &&
      latestSession.manualDocument !== "DOC_VALIDATED") ||
    (latestSession?.manualFace && latestSession.manualFace !== "DOC_VALIDATED")
  ) {
    failureReason = {
      fraudTags: latestSession?.fraudTags,
      mismatchTags: latestSession?.mismatchTags,
      manualDocument: latestSession?.manualDocument,
      manualFace: latestSession?.manualFace,
    };
  }

  return {
    status: latestSession?.status,
    scanRef: latestSession?.scanRef,
    // failureReason should be populated with a reason for verification failure
    // iff the verification failed. If verification is in progress, it should be null.
    failureReason,
  };
}

async function getOnfidoCheck(check_id) {
  try {
    const resp = await axios.get(`https://api.us.onfido.com/v3.6/checks/${check_id}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    });
    return resp.data;
  } catch (err) {
    endpointLogger.error(
      { error: err, check_id },
      "An error occurred while getting onfido check"
    );
    // Onfido deletes checks after 30 days. So, if we get a 410, delete the check
    // from IDVSessions.
    if (err.response?.status === 410) {
      // We don't await here because the result of this operation isn't necessary
      // for subsequent operations
      IDVSessions.findOneAndUpdate(
        { "onfido.checks.check_id": check_id },
        {
          $pull: {
            "onfido.checks": {
              check_id,
            },
          },
        }
      ).exec();
    }
  }
}

function getOnfidoVerificationFailureReasons(reports) {
  const failureReasons = [];
  for (const report of reports) {
    if (report.status !== "complete") {
      failureReasons.push(`Report status is '${report.status}'. Expected 'complete'.`);
    }
    for (const majorKey of Object.keys(report.breakdown ?? {})) {
      if (report.breakdown[majorKey]?.result !== "clear") {
        for (const minorkey of Object.keys(
          report.breakdown[majorKey]?.breakdown ?? {}
        )) {
          const minorResult = report.breakdown[majorKey].breakdown[minorkey].result;
          if (minorResult !== null && minorResult !== "clear") {
            failureReasons.push(
              `Result of ${minorkey} in ${majorKey} breakdown is '${minorResult}'. Expected 'clear'.`
            );
          }
        }
      }
    }
  }
  return failureReasons;
}

async function getOnfidoSessionStatus(sessions) {
  if (!sessions?.onfido?.checks || sessions.onfido.checks.length === 0) {
    return;
  }

  // Get each check. If one is "complete" (and result is "clear"), return "complete".
  // Otherwise, return the status of the latest check.

  const sessionsWithTimestamps = [];
  for (const sessionMetadata of sessions.onfido.checks) {
    const check = await getOnfidoCheck(sessionMetadata.check_id);
    if (!check) continue;
    sessionsWithTimestamps.push({
      check,
      createdAt: sessionMetadata.createdAt,
    });
    if (check?.status === "complete" && check?.result === "clear") {
      return {
        status: check?.status,
        result: check.result,
        check_id: sessionMetadata.check_id,
      };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestCheck =
    sessionsWithTimestamps.length > 0
      ? sessionsWithTimestamps.reduce((prev, current) =>
          prev.createdAt > current.createdAt ? prev : current
        ).check
      : null;

  let failureReason = undefined;

  if (latestCheck?.status === "complete" && latestCheck?.result === "consider") {
    const reports = (await getOnfidoReports(latestCheck?.report_ids)) ?? [];
    failureReason = getOnfidoVerificationFailureReasons(reports);
  }

  return {
    status: latestCheck?.status,
    result: latestCheck?.result,
    check_id: latestCheck?.check_id,
    // failureReason should be populated with a reason for verification failure
    // iff the verification failed. If verification is in progress, it should be null.
    failureReason,
  };
}

/**
 * ENDPOINT
 */
async function getSessionStatus(req, res) {
  try {
    const sigDigest = req.query.sigDigest;
    const provider = req.query.provider; // not required

    if (!sigDigest) {
      return res.status(400).json({ error: "Missing sigDigest" });
    }

    const sessions = await IDVSessions.findOne({ sigDigest }).exec();

    // If provider is specified, only return the status for that provider. This
    // helps avoid unnecessary API calls.
    if (provider) {
      if (provider === "veriff") {
        return res
          .status(200)
          .json({ veriff: await getVeriffSessionStatus(sessions) });
      } else if (provider === "idenfy") {
        return res
          .status(200)
          .json({ idenfy: await getIdenfySessionStatus(sessions) });
      } else if (provider === "onfido") {
        return res
          .status(200)
          .json({ onfido: await getOnfidoSessionStatus(sessions) });
      }
    }

    const sessionStatuses = {
      veriff: await getVeriffSessionStatus(sessions),
      idenfy: await getIdenfySessionStatus(sessions),
      onfido: await getOnfidoSessionStatus(sessions),
    };

    // console.log("sessionStatuses", sessionStatuses);

    return res.status(200).json(sessionStatuses);
  } catch (err) {
    endpointLogger.error(
      { error: err },
      "An unknown error occurred while retrieving session status"
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT
 */
async function getSessionStatusV2(req, res) {
  try {
    const sid = req.query.sid;

    if (!sid) {
      return res.status(400).json({ error: "Missing sid" });
    }

    const session = await Session.findOne({ _id: sid }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.idvProvider === "veriff") {
      const decision = await getVeriffSessionDecision(session.sessionId);
      if (!decision) {
        return res.status(404).json({ error: "IDV Session not found" });
      }

      return res.status(200).json({
        veriff: {
          status: decision?.verification?.status,
          sessionId: session.sessionId,
        },
      });
    } else if (session.idvProvider === "idenfy") {
      const idenfySession = await getIdenfySession(session.scanRef);
      if (!idenfySession) {
        return res.status(404).json({ error: "IDV Session not found" });
      }

      return res.status(200).json({
        idenfy: {
          status: idenfySession?.status,
          scanRef: session.scanRef,
        },
      });
    } else if (session.idvProvider === "onfido") {
      const check = await getOnfidoCheck(session.check_id);
      if (!check) {
        return res.status(404).json({ error: "IDV Session not found" });
      }

      return res.status(200).json({
        onfido: {
          status: check?.status,
          result: check?.result,
          check_id: session.check_id,
        },
      });
    } else {
      return res.status(500).json({ error: "Unknown idvProvider" });
    }
  } catch (err) {
    endpointLoggerV2.error(
      { error: err },
      "An unknown error occurred while retrieving session status"
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getSessionStatus, getSessionStatusV2 };
