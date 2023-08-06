import express from "express";
import { createApplicant } from "../services/onfido/applicant.js";
import { createCheck } from "../services/onfido/check.js";
import { getCredentials } from "../services/onfido/credentials.js";

const router = express.Router();

router.post("/applicant", createApplicant);
router.post("/check", createCheck);
router.get("/credentials", getCredentials);

export default router;
