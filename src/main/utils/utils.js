import { strict as assert } from "node:assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;

/**
 * Sign data with the server's private key
 */
export async function sign(data) {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const signature = await wallet.signMessage(data);
  return signature;
}

/**
 * Convert date string to 3 bytes with the following structure:
 * byte 1: number of years since 1900
 * bytes 2-3: number of days after beginning of the given year
 * @param {string} date Must be of form yyyy-mm-dd
 */
export function getDateAsInt(date) {
  // Format input
  const [year, month, day] = date.split("-");
  assert.ok((year > 1900) && (year < 2099)); // Make sure date is in a reasonable range, otherwise it's likely the input was malformatted and it's best to be safe by stopping -- we can always allow more edge cases if needed later 
  return (new Date(date)).getTime() / 1000 + 2208988800 // 2208988800000 is 70 year offset; Unix timestamps below 1970 are negative and we want to allow from approximately 1900. 
}

export function logWithTimestamp(message) {
  console.log(`${new Date().toISOString()} ${message}`);
}

export const mockSequelize = {
  close: async () => await new Promise((resolve) => resolve({})),
  models: {
    User: {
      findOne: async (query) => await new Promise((resolve) => resolve({})),
      create: async (query) => await new Promise((resolve) => resolve({})),
    },
  },
};
