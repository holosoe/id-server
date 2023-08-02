import express from "express";
import { getCredentials } from "../services/idenfy/credentials.js";
import { createSession } from "../services/idenfy/session.js";

const router = express.Router();

router.get("/credentials", getCredentials);
router.post("/session", createSession);

export default router;
