import { UserCredentialsV2 } from "../init.js";
import logger from "../utils/logger.js";

const postEndpointLogger = logger.child({ msgPrefix: "[POST /credentials/v2] " });
const getEndpointLogger = logger.child({ msgPrefix: "[GET /credentials/v2] " });

async function validatePutCredentialsArgs(holoUserId) {
  // Require that args are present
  if (!holoUserId || holoUserId == "null" || holoUserId == "undefined") {
    return { error: "No holoUserId specified" };
  }

  // Require that args are correct types
  if (typeof holoUserId != "string") {
    return { error: "holoUserId isn't a string" };
  }

  // Ensure that args are not too large
  if (holoUserId.length != 64) {
    return { error: "holoUserId is not 64 characters long" };
  }
  return { success: true };
}

async function storeOrUpdatePhoneCredentials(holoUserId, encryptedCredentials) {
  let userCredentialsDoc;
  try {
    userCredentialsDoc = await UserCredentialsV2.findOne({
      holoUserId: holoUserId,
    }).exec();
  } catch (err) {
    postEndpointLogger.error(
      { error: err },
      "An error occurred while retrieving credentials"
    );
    return { error: "An error occurred while retrieving credentials." };
  }
  if (userCredentialsDoc) {
    userCredentialsDoc.holoUserId = holoUserId;
    userCredentialsDoc.phone = encryptedCredentials;
  } else {
    userCredentialsDoc = new UserCredentialsV2({
      holoUserId,
      encryptedPhoneCreds: encryptedCredentials,
    });
  }
  try {
    await userCredentialsDoc.save();
  } catch (err) {
    postEndpointLogger.error(
      { error: err },
      "An error occurred while saving user credentials to database"
    );
    return { error: "An error occurred while trying to save object to database." };
  }
  return { success: true };
}

/**
 * Get user's encrypted credentials and symmetric key from document store.
 */
async function getCredentials(req, res) {
  const holoUserId = req?.query?.holoUserId;

  if (!holoUserId) {
    getEndpointLogger.error("No holoUserId specified.");
    return res.status(400).json({ error: "No holoUserId specified" });
  }
  if (typeof holoUserId != "string") {
    getEndpointLogger.error("holoUserId isn't a string.");
    return res.status(400).json({ error: "holoUserId isn't a string" });
  }

  try {
    const userCreds = await UserCredentialsV2.findOne({
      holoUserId: holoUserId,
    }).exec();
    return res.status(200).json(userCreds);
  } catch (err) {
    getEndpointLogger.error(
      { error: err, holoUserId },
      "An error occurred while retrieving credentials from database"
    );
    return res.status(400).json({
      error: "An error occurred while trying to get credentials object from database.",
    });
  }
}

/**
 * ENDPOINT
 */
async function putPhoneCredentials(req, res) {
  const holoUserId = req?.body?.holoUserId;
  const encryptedCredentials = req?.body?.encryptedCredentials;

  const validationResult = await validatePutCredentialsArgs(
    holoUserId,
    encryptedCredentials
  );
  if (validationResult.error) {
    postEndpointLogger.error(
      { error: validationResult.error },
      "Invalid request body"
    );
    return res.status(400).json({ error: validationResult.error });
  }

  const storeOrUpdateResult = await storeOrUpdatePhoneCredentials(
    holoUserId,
    encryptedCredentials
  );
  if (storeOrUpdateResult.error) {
    postEndpointLogger.error(
      { error: storeOrUpdateResult.error, holoUserId },
      "An error occurred while storing or updating user credentials"
    );
    return res.status(500).json({ error: storeOrUpdateResult.error });
  }

  return res.status(200).json({ success: true });
}

export { getCredentials, putPhoneCredentials };
