import { v4 as uuidV4 } from "uuid";
import { ProofClient, ProofSession } from "../init.js";
import { logWithTimestamp, hash } from "../utils/utils.js";
import { SALT, MAX_CLIENT_API_KEYS } from "../utils/constants.js";

async function login(req, res) {
  logWithTimestamp("POST sessions/: Entered");
  const auth = req.headers["authorization"];

  if (!auth) {
    logWithTimestamp("POST sessions/: Authorization header not provided");
    return res.status(400).json({ error: "Authorization header not provided" });
  }

  const [type, credentials] = auth.split(" ");
  if (type !== "Basic") {
    logWithTimestamp("POST sessions/: Authorization type not supported");
    return res.status(400).json({ error: "Authorization type not supported" });
  }

  const decodedCredentials = Buffer.from(credentials, "base64").toString("ascii");
  const [username, password] = decodedCredentials.split(":");
  const passwordDigest = hash(Buffer.from(password + SALT, "utf8")).toString("hex");

  const client = await ProofClient.findOne({
    username,
    passwordDigest,
  }).exec();
  if (!client) {
    logWithTimestamp("POST sessions/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  logWithTimestamp(`POST sessions/: Client ${username} logged in`);
  return res.status(200).json({ data: "Login successful" });
}

async function getApiKeys(req, res) {
  logWithTimestamp("GET proof-clients/api-keys/: Entered");
  const auth = req.headers["authorization"];

  if (!auth) {
    logWithTimestamp("GET proof-clients/api-keys/: Authorization header not provided");
    return res.status(400).json({ error: "Authorization header not provided" });
  }

  const [type, credentials] = auth.split(" ");
  if (type !== "Basic") {
    logWithTimestamp("GET proof-clients/api-keys/: Authorization type not supported");
    return res.status(400).json({ error: "Authorization type not supported" });
  }

  const decodedCredentials = Buffer.from(credentials, "base64").toString("ascii");
  const [username, password] = decodedCredentials.split(":");
  const passwordDigest = hash(Buffer.from(password + SALT, "utf8")).toString("hex");

  const client = await ProofClient.findOne({
    username,
    passwordDigest,
  }).exec();
  if (!client) {
    logWithTimestamp("GET proof-clients/api-keys/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  logWithTimestamp(`GET proof-clients/api-keys/: Client ${client.username} found`);
  return res.status(200).json({ username: client.username, apiKeys: client.apiKeys });
}

async function createAPIKey(req, res) {
  logWithTimestamp("POST proof-clients/api-keys/: Entered");
  const auth = req.headers["authorization"];

  if (!auth) {
    logWithTimestamp(
      "POST proof-clients/api-keys/: Authorization header not provided"
    );
    return res.status(400).json({ error: "Authorization header not provided" });
  }

  const [type, credentials] = auth.split(" ");
  if (type !== "Basic") {
    logWithTimestamp("POST proof-clients/api-keys/: Authorization type not supported");
    return res.status(400).json({ error: "Authorization type not supported" });
  }

  const decodedCredentials = Buffer.from(credentials, "base64").toString("ascii");
  const [username, password] = decodedCredentials.split(":");
  const passwordDigest = hash(Buffer.from(password + SALT, "utf8")).toString("hex");

  const client = await ProofClient.findOne({
    username,
    passwordDigest,
  }).exec();
  if (!client) {
    logWithTimestamp("POST proof-clients/api-keys/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  if (client.apiKeys.filter((key) => !key.active).length >= MAX_CLIENT_API_KEYS) {
    logWithTimestamp(
      `POST proof-clients/api-keys/: Client ${client.username} has reached maximum number of active API keys`
    );
    return res.status(400).json({
      error:
        "Maximum number of active API keys reached. Please revoke an API key before adding another one.",
    });
  }

  const newApiKey = { key: `HOLO${uuidV4()}NYM`, active: true };
  client.apiKeys.push(newApiKey);
  await client.save();

  logWithTimestamp(
    `POST proof-clients/api-keys/: API key created for client ${client.username}`
  );
  return res.status(200).json({ apiKey: newApiKey });
}

async function revokeAPIKey(req, res) {
  logWithTimestamp("DELETE proof-clients/api-keys/: Entered");
  const auth = req.headers["authorization"];

  if (!auth) {
    logWithTimestamp(
      "DELETE proof-clients/api-keys/: Authorization header not provided"
    );
    return res.status(400).json({ error: "Authorization header not provided" });
  }

  const [type, credentials] = auth.split(" ");
  if (type !== "Basic") {
    logWithTimestamp(
      "DELETE proof-clients/api-keys/: Authorization type not supported"
    );
    return res.status(400).json({ error: "Authorization type not supported" });
  }

  const decodedCredentials = Buffer.from(credentials, "base64").toString("ascii");
  const [username, password] = decodedCredentials.split(":");
  const passwordDigest = hash(Buffer.from(password + SALT, "utf8")).toString("hex");

  const client = await ProofClient.findOne({
    username,
    passwordDigest,
  }).exec();
  if (!client) {
    logWithTimestamp("DELETE proof-clients/api-keys/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  const apiKey = req.params.apiKey;
  console.log("apiKey", apiKey);
  console.log("client apiKeys", client.apiKeys);
  const apiKeyIndex = client.apiKeys.findIndex((key) => key.key === apiKey);
  if (apiKeyIndex === -1) {
    logWithTimestamp("DELETE proof-clients/api-keys/: API key not found");
    return res.status(404).json({ error: "API key not found" });
  }
  client.apiKeys[apiKeyIndex].active = false;
  await client.save();

  logWithTimestamp(
    `DELETE proof-clients/api-keys/: API key revoked for client ${client.username}`
  );
  return res.status(200).json({ apiKey: client.apiKeys[apiKeyIndex] });
}

async function getSessions(req, res) {
  logWithTimestamp("GET proof-clients/sessions/: Entered");
  const auth = req.headers["authorization"];

  if (!auth) {
    logWithTimestamp("GET proof-clients/sessions/: Authorization header not provided");
    return res.status(400).json({ error: "Authorization header not provided" });
  }

  const [type, credentials] = auth.split(" ");
  if (type !== "Basic") {
    logWithTimestamp("GET proof-clients/sessions/: Authorization type not supported");
    return res.status(400).json({ error: "Authorization type not supported" });
  }

  const decodedCredentials = Buffer.from(credentials, "base64").toString("ascii");
  const [username, password] = decodedCredentials.split(":");
  const passwordDigest = hash(Buffer.from(password + SALT, "utf8")).toString("hex");

  const client = await ProofClient.findOne({
    username,
    passwordDigest,
  }).exec();
  if (!client) {
    logWithTimestamp("GET proof-clients/sessions/: Client not found");
    return res.status(401).json({ error: "Client not found" });
  }

  const sessions = await ProofSession.find({ clientId: client.clientId }).exec();

  logWithTimestamp(`GET proof-clients/sessions/: Client ${client.username} found`);
  return res.status(200).json({ username: client.username, sessions: sessions });
}

export { login, getApiKeys, createAPIKey, revokeAPIKey, getSessions };
