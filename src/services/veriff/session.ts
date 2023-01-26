import axios from "axios";
import { Request, Response } from "express";
import { v4 as uuidV4 } from "uuid";
// @ts-expect-error TS(7034) FIXME: Variable 'DailyVerificationCount' implicitly has t... Remove this comment to see the full error message
import { DailyVerificationCount } from "../../init";
import { logWithTimestamp, sendEmail } from "../../utils/utils";

async function createSession(_: Request, res: Response) {
  logWithTimestamp("POST veriff/session: Entered");

  // Increment sessionCount in today's verification count doc. If doc doesn't exist,
  // create it, and set Veriff sessionCount to 1.
  // findOneAndUpdate is used so that the operation is atomic.
  // @ts-expect-error TS(7005) FIXME: Variable 'DailyVerificationCount' implicitly has a... Remove this comment to see the full error message
  const verificationCountDoc = await DailyVerificationCount.findOneAndUpdate(
    { date: new Date().toISOString().slice(0, 10) },
    { $inc: { "veriff.sessionCount": 1 } },
    { upsert: true, returnOriginal: false }
  ).exec();
  const sessionCountToday = verificationCountDoc.veriff.sessionCount;

  // Send 2 emails after 5k verifications
  if (sessionCountToday > 5000 && sessionCountToday <= 5002) {
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'ADMIN_EMAILS'.
    for (const email of ADMIN_EMAILS) {
      const subject = "Veriff session count for the day exceeded 5000!!";
      const message = `Veriff session count for the day is ${sessionCountToday}.`;
      // @ts-expect-error TS(2554) FIXME: Expected 4 arguments, but got 3.
      await sendEmail(email, subject, message);
    }
  }
  if (sessionCountToday > 5000) {
    return res.status(503).json({
      error: "We cannot service more verifications today. Please try again tomorrow.",
    });
  }

  // Prepare request and create session
  const frontendUrl =
    // @ts-expect-error TS(2339) FIXME: Property 'NODE_ENV' does not exist on type 'Proces... Remove this comment to see the full error message
    process.NODE_ENV === "development"
      ? "http://localhost:3002"
      : "https://holonym.id";
  const reqBody = {
    verification: {
      // TODO: Is callback necessary if we handle "FINISHED" event in frontend?
      callback: `${frontendUrl}/mint`,
      document: {
        type: "DRIVERS_LICENSE",
      },
      vendorData: uuidV4(),
      timestamp: new Date().toISOString(),
    },
  };
  // @ts-expect-error TS(2339) FIXME: Property 'NODE_ENV' does not exist on type 'Proces... Remove this comment to see the full error message
  if (process.NODE_ENV === "development") {
    // @ts-expect-error TS(2339) FIXME: Property 'person' does not exist on type '{ callba... Remove this comment to see the full error message
    reqBody.verification.person = {
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-01",
    };
  }
  try {
    console.log(process.env.VERIFF_PUBLIC_API_KEY);
    const config = {
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": process.env.VERIFF_PUBLIC_API_KEY,
      },
    };
    const resp = await axios.post(
      "https://stationapi.veriff.com/v1/sessions",
      reqBody,
      // @ts-expect-error TS(2345) FIXME: Argument of type '{ headers: { "Content-Type": str... Remove this comment to see the full error message
      config
    );
    const verification = resp?.data?.verification;
    logWithTimestamp(`POST veriff/session: Created session ${verification?.id}`);
    return res.status(200).json({ url: verification?.url, id: verification?.id });
  } catch (err) {
    logWithTimestamp(`POST veriff/session: Error creating session`);
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    console.log(err.message);
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    console.log(err?.response?.data);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { createSession };
