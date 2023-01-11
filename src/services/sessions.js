import { v4 as uuidV4 } from "uuid";
import { ProofClient, ProofSession } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";
import { PROOF_SESSION_ACTIVE_DURATION } from "../utils/constants.js";

async function createSession(req, res) {
  logWithTimestamp("POST sessions/: Entered");
  const apiKey = req.headers["x-api-key"];

  const client = await ProofClient.findOne({
    apiKeys: { $elemMatch: { key: apiKey, active: true } },
  }).exec();
  if (!client) {
    logWithTimestamp("POST sessions/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  const sessionId = uuidV4();
  const proofSession = new ProofSession({
    sessionId,
    clientId: client.clientId,
    createdAt: new Date().getTime(),
  });
  await proofSession.save();

  logWithTimestamp(`POST sessions/: Created session with sessionId ${sessionId}`);

  // TODO: Include client's public encryption key in response so that frontend
  // can encrypt (at least part of) proof before sending it to the client

  return res.status(200).json({ sessionId });
}

async function useSession(req, res) {
  logWithTimestamp("GET sessions/<sessionId>: Entered");

  const sessionId = req.params.sessionId;
  if (!sessionId) {
    logWithTimestamp("GET sessions/<sessionId>: Session ID not provided");
    return res.status(400).json({ error: "Session ID not provided" });
  }

  const session = await ProofSession.findOne({ sessionId }).exec();
  if (!session) {
    logWithTimestamp(`GET sessions/<sessionId>: Session ${sessionId} not found`);
    return res.status(404).json({ error: "Session not found" });
  }
  if (session.consumedAt + PROOF_SESSION_ACTIVE_DURATION < new Date().getTime()) {
    logWithTimestamp(`GET sessions/<sessionId>: Session ${sessionId} expired`);
    return res.status(401).json({ error: "Session expired" });
  }
  if (session.consumedAt + PROOF_SESSION_ACTIVE_DURATION > new Date().getTime()) {
    if (session.consumedBy !== req.ip) {
      // TODO: Will this work if users are using VPN services?
      logWithTimestamp(
        `GET sessions/<sessionId>: Session ${sessionId} is in use by another IP`
      );
      return res.status(401).json({ error: "Session belongs to another user" });
    }
    logWithTimestamp(`GET sessions/<sessionId>: Session ${sessionId} is in use`);
    return res.status(200).json({ sessionId });
  }
  if (!session.consumedAt) {
    const consumedAt = new Date().getTime();
    logWithTimestamp(
      `GET sessions/<sessionId>: Session ${sessionId} being consumed by ${req.ip}`
    );
    session.consumedAt = consumedAt;
    session.consumedBy = req.ip;
    await session.save();
    return res.status(200).json({ sessionId });
  }
  return res.status(500).json({ error: "An unexpected error occurred" });
}

export { createSession, useSession };
