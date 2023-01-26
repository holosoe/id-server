import express from "express";
import { getProofMetadata, postProofMetadata } from "../services/proof-metadata";

const router = express.Router();

router.get("/", getProofMetadata);
router.post("/", postProofMetadata);

export default router;
