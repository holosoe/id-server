import express from "express";
import { login, getSessions, getClient } from "../services/admin.js";

const router = express.Router();

router.get("/auth", login);
router.get("/sessions", getSessions);
router.get("/clients/:clientId", getClient);

export default router;
