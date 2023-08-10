import { createHmac } from "crypto";
import axios from "axios";
import { IDVSessions } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";

async function getVeriffSessionDecision(sessionId) {
  try {
    const hmacSignature = createHmac("sha256", process.env.VERIFF_SECRET_API_KEY)
      .update(Buffer.from(sessionId, "utf8"))
      .digest("hex")
      .toLowerCase();
    const resp = await axios.get(
      `https://api.veriff.me/v1/sessions/${sessionId}/decision`,
      {
        headers: {
          "X-AUTH-CLIENT": process.env.VERIFF_PUBLIC_API_KEY,
          "X-HMAC-SIGNATURE": hmacSignature,
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(err);
  }
}

async function getVeriffSessionStatus(sessions) {
  if (!sessions?.veriff?.sessions || sessions.veriff.sessions.length === 0) {
    return;
  }

  // Get the decision for each session. If one is "Approved", return "Approved".
  // Otherwise, return the status of the latest session.

  const decisionsWithTimestamps = [];
  for (const session of sessions.veriff.sessions) {
    const decision = await getVeriffSessionDecision(session.sessionId);
    decisionsWithTimestamps.push({
      decision,
      createdAt: session.createdAt,
    });
    if (decision?.verification?.status === "approved") {
      return { status: decision?.verification?.status, sessionId: session.sessionId };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestDecision = decisionsWithTimestamps.reduce((prev, current) =>
    prev.createdAt > current.createdAt ? prev : current
  ).decision;

  return {
    status: latestDecision?.verification?.status,
    sessionId: latestDecision?.verification?.id,
  };
}

async function getIdenfySession(scanRef) {
  try {
    const resp = await axios.post(
      `https://ivs.idenfy.com/api/v2/status`,
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(err);
  }
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
    sessionsWithTimestamps.push({
      session,
      createdAt: sessionMetadata.createdAt,
    });
    if (session?.status === "APPROVED") {
      return { status: session?.status, scanRef: sessionMetadata.scanRef };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestSession = sessionsWithTimestamps.reduce((prev, current) =>
    prev.createdAt > current.createdAt ? prev : current
  ).session;

  // console.log("idenfy: latestSession", latestSession);

  return { status: latestSession?.status, scanRef: latestSession?.scanRef };
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
    console.error(err);
  }
}

async function getOnfidoSessionStatus(sessions) {
  if (!sessions?.onfido?.checks || sessions.onfido.checks.length === 0) {
    return;
  }

  // Get each check. If one is "complete", return "complete".
  // Otherwise, return the status of the latest check.

  const sessionsWithTimestamps = [];
  for (const sessionMetadata of sessions.onfido.checks) {
    const check = await getOnfidoCheck(sessionMetadata.check_id);
    sessionsWithTimestamps.push({
      check,
      createdAt: sessionMetadata.createdAt,
    });
    if (check?.status === "complete") {
      return { status: check?.status, check_id: sessionMetadata.check_id };
    }
  }

  // Find the decision with the most recent createdAt timestamp
  const latestCheck = sessionsWithTimestamps.reduce((prev, current) =>
    prev.createdAt > current.createdAt ? prev : current
  ).check;

  // console.log("onfido: latestCheck", latestCheck);

  return { status: latestCheck?.status, check_id: latestCheck?.check_id };
}

/**
 * ENDPOINT
 */
async function getSessionStatus(req, res) {
  try {
    const sigDigest = req.query.sigDigest;

    if (!sigDigest) {
      logWithTimestamp(`session-status: Missing sigDigest`);
      return res.status(400).json({ error: "Missing sigDigest" });
    }

    const sessions = await IDVSessions.findOne({ sigDigest }).exec();

    const sessionStatuses = {
      veriff: await getVeriffSessionStatus(sessions),
      idenfy: await getIdenfySessionStatus(sessions),
      onfido: await getOnfidoSessionStatus(sessions),
    };

    // console.log("sessionStatuses", sessionStatuses);

    return res.status(200).json(sessionStatuses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getSessionStatus };
