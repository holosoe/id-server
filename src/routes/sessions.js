import express from "express";
import {
  postSession,
  createIdvSession,
  refreshOnfidoToken,
  createOnfidoCheckEndpoint,
  refund,
  getSessions,
  createIdvSessionSandbox,
} from "../services/sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.post("/:_id/idv-session", createIdvSession);
router.post("/:_id/idv-session/refund", refund);
router.post("/:_id/idv-session/onfido/token", refreshOnfidoToken);
router.post("/:_id/idv-session/onfido/check", createOnfidoCheckEndpoint);
router.get("/", getSessions);

// router.post("/:_id/idv-session/sandbox", createIdvSessionSandbox);

export default router;
