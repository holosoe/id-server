import logger from "../utils/logger.js";
import { campaignIdToActionIdMap, campaignIdToWorkflowIdMap } from "../utils/constants.js";

const getEndpointLogger = logger.child({ msgPrefix: "[GET /credentials/v2] " });

function getActionIdFromCampaignId(req, res) {
  const { campaignId } = req.params;
  const actionId = campaignIdToActionIdMap[campaignId];
  res.json({ actionId });
}

function getWorkflowIdFromCampaignId(req, res) {
  const { campaignId } = req.params;
  const workflowId = campaignIdToWorkflowIdMap[campaignId];
  res.json({ workflowId });
}

export { getActionIdFromCampaignId, getWorkflowIdFromCampaignId };