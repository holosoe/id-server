import express from "express";
import {
  getUserVerification,
  deleteUserVerification,
} from "../services/admin/user-verifications.js";

const router = express.Router();

router.get("/user-verification", getUserVerification);
router.delete("/user-verification", deleteUserVerification);

export default router;
