import express from "express";
import {
  getUserVerification,
  deleteUserVerification,
} from "../services/admin/user-verifications.js";
import { deleteUserData } from "../services/admin/user-idv-data.js";
import { transferFunds } from "../services/admin/transfer-funds.js";
import { setSessionIdvProvider } from "../services/admin/set-session-idv-provider.js";
import { userSessions } from "../services/admin/user-sessions.js";
import { failSession } from "../services/admin/fail-session.js";
import { refundUnusedTransaction } from "../services/admin/refund-unused-transaction.js";
import { refundFailedSession } from "../services/admin/refund-failed-session.js";
import { issueVeraxAttestation } from "../services/admin/issue-verax-attestation.js";

const router = express.Router();

router.get("/user-verification", getUserVerification);
router.delete("/user-verification", deleteUserVerification);
router.delete("/user-idv-data", deleteUserData);
router.post("/transfer-funds", transferFunds);
router.post("/set-session-idv-provider", setSessionIdvProvider);
router.post("/user-sessions", userSessions);
router.post("/fail-session", failSession);
router.post("/refund-unused-transaction", refundUnusedTransaction);
router.post("/refund-failed-session", refundFailedSession);
router.post("/issue-verax-attestation", issueVeraxAttestation);

export default router;
