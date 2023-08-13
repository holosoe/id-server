import express from "express";
import { getCountry } from "../services/ip-info.js";

const router = express.Router();

router.get("/country", getCountry);

export default router;
