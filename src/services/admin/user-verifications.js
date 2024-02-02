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

    // if (apiKey !== process.env.ADMIN_API_KEY) {
    if (apiKey !== process.env.ADMIN_API_KEY_LOW_PRIVILEGE) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const id = req.query.id;
    const uuid = req.query.uuid;
    const idvProviderSessionId = req.query.idvProviderSessionId;

    if (!id && !uuid) {
      return res.status(400).json({ error: "No user ID provided." });
    }

    // const user = await UserVerifications.findOne({ _id: id }).exec();
    const user = await UserVerifications.findOne({
      $or: [
        { _id: id },
        { "govId.uuid": uuid },
        { "govId.sessionId": idvProviderSessionId },
      ],
    }).exec();
    if (user) {
      getEndpointLogger.info({ _id: id, uuid }, "Found user ");
      return res.status(200).json(user);
    } else {
      getEndpointLogger.info({ _id: id, uuid }, "No user found");
      return res.status(404).json({ error: "No user found." });
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

    // if (apiKey !== process.env.ADMIN_API_KEY) {
    if (apiKey !== process.env.ADMIN_API_KEY_LOW_PRIVILEGE) {
      return res.status(401).json({ error: "Invalid API key." });
    }

    const id = req.query.id;
    const uuid = req.query.uuid;

    if (!id && !uuid) {
      return res.status(400).json({ error: "No user ID or UUID provided." });
    }

    // Limit the number of deletions per day to 2% of the number of verifications per day
    const verificationCountDoc = await DailyVerificationCount.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    // NOTE: If we add other verification providers, we need to update the following line
    const sessionCountToday =
      (verificationCountDoc?.veriff?.sessionCount ?? 0) +
      (verificationCountDoc?.idenfy?.sessionCount ?? 0) +
      (verificationCountDoc?.onfido?.applicantCount ?? 0);
    const deletionCountDoc = await DailyVerificationDeletions.findOne({
      date: new Date().toISOString().slice(0, 10),
    }).exec();
    const deletionCountToday = deletionCountDoc?.deletionCount ?? 0;
    if (deletionCountToday >= sessionCountToday * 0.02 + 30) {
      deleteEndpointLogger.info("Deletion limit reached for today. Exiting.");
      return res
        .status(429)
        .json({ error: "Deletion limit reached for today. Try again tomorrow." });
    }

    // const result = await UserVerifications.deleteOne({ _id: id }).exec();
    const result = await UserVerifications.deleteOne({
      $or: [{ _id: id }, { "govId.uuid": uuid }],
    }).exec();
    if (result.acknowledged && result.deletedCount >= 1) {
      deleteEndpointLogger.info({ _id: id, uuid }, "Deleted user");

      // Increment the deletion count for today
      await DailyVerificationDeletions.updateOne(
        { date: new Date().toISOString().slice(0, 10) },
        { $inc: { deletionCount: 1 } },
        { upsert: true }
      ).exec();

      return res.status(200).json({ message: "User deleted" });
    } else {
      deleteEndpointLogger.info({ _id: id, uuid }, "No user found");
      return res.status(404).json({ error: "No user found." });
    }
  } catch (err) {
    deleteEndpointLogger.error({ error: err }, "An error occurred");
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { getUserVerification, deleteUserVerification };
