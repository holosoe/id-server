import express from "express";
import {
  storePeanutData,
  getUserHasClaimedNFT,
  getUserHasClaimedNFTByEmail,
} from "../services/silk/galxe-campaign.js";
const router = express.Router();

router.post("/galxe-campaigns/0/user-peanut-data", storePeanutData);
router.get("/galxe-campaigns/0/user-has-claimed-nft/:address", getUserHasClaimedNFT);
router.get(
  "/galxe-campaigns/0/user-has-claimed-nft/by-email/:email",
  getUserHasClaimedNFTByEmail
);

export default router;
