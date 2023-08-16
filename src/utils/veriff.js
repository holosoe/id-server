import { createHmac } from "crypto";
import axios from "axios";

/**
 * @param {string} sessionId
 */
export async function getVeriffSessionDecision(sessionId) {
  try {
    const hmacSignature = createHmac("sha256", process.env.VERIFF_SECRET_API_KEY)
      .update(Buffer.from(sessionId, "utf8"))
      .digest("hex")
      .toLowerCase();
    const resp = await axios.get(
      `https://api.veriff.me/v1/sessions/${sessionId}/decision`,
      {
        headers: {
          "X-AUTH-CLIENT": process.env.VERIFF_PUBLIC_API_KEY,
          "X-HMAC-SIGNATURE": hmacSignature,
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      "Error getting veriff session decision:",
      err.message,
      err.response?.data
    );
  }
}

/**
 * @param {string} sessionId
 */
export async function deleteVeriffSession(sessionId) {
  try {
    const hmacSignature = createHmac("sha256", process.env.VERIFF_SECRET_API_KEY)
      .update(Buffer.from(sessionId, "utf8"))
      .digest("hex")
      .toLowerCase();
    const resp = await axios.delete(`https://api.veriff.me/v1/sessions/${sessionId}`, {
      headers: {
        "X-AUTH-CLIENT": process.env.VERIFF_PUBLIC_API_KEY,
        "X-HMAC-SIGNATURE": hmacSignature,
        "Content-Type": "application/json",
      },
    });
    return resp.data;
  } catch (err) {
    console.error("Error deleting veriff session:", err.message, err.response?.data);
  }
}
