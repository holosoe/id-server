import express from "express";
import { createSession, useSession } from "../services/sessions.js";

const router = express.Router();

router.post("/", createSession);
router.get("/:sessionId", useSession);

export default router;
