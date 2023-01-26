import express from "express";
import { getCredentials } from "../services/register-vouched";

const router = express.Router();

router.get("/vouchedCredentials", getCredentials);

export default router;
