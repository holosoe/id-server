// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'expr... Remove this comment to see the full error message
import express from "express";
import { getCredentials, postCredentials } from "../services/credentials.js";

const router = express.Router();

// Routes for accessing & modifying database containing user's encrypted credentials
router.get("/", getCredentials);
router.post("/", postCredentials);

export default router;
