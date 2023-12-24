import express from "express";
import {
  storePeanutData,
  getUserHasClaimedNFT,
} from "../services/silk/galxe-campaign.js";
const router = express.Router();

router.post("/galxe-campaigns/0/user-peanut-data", storePeanutData);
router.get("/galxe-campaigns/0/user-has-claimed-nft/:address", getUserHasClaimedNFT);

export default router;
