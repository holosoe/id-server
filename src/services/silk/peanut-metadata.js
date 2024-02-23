import peanut from "@squirrel-labs/peanut-sdk";
import { SilkPeanutCampaignsMetadata } from "../../init.js";

/**
 * ENDPOINT
 */
async function storePeanutData(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.SILK_ADMIN_API_KEY) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const generatedLink = req.body.generatedLink;
    const peanutLink = req.body.peanutLink;
    const email = req.body.email;
    const campaignId = req.body.campaignId;

    if (!generatedLink) {
      return res.status(400).json({ error: "No generated link specified." });
    }

    if (!peanutLink) {
      return res.status(400).json({ error: "No peanut link specified." });
    }

    if (!email) {
      return res.status(400).json({ error: "No email specified." });
    }

    if (!campaignId) {
      return res.status(400).json({ error: "No campaign ID specified." });
    }

    const newUser = new SilkPeanutCampaignsMetadata({
      email,
      generatedLink,
      peanutLink,
      campaignId,
    });
    await newUser.save();
    return res.status(200).json({
      message: `Created new user with email ${email}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

/**
 * ENDPOINT
 */
async function getUserHasClaimedNFTByEmail(req, res) {
  try {
    const campaignId = req.params.campaignId;
    const email = req.params.email;

    if (!campaignId) {
      return res.status(400).json({
        error: "No campaign ID specified",
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "No address specified",
      });
    }

    const user = await SilkPeanutCampaignsMetadata.findOne({ email, campaignId });

    if (!user || !user.generatedLink) {
      return res.status(400).json({
        error: "Peanut data not found for user",
      });
    }

    const linkDetails = await peanut.getLinkDetails({ link: user.peanutLink });

    return res.status(200).json({
      claimed: linkDetails.claimed,
      generatedLink: user.generatedLink,
      peanutLink: user.peanutLink,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { storePeanutData, getUserHasClaimedNFTByEmail };
