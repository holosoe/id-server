import express from "express";
import { getJobCount } from "../services/vouched";

const router = express.Router();

router.get("/job-count", getJobCount);

export default router;
