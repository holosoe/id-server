import express from "express";
import { getJobCount } from "../services/vouched/endpoints";

const router = express.Router();

router.get("/job-count", getJobCount);

export default router;
