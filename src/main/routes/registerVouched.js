import express from "express";
import { getCredentials } from "../services/register.vouched.service.js";

const router = express.Router();

router.get("/vouchedCredentials", getCredentials);

export default router;
