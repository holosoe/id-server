import express from "express";
import {
  addLeaf,
  proveKnowledgeOfPreimageOfMemberLeaf,
} from "../services/proofs.service.js";

const router = express.Router();

router.get("/addLeaf", addLeaf);
router.post(
  "/proveKnowledgeOfPreimageOfMemberLeaf", // TODO: Better name
  proveKnowledgeOfPreimageOfMemberLeaf
);

export default router;
