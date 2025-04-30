import express from "express";
import { sseUpdates } from "../services/facetec/sse-updates.js";
import { sessionToken } from "../services/facetec/session-token.js";
import { enrollment3d } from "../services/facetec/enrollment-3d.js";
import { match3d2dIdScan } from "../services/facetec/match-3d-2d-idscan.js";
import { testOCRDateParsing } from "../services/facetec/functions-date.js";

const router = express.Router();

// Create a module-level SSE client manager
const sseManager = {
  clients: new Map(), // Map user IDs to their SSE connections
  
  addClient: (sid, sendUpdate) => {
    sseManager.clients.set(sid, sendUpdate);
  },
  
  removeClient: (sid) => {
    sseManager.clients.delete(sid);
  },
  
  sendToClient: (sid, data) => {
    const sendUpdate = sseManager.clients.get(sid);
    if (sendUpdate) {
      sendUpdate(data);
      return true;
    }
    return false;
  },

};

// sse manager is available to all routes
router.use((req, res, next) => {
  req.app.locals.sseManager = sseManager;
  next();
});

router.get("/test-ocr-date-parsing", testOCRDateParsing);
router.get("/sse-updates/:sid", sseUpdates);
router.post("/session-token", sessionToken);
router.post("/enrollment-3d", enrollment3d);
router.post("/enrollment-3d/:nullifier", enrollment3d); // for proof of personhood issuance
// DONE - it is handled server side, for both 1-sided ID and 2-sided ID
// TODO: FaceTec: /match-3d-2d-idscan is called 3 times--once for front of ID,
// once for back of ID, and once when user confirms their details. 
// We should remove the details confirmation step.
router.post("/match-3d-2d-idscan/:nullifier", match3d2dIdScan);

// this endpoint is not longer used directly
// its functions are used from /match-3d-2d-idscan when isReadyForUserConfirmation is true
// match-3d-2d-idscan-and-get-creds.js is renamed to functions-creds.js
// router.post("/match-3d-2d-idscan-and-get-creds/:nullifier", match3d2dIdScanAndGetCreds);

export default router;
