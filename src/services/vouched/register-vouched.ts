import type { Request, Response } from "express";
import { BigNumber, utils } from "ethers";
import { z } from "zod";
// @ts-ignore
import { poseidon } from "circomlibjs-old";
import { UserVerifications } from "../../init";
import {
	sign,
	createLeaf,
	getDateAsInt,
	logWithTimestamp,
	generateSecret,
} from "../../utils/utils";
import { newDummyUserCreds } from "../../utils/constants";
import { env } from "@/constants";
import { getVouchedJob, redactVouchedJob } from "./endpoints";
import { validateJob } from "./validateJob";
import { getUUID } from "./getUUID";
import { extractCreds } from "./Credentials";

export const vouchedPrivateKey = env.VOUCHED_PRIVATE_KEY;

/**
 * Serialize the credentials into the 6 field elements they will be as the preimage to the leaf
 * @param {Object} creds Object containing a full string representation of every credential.
 * @returns 6 string representations of the preimage's 6 field elements, in order
 */
function serializeCreds(creds: $TSFixMe) {
	let countryBuffer = Buffer.alloc(2);
	countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

	return [
		creds.issuer,
		creds.secret,
		`0x${countryBuffer.toString("hex")}`,
		creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value,
		getDateAsInt(creds.rawCreds.completedAt).toString(),
		creds.scope.toString(),
	];
}

/**
 * With the server's blockchain account, sign the given credentials.
 * @param creds Object containing a full string representation of every credential.
 * @returns Object containing one smallCreds signature for every
 *          credential and one bigCreds signature.
 */
async function generateSignature(creds: $TSFixMe) {
	const serverAddress = env.ADDRESS;
	let countryBuffer = Buffer.alloc(2);
	countryBuffer.writeUInt16BE(creds.rawCreds.countryCode);

	const leafAsBigInt = await createLeaf(
		Buffer.from(serverAddress.replace("0x", ""), "hex"),
		Buffer.from(creds.secret.replace("0x", ""), "hex"),
		countryBuffer,
		creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value,
		getDateAsInt(creds.rawCreds.completedAt),
		creds.scope,
	);
	const leaf = utils.arrayify(BigNumber.from(leafAsBigInt));
	return await sign(leaf);
}

async function saveUserToDb(uuid: $TSFixMe, jobID: $TSFixMe) {
	const userVerificationsDoc = new UserVerifications({
		govId: {
			uuid: uuid,
			sessionId: jobID,
		},
	});
	try {
		await userVerificationsDoc.save();
	} catch (err) {
		console.log(err);
		console.log(
			"registerVouched/vouchedCredentials: Could not save userVerificationsDoc. Exiting",
		);
		return {
			error:
				"An error occurred while trying to save object to database. Please try again.",
		};
	}
	return { success: true };
}

const getCredentialsQuerySchema = z.object({
	jobID: z.string(),
});
/**
 * End helper functions
 * ---------------------------------------------------
 * Vouched verification
 */

/**
 * Allows user to retrieve their Vouched verification info
 */
async function getCredentials(req: Request, res: Response) {
	logWithTimestamp("registerVouched/vouchedCredentials: Entered");

	if (env.ENVIRONMENT === "dev") {
		const creds = {
			...newDummyUserCreds,
			issuer: env.ADDRESS,
			secret: generateSecret(),
			scope: 0,
		};

		logWithTimestamp(
			"registerVouched/vouchedCredentials: Generating signature",
		);
		const signature = await generateSignature(creds);

		const serializedCreds = serializeCreds(creds);

		const response = {
			...creds, // credentials from Vouched (plus secret and issuer)
			signature: signature, // server-generated signature
			serializedCreds: serializedCreds,
		};
		return res.status(200).json(response);
	}

	const validatedData = getCredentialsQuerySchema.safeParse(req.query);
	if (validatedData.success === false) {
		logWithTimestamp(
			"registerVouched/vouchedCredentials: invalid param for job. Exiting.",
		);
		res.status(400).send(validatedData.error.message);
		return;
	}
	const { jobID } = validatedData.data;
	const getVouchedResult = await getVouchedJob(validatedData.data.jobID);
	if (getVouchedResult.success !== true) {
		logWithTimestamp(
			"registerVouched/vouchedCredentials: Could not get Vouched job. Exiting.",
		);
		res.status(400).send(getVouchedResult.error);
		return;
	}
	const { job } = getVouchedResult;

	// TODO: Check job.result.ipFraudCheck ?

	const validationResult = validateJob(job, jobID);
	if (validationResult.error) return res.status(400).json(validationResult);

	// Get UUID
	const uuid = getUUID(job.result);

	// Assert user hasn't registered yet
	const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
	if (user) {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: User has already registered. Exiting. UUID == ${uuid}`,
		);
		return res
			.status(400)
			.json({ error: `User has already registered. UUID: ${uuid}` });
	}

	// Store UUID for Sybil resistance
	logWithTimestamp(
		"registerVouched/vouchedCredentials: Inserting user into database",
	);
	const dbResponse = await saveUserToDb(uuid, jobID);
	if (dbResponse.error) return res.status(400).json(dbResponse);

	const creds = {
		...extractCreds(job),
		issuer: env.ADDRESS,
		secret: generateSecret(),
		scope: 0,
	};

	logWithTimestamp("registerVouched/vouchedCredentials: Generating signature");
	const signature = await generateSignature(creds);

	const serializedCreds = serializeCreds(creds);

	const response = {
		...creds, // credentials from Vouched (plus secret and issuer)
		signature: signature, // server-generated signature
		serializedCreds: serializedCreds,
	};

	await redactVouchedJob(jobID);

	logWithTimestamp(
		`registerVouched/vouchedCredentials: Returning user whose UUID is ${uuid}`,
	);

	return res.status(200).json(response);
}

export { getCredentials };
