import axios from "axios";
import { pinoOptions, logger } from "../../utils/logger.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /idenfy/verification-status] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "idenfy",
  },
});

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
    endpointLogger.error(
      { error: err, scanRef: req.query.scanRef },
      "An error occurred while retrieving verification status"
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { verificationStatus };
