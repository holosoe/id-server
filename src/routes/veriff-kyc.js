import express from "express";
import { getCredentials, getCredentialsV2 } from "../services/veriff/credentials.js";
import { v1CreateSession, v2CreateSession } from "../services/veriff/session.js";
import { decisionWebhook } from "../services/veriff/webhooks.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.get("/credentials/v2/:nullifier", getCredentialsV2);

// TODO: Remove the following 2 endpoints once pay-first frontend is live
router.post("/session", v1CreateSession);
router.post("/v2/session", v2CreateSession);

router.get("/decision-webhook", decisionWebhook);

export default router;
