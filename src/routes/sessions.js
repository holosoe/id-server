import express from "express";
import {
  postSession,
  createIdvSession,
  getSessions,
} from "../services/sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.post("/:_id/idv-session", createIdvSession);
router.get("/", getSessions);

export default router;
