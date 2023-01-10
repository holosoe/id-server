import { v4 as uuidV4 } from "uuid";
import { ProofClient, ProofSession } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";

async function createSession(req, res) {
  logWithTimestamp("POST sessions/: Entered");
  // TODO: Better API key management
  const apiKey = req.headers["x-api-key"];

  const client = await ProofClient.findOne({ apiKey }).exec();
  if (!client) {
    logWithTimestamp("POST sessions/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  const sessionId = uuidV4();
  const proofSession = new ProofSession({
    sessionId,
    clientId: client.clientId,
    stale: false,
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
  if (session.stale) {
    logWithTimestamp(`GET sessions/<sessionId>: Session ${sessionId} is stale`);
    return res.status(401).json({ error: "Session is stale" });
  }

  session.stale = true;
  await session.save();

  return res.status(200).json({ sessionId });
}

export { createSession, useSession };
