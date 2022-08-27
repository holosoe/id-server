import express from "express";
import { initialize } from "../services/initialize.service.js";

const router = express.Router();

router.get("/", initialize);

export default router;
