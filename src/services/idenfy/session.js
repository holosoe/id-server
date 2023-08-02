import axios from "axios";
import { v4 as uuidV4 } from "uuid";
import { DailyVerificationCount } from "../../init.js";
import { logWithTimestamp, sendEmail } from "../../utils/utils.js";

async function createSession(req, res) {
  try {
    console.log("req.body: ", req.body);
    console.log("req.query: ", req.query);
    const sigDigest = req.body.sigDigest; // holoAuthSigDigest

    if (!sigDigest) {
      return res.status(400).json({ error: "sigDigest is required" });
    }

    // Increment sessionCount in today's verification count doc. If doc doesn't exist,
    // create it, and set iDenfy sessionCount to 1.
    // findOneAndUpdate is used so that the operation is atomic.
    const verificationCountDoc = await DailyVerificationCount.findOneAndUpdate(
      { date: new Date().toISOString().slice(0, 10) },
      { $inc: { "idenfy.sessionCount": 1 } },
      { upsert: true, returnOriginal: false }
    ).exec();
    const sessionCountToday = verificationCountDoc.idenfy.sessionCount;

    // Send 2 emails after 5k verifications
    if (sessionCountToday > 5000 && sessionCountToday <= 5002) {
      for (const email of ADMIN_EMAILS) {
        const subject = "iDenfy session count for the day exceeded 5000!!";
        const message = `iDenfy session count for the day is ${sessionCountToday}.`;
        await sendEmail(email, subject, message);
      }
    }
    if (sessionCountToday > 5000) {
      return res.status(503).json({
        error:
          "We cannot service more verifications today. Please try again tomorrow.",
      });
    }

    // Prepare request and create session
    const reqBody = {
      clientId: sigDigest,
      // Getting 'You are not allowed to use a custom callback url.' when specifying callbackUrl
      // callbackUrl: "https://id-server.holonym.io/idenfy/webhook",
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
        ).toString("base64")}`,
      },
    };
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/token",
      reqBody,
      config
    );
    const session = resp?.data;
    logWithTimestamp(
      `POST idenfy/session: Created session with authToken ${session.authToken}`
    );
    return res.status(200).json({
      url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${session.authToken}`,
      scanRef: session.scanRef,
    });
  } catch (err) {
    logWithTimestamp(`POST idenfy/session: Error creating session`);
    console.log(err.message);
    console.log(err?.response?.data);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { createSession };
