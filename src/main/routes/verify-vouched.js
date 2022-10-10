import express from "express";
import { getCredentials } from "../services/verify-vouched.js";

const router = express.Router();

router.get("/vouchedCredentials", getCredentials);

export default router;
