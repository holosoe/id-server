import { ObjectId } from 'mongodb'
import { sessionStatusEnum } from "./constants/misc.js";
import { Session } from "./init.js";
import { handleIdvSessionCreation } from './idv-sessions.js'

export async function fixIdvSessionsWithNoIdvSession() {
  //get all sessions within last 72 hours
  const now = new Date();
  const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5)
  const objectId = new ObjectId(Math.floor(fiveDaysAgo.getTime() / 1000).toString(16) + "0000000000000000");
  const allSessions = await Session.find({
    _id: {
      $gte: objectId
    }
  }).exec();

  for (let session of allSessions) {
    const userHasNoIDVSession = 
      // no veriff session
      !session.sessionId && !session.veriffUrl &&
      // no onfido session
      !session.applicant_id && !session.check_id && !session.onfido_sdk_token
    if (session.status === sessionStatusEnum.IN_PROGRESS && userHasNoIDVSession) {
      console.log(`FIXING IN_PROGRESS session: ${session}`);
      await handleIdvSessionCreation(session)
      await session.save();
    }
  }
}
