async function decisionWebhook(req, res) {
  logWithTimestamp("veriff/decision-webhook: Entered");
  console.log(req.body);
  return res.status(200).json({ message: "OK" });
}

export { decisionWebhook };
