import axios from "axios";
import { logWithTimestamp } from "../../utils/utils.js";

async function verificationStatus(req, res) {
  try {
    const scanRef = req.query.scanRef;

    if (!scanRef) {
      return res.status(400).json({ error: "scanRef is required" });
    }

    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/status",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );

    return res.status(200).json({
      status: resp.data.status,
    });
  } catch (err) {
    logWithTimestamp(`POST idenfy/status: Error creating session`);
    console.log(err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { verificationStatus };
