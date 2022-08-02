import web3 from "web3";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
// import { verifyMessage } from 'ethers/lib/utils'

export function assertSignerIsAddress(message, signature, address) {
  let signer;
  try {
    signer = ethers.utils.verifyMessage(message, signature);
  } catch (err) {
    console.log(err);
    console.log("Malformed signature");
  }
  return signer.toLowerCase() == address.toLowerCase();
}

/**
 * Sign data with the server's private key
 */
export async function sign(data) {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const signature = await wallet.signMessage(data);
  return signature;
}

export function getDaysSinceNewYear(month, day) {
  let daysSinceNewYear = day;
  if (month == 1) {
    return daysSinceNewYear;
  }
  if (month > 1) {
    daysSinceNewYear += 31;
  }
  if (month > 2) {
    if (isLeapYear(new Date().getYear())) {
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
