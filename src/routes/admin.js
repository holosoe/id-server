import express from "express";
import {
  getUserVerification,
  deleteUserVerification,
} from "../services/admin/user-verifications.js";
import { deleteUserData } from "../services/admin/user-idv-data.js";

const router = express.Router();

router.get("/user-verification", getUserVerification);
router.delete("/user-verification", deleteUserVerification);
router.delete("/user-idv-data", deleteUserData);

export default router;
