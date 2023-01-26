import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const envSchema = z.object({
	ON_LINUX: z.string(),
	NODE_ENV: z.string(),
	ADDRESS: z.string(),
	TESTING: z.string(),
	PRIVATE_KEY: z.string(),
	ENVIRONMENT: z.string(),
	THIS_API_KEY: z.string(),
	VOUCHED_PUBLIC_KEY: z.string(),
	VOUCHED_PRIVATE_KEY: z.string().default("test"),
	VOUCHED_SANDBOX_PUBLIC_KEY: z.string(),
	VOUCHED_SANDBOX_PRIVATE_KEY: z.string(),
	VERIFF_PUBLIC_API_KEY: z.string(),
	VERIFF_SECRET_API_KEY: z.string(),
	MONGO_DB_CONNECTION_STR: z.string(),
	BUCKET_NAME: z.string(),
	MONGO_CERT_FILE_NAME: z.string(),
	AWS_ACCESS_KEY_ID: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	ADMIN_EMAILS: z.string().transform((s) => s.split(",")),
	PAYPAL_CLIENT_ID: z.string().optional(),
	PAYPAL_SECRET: z.string().optional(),
	SENDGRID_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const holonymIssuers = [
	"0x8281316ac1d51c94f2de77575301cef615adea84", // gov-id
	"0xb625e69ab86db23c23682875ba10fbc8f8756d16", // phone
	"0xfc8a8de489efefb91b42bb8b1a6014b71211a513", // phone dev
];
export const relayerURL =
	env.NODE_ENV === "development"
		? env.ON_LINUX === "true"
			? "http://172.17.0.1:6969"
			: "http://host.docker.internal:6969"
		: "https://relayer.holonym.id";
