import express from "express";
import { getCredentials } from "../services/veriff/credentials";
import { createSession } from "../services/veriff/session";
import { decisionWebhook } from "../services/veriff/webhooks";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);
router.get("/decision-webhook", decisionWebhook);

export default router;
