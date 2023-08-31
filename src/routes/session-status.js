import express from "express";
import { getSessionStatus } from "../services/session-status.js";

const router = express.Router();

// TODO: Uncomment this route. First, however, refactor it to work
// with the new sessions collection, not with the IDVSessions collection.
// router.get("/", getSessionStatus);

export default router;
