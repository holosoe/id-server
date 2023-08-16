import axios from "axios";

/**
 * @param {string} scanRef
 */
export async function getIdenfySessionStatus(scanRef) {
  try {
    const resp = await axios.post(
      `https://ivs.idenfy.com/api/v2/status`,
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      `Error getting idenfy session status (scanRef: ${scanRef}):`,
      err.message,
      err.response?.data
    );
  }
}

/**
 * @param {string} scanRef
 */
export async function getIdenfySessionVerificationData(scanRef) {
  try {
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/data",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      `Error getting idenfy session data (scanRef: ${scanRef}):`,
      err.message,
      err.response?.data
    );
  }
}

export async function deleteIdenfySession(scanRef) {
  try {
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/delete",
      {
        scanRef,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
          ).toString("base64")}`,
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      `Error deleting idenfy session (scanRef: ${scanRef}):`,
      err.message,
      err.response?.data
    );
  }
}
