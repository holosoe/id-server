import express from "express";
import { createSession } from "../services/idenfy/session.js";

const router = express.Router();

router.post("/applicant", createSession);

export default router;
