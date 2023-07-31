import {
  UserVerifications,
  DailyVerificationCount,
  DailyVerificationDeletions,
} from "../../init.js";
import { logWithTimestamp } from "../../utils/utils.js";

async function getUserVerification(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY) {
      logWithTimestamp(`GET admin/user-verifications: Invalid API key. Exiting.`);
      return res.status(401).json({ error: "Invalid API key." });
    }

    const uuid = req.query.uuid;

    if (!uuid) {
      logWithTimestamp(`GET admin/user-verifications: No UUID provided. Exiting.`);
      return res.status(400).json({ error: "No UUID provided." });
    }

    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      logWithTimestamp(`GET admin/user-verifications: Found user with UUID ${uuid}.`);
      return res.status(200).json(user);
    } else {
      logWithTimestamp(
        `GET admin/user-verifications: No user with UUID ${uuid} found.`
      );
      return res.status(404).json({ error: "No user with that UUID found." });
    }
  } catch (err) {
    logWithTimestamp(`GET admin/user-verifications: Error: ${err.message}.`);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function deleteUserVerification(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY) {
      logWithTimestamp(`DELETE admin/user-verifications: Invalid API key. Exiting.`);
      return res.status(401).json({ error: "Invalid API key." });
    }

    const uuid = req.query.uuid;

    if (!uuid) {
      logWithTimestamp(`DELETE admin/user-verifications: No UUID provided. Exiting.`);
      return res.status(400).json({ error: "No UUID provided." });
    }

    // Limit the number of deletions per day to 2% of the number of verifications per day
    const verificationCountDoc = await DailyVerificationCount.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    // NOTE: If we add other verification providers, we need to update the following line
    const sessionCountToday =
      verificationCountDoc.veriff.sessionCount +
      (verificationCountDoc?.vouched?.jobCount ?? 0);
    const deletionCountDoc = await DailyVerificationDeletions.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    const deletionCountToday = deletionCountDoc.deletionCount;
    if (deletionCountToday >= sessionCountToday * 0.02) {
      logWithTimestamp(
        "DELETE admin/user-verifications: Deletion limit reached for today. Exiting."
      );
      return res
        .status(429)
        .json({ error: "Deletion limit reached for today. Try again tomorrow." });
    }

    const result = await UserVerifications.deleteOne({ "govId.uuid": uuid }).exec();
    if (result.acknowledged && result.deletedCount >= 1) {
      logWithTimestamp(
        `DELETE admin/user-verifications: Deleted user with UUID ${uuid}.`
      );

      // Increment the deletion count for today
      await DailyVerificationDeletions.updateOne(
        { date: new Date().toISOString().slice(0, 10) },
        { $inc: { deletionCount: 1 } },
        { upsert: true }
      ).exec();

      return res.status(200).json({ message: "User deleted" });
    } else {
      logWithTimestamp(
        `DELETE admin/user-verifications: No user with UUID ${uuid} found.`
      );
      return res.status(404).json({ error: "No user with that UUID found." });
    }
  } catch (err) {
    logWithTimestamp(`DELETE admin/user-verifications: Error: ${err.message}.`);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getUserVerification, deleteUserVerification };
