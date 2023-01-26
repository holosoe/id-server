import express from "express";
import { getCredentials } from "../services/vouched/register-vouched";

const router = express.Router();

router.get("/vouchedCredentials", getCredentials);

export default router;
