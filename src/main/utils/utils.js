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
export function getDateAsBytes(date) {
  // Format input
  const [year, month, day] = date.split("-");
  const yearAsInt = parseInt(year);
  const monthAsInt = parseInt(month);
  const dayAsInt = parseInt(day);

  const yearsSince1900 = yearAsInt - 1900;
  const daysSinceNewYear = getDaysAfterNewYear(yearAsInt, monthAsInt, dayAsInt);

  // Validate input
  assert.ok(yearsSince1900 >= 0, "Invalid year");
  assert.ok(monthAsInt >= 0 && monthAsInt <= 12, `Invalid month ${month}`);
  assert.ok(dayAsInt >= 0 && dayAsInt <= 31, `Invalid day ${day}`);

  // Convert yearsSince1900 and daysSinceNewYear to bytes
  const yearsBuffer = Buffer.alloc(1, yearsSince1900);
  let daysBuffer;
  if (daysSinceNewYear > 255) {
    daysBuffer = Buffer.concat([
      Buffer.from([0x01]),
      Buffer.alloc(1, daysSinceNewYear - 256),
    ]);
  } else {
    daysBuffer = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.alloc(1, daysSinceNewYear),
    ]);
  }

  return Buffer.concat([yearsBuffer, daysBuffer], 3);
}

export function getDaysAfterNewYear(year, month, day) {
  let daysSinceNewYear = day;
  if (month == 1) {
    return daysSinceNewYear;
  }
  if (month > 1) {
    daysSinceNewYear += 31;
  }
  if (month > 2) {
    if (isLeapYear(year)) {
      daysSinceNewYear += 29;
    } else {
      daysSinceNewYear += 28;
    }
  }
  if (month > 3) {
    daysSinceNewYear += 31;
  }
  if (month > 4) {
    daysSinceNewYear += 30;
  }
  if (month > 5) {
    daysSinceNewYear += 31;
  }
  if (month > 6) {
    daysSinceNewYear += 30;
  }
  if (month > 7) {
    daysSinceNewYear += 31;
  }
  if (month > 8) {
    daysSinceNewYear += 31;
  }
  if (month > 9) {
    daysSinceNewYear += 30;
  }
  if (month > 10) {
    daysSinceNewYear += 31;
  }
  if (month > 11) {
    daysSinceNewYear += 30;
  }
  return daysSinceNewYear;
}

function isLeapYear(year) {
  return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
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
