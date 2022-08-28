import express from "express";
import { residenceProof } from "../services/proofs.service.js";

const router = express.Router();

router.get("/residence", residenceProof);

export default router;
