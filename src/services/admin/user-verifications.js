import {
  UserVerifications,
  DailyVerificationCount,
  DailyVerificationDeletions,
} from "../../init.js";
import logger from "../../utils/logger.js";

const getEndpointLogger = logger.child({
  msgPrefix: "[GET /admin/user-verifications] ",
});
const deleteEndpointLogger = logger.child({
  msgPrefix: "[DELETE /admin/user-verifications] ",
});

async function getUserVerification(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const uuid = req.query.uuid;

    if (!uuid) {
      return res.status(400).json({ error: "No UUID provided." });
    }

    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      getEndpointLogger.info({ uuid }, "Found user in database with UUID");
      return res.status(200).json(user);
    } else {
      getEndpointLogger.info({ uuid }, "No user with UUID found");
      return res.status(404).json({ error: "No user with that UUID found." });
    }
  } catch (err) {
    getEndpointLogger.error(
      { error: err },
      "An error occurred while retrieving user verification"
    );
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

async function deleteUserVerification(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const uuid = req.query.uuid;

    if (!uuid) {
      return res.status(400).json({ error: "No UUID provided." });
    }

    // Limit the number of deletions per day to 2% of the number of verifications per day
    const verificationCountDoc = await DailyVerificationCount.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    // NOTE: If we add other verification providers, we need to update the following line
    const sessionCountToday =
      (verificationCountDoc?.veriff?.sessionCount ?? 0) +
      (verificationCountDoc?.vouched?.jobCount ?? 0);
    const deletionCountDoc = await DailyVerificationDeletions.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    const deletionCountToday = deletionCountDoc?.deletionCount ?? 0;
    if (deletionCountToday >= sessionCountToday * 0.02 + 10) {
      deleteEndpointLogger.info("Deletion limit reached for today. Exiting.");
      return res
        .status(429)
        .json({ error: "Deletion limit reached for today. Try again tomorrow." });
    }

    const result = await UserVerifications.deleteOne({ "govId.uuid": uuid }).exec();
    if (result.acknowledged && result.deletedCount >= 1) {
      deleteEndpointLogger.info({ uuid }, "Deleted user with UUID");

      // Increment the deletion count for today
      await DailyVerificationDeletions.updateOne(
        { date: new Date().toISOString().slice(0, 10) },
        { $inc: { deletionCount: 1 } },
        { upsert: true }
      ).exec();

      return res.status(200).json({ message: "User deleted" });
    } else {
      deleteEndpointLogger.info({ uuid }, "No user with UUID found");
      return res.status(404).json({ error: "No user with that UUID found." });
    }
  } catch (err) {
    deleteEndpointLogger.error({ error: err }, "An error occurred");
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getUserVerification, deleteUserVerification };
