// import { logWithTimestamp } from "../utils/utils.js";

async function decisionWebhook(req, res) {
  try {
    logWithTimestamp("veriff/decision-webhook: Entered");
    console.log(req.body);
    return res.status(200).json({ message: "OK" });
  } catch (err) {
    console.log(err);
  }
}

export { decisionWebhook };
