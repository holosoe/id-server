// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'expr... Remove this comment to see the full error message
import express from "express";
import { getProofMetadata, postProofMetadata } from "../services/proof-metadata.js";

const router = express.Router();

router.get("/", getProofMetadata);
router.post("/", postProofMetadata);

export default router;
