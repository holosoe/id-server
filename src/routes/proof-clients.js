import express from "express";
import {
  login,
  getApiKeys,
  createAPIKey,
  revokeAPIKey,
  getSessions,
} from "../services/proof-clients.js";

const router = express.Router();

router.get("/auth", login);
router.get("/api-keys", getApiKeys);
router.post("/api-keys", createAPIKey);
router.delete("/api-keys/:apiKey", revokeAPIKey);
router.get("/sessions", getSessions);

export default router;
