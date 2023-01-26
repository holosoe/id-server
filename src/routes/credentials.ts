import express from "express";
import { getCredentials, postCredentials } from "../services/credentials";

const router = express.Router();

// Routes for accessing & modifying database containing user's encrypted credentials
router.get("/", getCredentials);
router.post("/", postCredentials);

export default router;
