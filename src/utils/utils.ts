import { createHash, randomBytes } from "crypto";
import assert from "assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'circ... Remove this comment to see the full error message
import { poseidon } from "circomlibjs-old";
import sgMail from "@sendgrid/mail";

/**
 * Sign data with the server's private key
 */
export async function sign(data: $TSFixMe) {
  // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const signature = await wallet.signMessage(data);
  return signature;
}

/**
 * @param {string} date Must be of form yyyy-mm-dd
 */
export function getDateAsInt(date: $TSFixMe) {
  // Format input
  const [year, month, day] = date.split("-");
  assert.ok(year && month && day); // Make sure Y M D all given
  assert.ok(year >= 1900 && year <= 2099); // Make sure date is in a reasonable range, otherwise it's likely the input was malformatted and it's best to be safe by stopping -- we can always allow more edge cases if needed later
  const time = new Date(date).getTime() / 1000 + 2208988800; // 2208988800000 is 70 year offset; Unix timestamps below 1970 are negative and we want to allow from approximately 1900.
  assert.ok(!isNaN(time));
  return time;
}

export function logWithTimestamp(message: $TSFixMe) {
  console.log(`${new Date().toISOString()} ${message}`);
}

function assertLengthIs(item: $TSFixMe, length: $TSFixMe, itemName: $TSFixMe) {
  const errMsg = `${itemName} must be ${length} bytes but is ${item.length} bytes`;
  assert.equal(item.length, length, errMsg);
}

/**
 * Takes Buffer, properly formats them (according to spec), and returns a hash.
 * See: https://opsci.gitbook.io/untitled/4alwUHFeMIUzhQ8BnUBD/extras/leaves
 * @param {Buffer} issuer Blockchain address of account that issued the credentials
 * @param {Buffer} secret 16 bytes
 * @param {Buffer} countryCode
 * @param {BigInt} nameCitySubdivisionZipStreetHash
 * @param {Buffer} completedAt
 * @param {Buffer} birthdate
 * @returns {Promise<string>} Poseidon hash (of input data) right-shifted 3 bits. Represented as
 * a base 10 number represented as a string.
 */
export async function createLeaf(
  issuer: $TSFixMe,
  secret: $TSFixMe,
  countryCode: $TSFixMe,
  nameCitySubdivisionZipStreetHash: $TSFixMe,
  completedAt: $TSFixMe,
  birthdate: $TSFixMe
) {
  assertLengthIs(issuer, 20, "issuer");
  assertLengthIs(secret, 16, "secret");
  try {
    return poseidon(
      [
        issuer,
        secret,
        countryCode,
        nameCitySubdivisionZipStreetHash,
        completedAt,
        birthdate,
      ].map((x) => ethers.BigNumber.from(x).toString())
    );
  } catch (err) {
    console.log(err);
  }
}

export async function sendEmail(to: $TSFixMe, subject: $TSFixMe, text: $TSFixMe, html: $TSFixMe) {
  // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // TODO: Setup SendGrid account, configure email in SendGrid, and test
  const msg = {
    to, // "test@example.com"
    from: "idservices@holonym.id",
    subject,
    text,
    html,
  };
  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error(error);
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    if (error.response) {
      // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
      console.error(error.response.body);
    }
  }
}

export function hash(data: $TSFixMe) {
  // returns Buffer
  return createHash("sha256").update(data).digest();
}

export function generateSecret(numBytes = 16) {
  return "0x" + randomBytes(numBytes).toString("hex");
}
