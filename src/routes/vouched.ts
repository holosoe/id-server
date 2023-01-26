// @ts-expect-error TS(7016): Could not find a declaration file for module 'expr... Remove this comment to see the full error message
import express from "express";
import { getJobCount } from "../services/vouched.js";

const router = express.Router();

router.get("/job-count", getJobCount);

export default router;
