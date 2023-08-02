import { logWithTimestamp } from "../../utils/utils.js";

async function webhook(req, res) {
  try {
    console.log("idenfy/webhook: req.body:", req.body);

    return res.status(200).json({ message: "OK" });
  } catch (err) {
    console.log("idenfy/webhook: err", err);
    // We return 200 so that iDenfy doesn't keep trying
    return res.status(200).json({ error: "An unknown error occurred" });
  }
}

export { webhook };
