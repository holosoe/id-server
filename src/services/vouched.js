import axios from "axios";
import { VerificationCount } from "../init.js";
import { logWithTimestamp } from "../utils/utils.js";

const vouchedPrivateKey = process.env.VOUCHED_PRIVATE_KEY;

/**
 * Get the total number of Vouched jobs in our account
 */
async function getJobCount(req, res) {
  logWithTimestamp("vouched/job-count: Entered");

  try {
    // Use pageSize=1 so that the response is as small as possible
    const url = `https://verify.vouched.id/api/jobs?page=1&pageSize=1`;
    const resp = await axios.get(url, {
      headers: { "X-API-Key": vouchedPrivateKey },
    });
    const jobCount = resp.data?.total || 0;
    logWithTimestamp("vouched/job-count: jobCount==" + jobCount);

    const jobCountCollection = await VerificationCount.find().exec();
    const jobCountDoc = jobCountCollection[0];
    const jobCountYesterday = jobCountDoc.vouched.totalVerifications;

    if (jobCountYesterday?.vouched?.lastUpdated + 86400000 < Date.now()) {
      jobCountDoc.vouched.totalVerifications = jobCount;
      jobCountDoc.vouched.lastUpdated = Date.now();
      await jobCountDoc.save();
    }

    const jobCountToday = jobCount - jobCountYesterday;
    return res.status(200).json({ total: jobCount, today: jobCountToday });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "An error occurred while getting the job count" });
  }
}

export { getJobCount };
