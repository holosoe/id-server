// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'expr... Remove this comment to see the full error message
import express from "express";
import { getCredentials } from "../services/veriff/credentials.js";
import { createSession } from "../services/veriff/session.js";
import { decisionWebhook } from "../services/veriff/webhooks.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);
router.get("/decision-webhook", decisionWebhook);

export default router;
