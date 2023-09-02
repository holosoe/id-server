import express from "express";
import {
  postSession,
  createIdvSession,
  createOnfidoCheckEndpoint,
  getSessions,
} from "../services/sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.post("/:_id/idv-session", createIdvSession);
router.post("/:_id/idv-session/onfido/check", createOnfidoCheckEndpoint);
router.get("/", getSessions);

export default router;
