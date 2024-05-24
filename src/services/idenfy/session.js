import axios from "axios";
import { v4 as uuidV4 } from "uuid";
import { DailyVerificationCount, IDVSessions } from "../../init.js";
import { sendEmail } from "../../utils/utils.js";
import { sha256 } from "../../utils/utils.js";
import { pinoOptions, logger } from "../../utils/logger.js";

const v1EndpointLogger = logger.child({
  msgPrefix: "[POST /idenfy/session] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "idenfy",
  },
});
const v2EndpointLogger = logger.child({
  msgPrefix: "[POST /idenfy/v2/session] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "idenfy",
  },
});

async function v1CreateSession(req, res) {
  try {
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
        // await sendEmail(email, subject, message);
      }
    }
    if (sessionCountToday > 5000) {
      v1EndpointLogger.error(
        { sessionCountToday },
        "iDenfy session count for the day exceeded 5000"
      );
      return res.status(503).json({
        error:
          "We cannot service more verifications today. Please try again tomorrow.",
      });
    }

    // Prepare request and create session
    const reqBody = {
      clientId: sha256(Buffer.from(sigDigest)).toString("hex"),
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
    v1EndpointLogger.info({ authToken: session.authToken }, "Created session");
    return res.status(200).json({
      url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${session.authToken}`,
      scanRef: session.scanRef,
    });
  } catch (err) {
    v1EndpointLogger.error({ error: err }, "Error creating session");
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function v2CreateSession(req, res) {
  try {
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
        // await sendEmail(email, subject, message);
      }
    }
    if (sessionCountToday > 5000) {
      v2EndpointLogger.error(
        { sessionCountToday },
        "iDenfy session count for the day exceeded 5000"
      );
      return res.status(503).json({
        error:
          "We cannot service more verifications today. Please try again tomorrow.",
      });
    }

    // Prepare request and create session
    const reqBody = {
      clientId: sha256(Buffer.from(sigDigest)).toString("hex"),
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
    v2EndpointLogger.info({ authToken: session.authToken }, "Created session");

    // Upsert IDVSessions doc with sigDigest and session ID
    await IDVSessions.findOneAndUpdate(
      { sigDigest },
      {
        sigDigest,
        $push: {
          "idenfy.sessions": {
            scanRef: session.scanRef,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true, returnOriginal: false }
    ).exec();

    return res.status(200).json({
      url: `https://ivs.idenfy.com/api/v2/redirect?authToken=${session.authToken}`,
      scanRef: session.scanRef,
    });
  } catch (err) {
    v2EndpointLogger.error({ error: err }, "Error creating session");
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { v1CreateSession, v2CreateSession };
