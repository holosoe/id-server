import express from "express";
import { getCredentials } from "../services/idenfy/credentials.js";
import { createSession } from "../services/idenfy/session.js";
import { webhook } from "../services/idenfy/webhooks.js";
import { verificationStatus } from "../services/idenfy/status.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);
router.get("/webhook", webhook);
router.get("/verification-status", verificationStatus);

export default router;
