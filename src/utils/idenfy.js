import axios from "axios";
import { sha256 } from "./utils.js";

export async function createIdenfyToken(sigDigest) {
  try {
    const reqBody = {
      clientId: sha256(Buffer.from(sigDigest)).toString("hex"),
      // Getting 'You are not allowed to use a custom callback url.' when specifying callbackUrl
      // callbackUrl: "https://id-server.holonym.io/idenfy/webhook",
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${process.env.IDENFY_API_KEY}:${process.env.IDENFY_API_KEY_SECRET}`
        ).toString("base64")}`,
      },
    };
    const resp = await axios.post(
      "https://ivs.idenfy.com/api/v2/token",
      reqBody,
      config
    );
    return resp?.data;
  } catch (err) {
    console.error(`Error creating idenfy token:`, err.message, err.response?.data);
  }
}

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
    return await axios.post(
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
  } catch (err) {
    console.error(
      `Error deleting idenfy session (scanRef: ${scanRef}):`,
      err.message,
      err.response?.data
    );
  }
}
