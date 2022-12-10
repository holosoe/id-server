import express from "express";
import { getCredentials } from "../services/veriff.js";

const router = express.Router();

router.get("/credentials", getCredentials);

export default router;
