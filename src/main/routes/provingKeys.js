import express from "express";
import { onAddLeaf, lobby3 } from "../services/provingKeys.service.js";

const router = express.Router();

router.get("/onAddLeaf", onAddLeaf);
router.get("/lobby3", lobby3);

export default router;
