import express from "express";
import { getCredentials, createSession, decisionWebhook } from "../services/veriff.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);
router.get("/decision-webhook", decisionWebhook);

export default router;
