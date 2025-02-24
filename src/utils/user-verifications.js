import { UserVerifications } from "../init.js";
import { objectIdElevenMonthsAgo } from "./utils.js"

export async function findOneUserVerificationLast11Months(uuidOld, uuidNew) {
  return UserVerifications.findOne({
    $or: [{ "govId.uuid": uuidOld }, { "govId.uuidV2": uuidNew }],
    // Filter out documents older than 11 months
    _id: { $gt: objectIdElevenMonthsAgo() },
  }).exec();
}
