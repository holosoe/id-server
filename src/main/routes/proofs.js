import express from "express";
import {
  addSmallLeaf,
  proveKnowledgeOfPreimageOfMemberLeaf,
} from "../services/proofs.service.js";

const router = express.Router();

router.get("/addSmallLeaf", addSmallLeaf);
router.get(
  "/proveKnowledgeOfPreimageOfMemberLeaf", // TODO: Better name
  proveKnowledgeOfPreimageOfMemberLeaf
);

export default router;
