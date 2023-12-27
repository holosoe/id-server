import { UserCredentialsV2 } from "../init.js";
import logger from "../utils/logger.js";

const postEndpointLogger = logger.child({ msgPrefix: "[POST /credentials/v2] " });
const getEndpointLogger = logger.child({ msgPrefix: "[GET /credentials/v2] " });

async function validatePutCredentialsArgs(sigDigest) {
  // Require that args are present
  if (!sigDigest || sigDigest == "null" || sigDigest == "undefined") {
    return { error: "No sigDigest specified" };
  }

  // Require that args are correct types
  if (typeof sigDigest != "string") {
    return { error: "sigDigest isn't a string" };
  }

  // Ensure that args are not too large
  if (sigDigest.length != 64) {
    return { error: "sigDigest is not 64 characters long" };
  }
  return { success: true };
}

async function storeOrUpdatePhoneCredentials(sigDigest, encryptedCredentials) {
  let userCredentialsDoc;
  try {
    userCredentialsDoc = await UserCredentialsV2.findOne({
      sigDigest: sigDigest,
    }).exec();
  } catch (err) {
    postEndpointLogger.error(
      { error: err },
      "An error occurred while retrieving credentials"
    );
    return { error: "An error occurred while retrieving credentials." };
  }
  if (userCredentialsDoc) {
    userCredentialsDoc.sigDigest = sigDigest;
    userCredentialsDoc.phone = encryptedCredentials;
  } else {
    userCredentialsDoc = new UserCredentialsV2({
      sigDigest,
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
  const sigDigest = req?.query?.sigDigest;

  if (!sigDigest) {
    getEndpointLogger.error("No sigDigest specified.");
    return res.status(400).json({ error: "No sigDigest specified" });
  }
  if (typeof sigDigest != "string") {
    getEndpointLogger.error("sigDigest isn't a string.");
    return res.status(400).json({ error: "sigDigest isn't a string" });
  }

  try {
    const userCreds = await UserCredentialsV2.findOne({
      sigDigest: sigDigest,
    }).exec();
    return res.status(200).json(userCreds);
  } catch (err) {
    getEndpointLogger.error(
      { error: err, sigDigest },
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
  const sigDigest = req?.body?.sigDigest;
  const encryptedCredentials = req?.body?.encryptedCredentials;

  const validationResult = await validatePutCredentialsArgs(
    sigDigest,
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
    sigDigest,
    encryptedCredentials
  );
  if (storeOrUpdateResult.error) {
    postEndpointLogger.error(
      { error: storeOrUpdateResult.error, sigDigest },
      "An error occurred while storing or updating user credentials"
    );
    return res.status(500).json({ error: storeOrUpdateResult.error });
  }

  return res.status(200).json({ success: true });
}

export { getCredentials, putPhoneCredentials };
