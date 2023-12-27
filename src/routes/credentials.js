import express from "express";
import { getCredentials, postCredentials } from "../services/credentials.js";
import {
  getCredentials as getCredentialsV2,
  putPhoneCredentials,
} from "../services/credentials-v2.js";

const router = express.Router();

// Routes for accessing & modifying database containing user's encrypted credentials
router.get("/", getCredentials);
router.post("/", postCredentials);
router.get("/v2", getCredentialsV2);
router.put("/v2/phone", putPhoneCredentials);

export default router;
