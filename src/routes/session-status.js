import express from "express";
import { getSessionStatus } from "../services/session-status.js";

const router = express.Router();

router.get("/", getSessionStatus);

export default router;
