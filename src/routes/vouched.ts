import express from "express";
import { getJobCount } from "../services/vouched.js";

const router = express.Router();

router.get("/job-count", getJobCount);

export default router;
