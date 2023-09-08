import express from "express";
import { getPrice } from "../services/prices.js";

const router = express.Router();

router.get("/", getPrice);

export default router;
