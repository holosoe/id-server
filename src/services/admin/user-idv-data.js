import axios from "axios";
import { ObjectId } from "mongodb";
import { subDays } from "date-fns";
import { Session } from "../../init.js";
import { sessionStatusEnum } from "../../constants/misc.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import { deleteVeriffSession } from "../../utils/veriff.js";
import { deleteOnfidoApplicant } from "../../utils/onfido.js";
import { deleteIdenfySession } from "../../utils/idenfy.js";

// const endpointLogger = logger.child({
//   msgPrefix: "[DELETE /admin/delete-user-data] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

function dateToObjectId(date) {
  // https://stackoverflow.com/a/8753670
  return ObjectId(Math.floor(date / 1000).toString(16) + "0000000000000000");
}

async function setDeletedFromIDVProvider(session) {
  session.deletedFromIDVProvider = true;
  await session.save();
}

async function deleteDataFromIDVProvider(session) {
  switch (session.idvProvider) {
    case "veriff":
      if (session.sessionId) {
        const result = await deleteVeriffSession(session.sessionId);
        if (result?.status === "success") {
          setDeletedFromIDVProvider(session);
        }
      }
      break;
    case "onfido":
      if (session.applicant_id) {
        const result = await deleteOnfidoApplicant(session.applicant_id);
        if (result?.status == 204) {
          setDeletedFromIDVProvider(session);
        }
      }
      break;
    case "idenfy":
      if (session.scanRef) {
        const result = await deleteIdenfySession(session.scanRef);
        if (result?.status == 200) {
          setDeletedFromIDVProvider(session);
        }
      }
      break;
    default:
      break;
  }
}

/**
 * Endpoint to be called by daemon to periodically delete old user data
 * from IDV provider databases.
 */
async function deleteUserData(req, res) {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  try {
    // 1. Delete sessions that we know have failed verification. \\
    // Get all sessions that:
    // - are older than 10 days AND
    // - have status of VERIFICATION_FAILED AND
    // - have not already been deleted from IDV provider databases
    const tenDaysAgo = subDays(new Date(), 10);
    const sessions = await Session.find({
      $and: [
        {
          _id: {
            $lt: dateToObjectId(tenDaysAgo),
          },
        },
        { status: sessionStatusEnum.VERIFICATION_FAILED },
        { deletedFromIDVProvider: { $eq: false } },
      ],
    }).exec();

    // Delete sessions from IDV provider databases
    for (const session of sessions) {
      await deleteDataFromIDVProvider(session);
    }

    // 2. Delete sessions that might have been abandoned. \\
    // Get all sessions that:
    // - are older than 30 days AND
    // - have status of IN_PROGRESS or REFUNDED AND
    // - have not already been deleted from IDV provider databases
    const thirtyDaysAgo = subDays(new Date(), 30);
    const sessions2 = await Session.find({
      $and: [
        {
          _id: {
            $lt: dateToObjectId(thirtyDaysAgo),
          },
        },
        {
          status: { $in: [sessionStatusEnum.IN_PROGRESS, sessionStatusEnum.REFUNDED] },
        },
        { deletedFromIDVProvider: { $eq: false } },
      ],
    }).exec();

    // Delete sessions from IDV provider databases
    for (const session of sessions2) {
      await deleteDataFromIDVProvider(session);
    }

    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log("deleteUserData: Error encountered (a)", err.message);
    if (err?.response?.data)
      console.log("deleteUserData: Error encountered (b)", err?.response?.data);
    else console.log("deleteUserData: Error encountered (b)", err);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}

export { deleteUserData };
