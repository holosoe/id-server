import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as AWS from "@aws-sdk/client-s3";
import { initialize, ZoKratesProvider } from "zokrates-js";
import { logWithTimestamp } from "./utils/utils";
import { env } from "@/constants";
import { getJobs } from "./services/vouched/endpoints";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Schema } = mongoose;

if (env.ENVIRONMENT === "dev") mongoose.set("debug", true);

const userVerificationsSchema = new Schema({
	govId: {
		uuid: String,
		sessionId: String,
	},
});
export const UserVerifications = mongoose.model(
	"UserVerifications",
	userVerificationsSchema,
);
export const userCredentialsSchema = new Schema({
	proofDigest: String,
	sigDigest: String,
	// NOTE: encryptedCredentials is stored as base64 string. Use LitJsSdk.base64StringToBlob() to convert back to blob
	// For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
	encryptedCredentials: {
		type: String,
		required: false,
	},
	// For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
	encryptedSymmetricKey: {
		type: String,
		required: false,
	},
	encryptedCredentialsAES: {
		type: String,
		required: false,
	},
});
export const UserCredentials = mongoose.model(
	"UserCredentials",
	userCredentialsSchema,
);
export const userProofMetadataSchema = new Schema({
	sigDigest: String,
	encryptedProofMetadata: {
		type: String,
		required: false,
	},
	encryptedSymmetricKey: {
		type: String,
		required: false,
	},
	encryptedProofMetadataAES: {
		type: String,
		required: false,
	},
});
export const UserProofMetadata = mongoose.model(
	"UserProofMetadata",
	userProofMetadataSchema,
);
export const DailyVerificationCountSchema = new Schema({
	date: {
		type: String, // use: new Date().toISOString().slice(0, 10)
		required: true,
	},
	vouched: {
		type: {
			jobCount: Number,
		},
		required: false,
	},
	veriff: {
		type: {
			// Veriff charges per _decision_. We are tracking sessions since each session
			// can have a decision, and we want to pre-emptively stop serving requests
			// for new sessions in case all current sessions end up with a decision.
			sessionCount: Number,
		},
		required: false,
	},
});
export const DailyVerificationCount = mongoose.model(
	"DailyVerificationCount",
	DailyVerificationCountSchema,
);
async function initializeDailyVerificationCount(
	DailyVerificationCount: $TSFixMe,
) {
	const DailyverificationCountCollection = await DailyVerificationCount.find();
	if (DailyverificationCountCollection.length === 0) {
		const vouchedJobCount = (await getJobs()).total || 0;
		// TODO: Get total Veriff verifications
		const newDailyVerificationCount = new DailyVerificationCount({
			date: new Date().toISOString().slice(0, 10),
			vouched: {
				jobCount: vouchedJobCount,
			},
			veriff: {
				sessionCount: 0,
			},
		});
		await newDailyVerificationCount.save();
	}
}

async function initializeMongoDb() {
	if (env.ENVIRONMENT !== "dev") {
		// Download certificate used for TLS connection
		try {
			const s3 = new AWS.S3({
				credentials: {
					accessKeyId: env.AWS_ACCESS_KEY_ID,
					secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
				},
				region: "us-east-1",
			});
			const params = {
				Bucket: env.BUCKET_NAME,
				Key: env.MONGO_CERT_FILE_NAME,
			};
			await new Promise<void>((resolve, reject) => {
				logWithTimestamp("Downloading certificate for MongoDB connection...");
				s3.getObject(params, async (getObjectErr: $TSFixMe, data: $TSFixMe) => {
					if (getObjectErr) reject(getObjectErr);
					const bodyStream = data.Body;
					const bodyAsString = await bodyStream.transformToString();
					fs.writeFile(
						`${__dirname}/../../${env.MONGO_CERT_FILE_NAME}`,
						bodyAsString,
						(writeFileErr) => {
							console.log("entered writeFile cb");
							if (writeFileErr) {
								console.log("writeFileErr...", writeFileErr);
								resolve();
							}
							logWithTimestamp(
								"Successfully downloaded certificate for MongoDB connection",
							);
							resolve();
						},
					);
				});
			});
		} catch (err) {
			console.log(
				"Unable to download certificate for MongoDB connection.",
				err,
			);
			return;
		}
	}

	try {
		const mongoConfig = {
			ssl: true,
			sslValidate: true,
			sslCA: `${__dirname}/../../${env.MONGO_CERT_FILE_NAME}`,
		};
		await mongoose.connect(
			env.MONGO_DB_CONNECTION_STR,
			env.ENVIRONMENT === "dev" ? {} : mongoConfig,
		);
		console.log("Connected to MongoDB database.");
	} catch (err) {
		console.log("Unable to connect to MongoDB database.", err);
		return;
	}
	await initializeDailyVerificationCount(DailyVerificationCount);
	return {
		UserVerifications,
		UserCredentials,
		UserProofMetadata,
		DailyVerificationCount,
	};
}

initializeMongoDb().then((result) => {
	if (result) {
	} else {
		console.log("MongoDB initialization failed");
	}
});

export let zokProvider: ZoKratesProvider;
initialize().then((provider) => {
	zokProvider = provider;
});

export const close = () => mongoose.connection.close();