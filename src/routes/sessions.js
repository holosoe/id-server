import express from "express";
import {
  postSession,
  createPayPalOrder,
  createIdvSession,
  createIdvSessionV2,
  refreshOnfidoToken,
  createOnfidoCheckEndpoint,
  refund,
  getSessions,
} from "../services/sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.post("/:_id/paypal-order", createPayPalOrder);
router.post("/:_id/idv-session", createIdvSession);
router.post("/:_id/idv-session/v2", createIdvSessionV2);
router.post("/:_id/idv-session/refund", refund);
router.post("/:_id/idv-session/onfido/token", refreshOnfidoToken);
router.post("/:_id/idv-session/onfido/check", createOnfidoCheckEndpoint);
router.get("/", getSessions);

export default router;
