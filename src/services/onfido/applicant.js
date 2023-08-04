import axios from "axios";
import { DailyVerificationCount } from "../../init.js";
import { logWithTimestamp, sendEmail } from "../../utils/utils.js";

async function createApplicant(req, res) {
  try {
    // Increment applicantCount in today's verification count doc. If doc doesn't exist,
    // create it, and set Onfido applicantCount to 1.
    // findOneAndUpdate is used so that the operation is atomic.
    const verificationCountDoc = await DailyVerificationCount.findOneAndUpdate(
      { date: new Date().toISOString().slice(0, 10) },
      { $inc: { "onfido.applicantCount": 1 } },
      { upsert: true, returnOriginal: false }
    ).exec();
    const applicantCountToday = verificationCountDoc.onfido.applicantCount;

    // Send 2 emails after 5k applicants
    if (applicantCountToday > 5000 && applicantCountToday <= 5002) {
      for (const email of ADMIN_EMAILS) {
        const subject = "Onfido applicant count for the day exceeded 5000!!";
        const message = `Onfido applicant count for the day is ${applicantCountToday}.`;
        await sendEmail(email, subject, message);
      }
    }
    if (applicantCountToday > 5000) {
      logWithTimestamp(
        `POST onfido/applicant: Applicant count for the day exceeded 5000`
      );
      return res.status(503).json({
        error:
          "We cannot service more verifications today. Please try again tomorrow.",
      });
    }

    const reqBody = {
      // From Onfido docs:
      // "For Document reports, first_name and last_name must be provided but can be
      // dummy values if you don't know an applicant's name."
      first_name: "Alice",
      last_name: "Smith",
      // TODO: `location` is required for facial similarity reports.
      // TODO: `consent` is required for US applicants. From Onfido docs: "If the location of
      // the applicant is the US, you must also provide consent information confirming that
      // the end user has viewed and accepted Onfido’s privacy notices and terms of service."
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/applicants",
      reqBody,
      config
    );
    const applicant = resp?.data;
    logWithTimestamp(
      `POST onfido/applicant: Created applicant with applicant ID ${applicant.id}`
    );
    return res.status(200).json({
      id: applicant.id,
    });
  } catch (err) {
    logWithTimestamp(`POST onfido/applicant: Error creating session`);
    console.log(err.message);
    console.log(err?.response?.data);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { createApplicant };
