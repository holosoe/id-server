import type { Request, Response } from "express";

async function decisionWebhook(req: Request, res: Response) {
  // @ts-expect-error TS(2304) FIXME: Cannot find name 'logWithTimestamp'.
  logWithTimestamp("veriff/decision-webhook: Entered");
  console.log(req.body);
  return res.status(200).json({ message: "OK" });
}

export { decisionWebhook };
