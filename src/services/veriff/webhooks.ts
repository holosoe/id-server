import { logWithTimestamp } from "@/utils/utils";
import type { Request, Response } from "express";

async function decisionWebhook(req: Request, res: Response) {
  logWithTimestamp("veriff/decision-webhook: Entered");
  console.log(req.body);
  return res.status(200).json({ message: "OK" });
}

export { decisionWebhook };
