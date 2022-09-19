import express from "express";
import { poseidonEndpoint } from "../services/hash.service.js";

const router = express.Router();

router.post("/poseidon", poseidonEndpoint);

export default router;
