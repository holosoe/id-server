import express from "express";
import { acceptFrontendRedirect } from "../services/register.vouched.service.js";

const router = express.Router();

// router.get("/vouched", startVouchedInquiry);
// router.post("/vouchedResult", acceptVouchedResult);
router.get("/vouchedCredentials", acceptFrontendRedirect);

export default router;
