import express from "express";
import { startPersonaInquiry, acceptPersonaRedirect, acceptFrontendRedirect } from "../services/register.service.js";

const router = express.Router();

router.get("/", startPersonaInquiry);
router.get("/redirect", acceptPersonaRedirect);
router.get("/credentials", acceptFrontendRedirect);

export default router;
