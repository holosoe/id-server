import express from "express";
import {
  postSession,
  // createPayPalOrder,
  payForSession,
  refund,
  refundV2,
  issueCreds,
  getSessions,
} from "../services/aml-sessions/endpoints.js";

const router = express.Router();

router.post("/", postSession);
router.get("/", getSessions);
router.post("/:_id/pay", payForSession);
// router.post("/:_id/paypal-order", createPayPalOrder);
// router.post("/:_id/v2", createIdvSessionV2);
// router.post("/:_id/v3", createIdvSessionV3);
// router.post("/:_id/refund", refund); // TODO: Uncomment
router.post("/:_id/refund/v2", refundV2);
router.get("/:_id/credentials/:nullifier", issueCreds);

export default router;
