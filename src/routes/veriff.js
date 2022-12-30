import express from "express";
import { getCredentials, decisionWebhook } from "../services/veriff.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.get("/decision-webhook", decisionWebhook);

export default router;
