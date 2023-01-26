// @ts-expect-error TS(7016): Could not find a declaration file for module 'expr... Remove this comment to see the full error message
import express from "express";
import { getCredentials } from "../services/register-vouched.js";

const router = express.Router();

router.get("/vouchedCredentials", getCredentials);

export default router;
