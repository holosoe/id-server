import express from "express";
import { enrollment3d } from "../services/facetec/enrollment-3d.js";
import { match3d2dIdScanAndGetCreds } from "../services/facetec/match-3d-2d-idscan-and-get-creds.js";
import { match3d2dIdScan } from "../services/facetec/match-3d-2d-idscan.js";

const router = express.Router();

router.post("/enrollment-3d", enrollment3d);
// TODO: FaceTec: /match-3d-2d-idscan is called 3 times--once for front of ID,
// once for back of ID, and once when user confirms their details. We should 
// remove the details confirmation step.
router.post("/match-3d-2d-idscan-and-get-creds/:nullifier", match3d2dIdScanAndGetCreds);
router.post("/match-3d-2d-idscan", match3d2dIdScan);

export default router;
