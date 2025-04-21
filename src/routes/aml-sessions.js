import express from "express";
import {
  postSession,
  createPayPalOrder,
  payForSession,
  payForSessionV2,
  payForSessionV3,
  refund,
  refundV2,
  issueCreds,
  issueCredsV2,
  getSessions,
} from "../services/aml-sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.get("/", getSessions);
router.post("/:_id/pay", payForSession);
router.post("/:_id/pay/v2", payForSessionV2);
router.post("/:_id/paypal-order", createPayPalOrder);
// router.post("/:_id/v2", createIdvSessionV2);
router.post("/:_id/v3", payForSessionV3);
// router.post("/:_id/refund", refund); // TODO: Uncomment
router.post("/:_id/refund/v2", refundV2);
router.get("/:_id/credentials/:nullifier", issueCreds);
router.get("/:_id/credentials/v2/:nullifier", issueCredsV2);

export default router;
