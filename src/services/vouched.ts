import axios from "axios";
// @ts-expect-error TS(7034): Variable 'DailyVerificationCount' implicitly has t... Remove this comment to see the full error message
import { DailyVerificationCount } from "../init.js";
import { logWithTimestamp, sendEmail } from "../utils/utils.js";
import { ADMIN_EMAILS } from "../utils/constants.js";

const vouchedPrivateKey = process.env.VOUCHED_PRIVATE_KEY;

/**
 * Get the total number of Vouched jobs in our account
 */
// @ts-expect-error TS(6133): 'req' is declared but its value is never read.
async function getJobCount(req: $TSFixMe, res: $TSFixMe) {
  logWithTimestamp("vouched/job-count: Entered");

  try {
    // Use pageSize=1 so that the response is as small as possible
    const url1 = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp1 = await axios.get(url1, {
      // @ts-expect-error TS(2322): Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
      headers: { "X-API-Key": vouchedPrivateKey },
    });
    const jobCount = resp1.data?.total || 0;
    logWithTimestamp(`vouched/job-count: jobCount==${jobCount}`);

    const today = new Date().toISOString().slice(0, 10);

    // Asynchronously update jobCount in db.
    (async () => {
      let jobs: $TSFixMe = [];
      const pageSize = 100;
      for (let page = 1; page <= Math.ceil(jobCount / pageSize); page++) {
        const url2 = `https://verify.vouched.id/api/jobs?page=${page}&pageSize=${pageSize}`;
        const resp2 = await axios.get(url2, {
          // @ts-expect-error TS(2322): Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
          headers: { "X-API-Key": vouchedPrivateKey },
        });
        jobs = [...jobs, ...(resp2.data?.items ?? [])];
      }
      // @ts-expect-error TS(7006): Parameter 'job' implicitly has an 'any' type.
      const jobsToday = jobs.filter((job) => job?.submitted.slice(0, 10) === today);

      const jobCountToday = jobsToday.length;

      // Increment jobCount in today's verification count doc. If doc doesn't exist,
      // create it, and set Vouched jobCount to today's job count.
      // findOneAndUpdate is used so that the operation is atomic.
      // @ts-expect-error TS(7005): Variable 'DailyVerificationCount' implicitly has a... Remove this comment to see the full error message
      await DailyVerificationCount.findOneAndUpdate(
        { date: today },
        { "vouched.jobCount": jobCountToday },
        { upsert: true }
      ).exec();
    })();

    // @ts-expect-error TS(7005): Variable 'DailyVerificationCount' implicitly has a... Remove this comment to see the full error message
    const verificationCountDoc = await DailyVerificationCount.findOne({
      date: today,
    }).exec();
    const jobCountToday = verificationCountDoc?.vouched?.jobCount || 0;

    // Send 2 emails after 5k verifications
    if (jobCountToday > 5000 && jobCountToday <= 5002) {
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      for (const email of ADMIN_EMAILS) {
        const subject = "Vouched job count for the day exceeded 5000!!";
        const message = `Vouched job count for the day is ${jobCount}.`;
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        await sendEmail(email, subject, message);
      }
    }

    return res.status(200).json({ total: jobCount, today: jobCountToday });
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    console.log(err.message);
    return res
      .status(500)
      .json({ error: "An error occurred while getting the job count" });
  }
}

export { getJobCount };
