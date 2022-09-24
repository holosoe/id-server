import { jsonDb } from "../init.js";

export function getVerificationCount() {
  jsonDb.read();
  return jsonDb.data.verificationCount;
}

export function incrementVerificationCount() {
  const currentCount = getVerificationCount();
  jsonDb.data.verificationCount = currentCount + 1;
  jsonDb.write();
}

export function setVerificationCountToZero() {
  jsonDb.data.verificationCount = 0;
  jsonDb.data.lastZeroed = new Date().getMonth();
  jsonDb.write();
}

/**
 * @returns the month in which verificationCount was last set to 0.
 */
export function getLastZeroed() {
  jsonDb.read();
  return jsonDb.data.lastZeroed;
}
