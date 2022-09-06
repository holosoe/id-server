import express from "express";
import { addSmallLeaf } from "../services/proofs.service.js";

const router = express.Router();

router.get("/addSmallLeaf", addSmallLeaf);

export default router;
