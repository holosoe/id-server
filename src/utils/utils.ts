import { createHash, randomBytes } from "crypto";
import assert from "assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
// @ts-ignore
import { poseidon } from "circomlibjs-old";
import sgMail from "@sendgrid/mail";
import { env } from "@/constants";

/**
 * Sign data with the server's private key
 */
export async function sign(data: $TSFixMe) {
	const wallet = new ethers.Wallet(env.PRIVATE_KEY);
	const signature = await wallet.signMessage(data);
	return signature;
}

/**
 * @param {string} date Must be of form yyyy-mm-dd
 */
export function getDateAsInt(date: string) {
	// Format input
	const [year, month, day] = date.split("-").map((x) => parseInt(x, 10));
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
	issuer: Buffer,
	secret: Buffer,
	countryCode: Buffer,
	nameCitySubdivisionZipStreetHash: BigInt,
	completedAt: number,
	birthdate: Buffer,
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
			].map((x) => ethers.BigNumber.from(x).toString()),
		);
	} catch (err) {
		console.log(err);
	}
}

export async function sendEmail(
	to: string,
	subject: string,
	text: string,
	html: string,
) {
	sgMail.setApiKey(env.SENDGRID_API_KEY!);
	// TODO: Setup SendGrid account, configure email in SendGrid, and test
	try {
		await sgMail.send({
			to, // "test@example.com"
			from: "idservices@holonym.id",
			subject,
			text,
			html,
		});
	} catch (error) {
		console.error(error);
	}
}

export function hash(data: $TSFixMe) {
	// returns Buffer
	return createHash("sha256").update(data).digest();
}

export function generateSecret(numBytes = 16) {
	return `0x${randomBytes(numBytes).toString("hex")}`;
}
