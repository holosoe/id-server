import { ObjectId } from "mongodb";
import { Session } from "../init.js";

export async function getSessionById(_id) {
  let objectId = null;
  try {
    objectId = new ObjectId(_id);
  } catch (err) {
    return { error: "Invalid _id" };
  }

  const session = await Session.findOne({ _id: objectId }).exec();

  if (!session) {
    return { error: "Session not found" };
  }

  return { session }
}