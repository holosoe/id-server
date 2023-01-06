import express from "express";
import { getCredentials } from "../services/veriff/credentials.js";
import { createSession } from "../services/veriff/session.js";
import { decisionWebhook } from "../services/veriff/webhooks.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);
router.get("/decision-webhook", decisionWebhook);

export default router;
