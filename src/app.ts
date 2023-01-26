import express from "express";
import type { Request, Response } from "express";

import cors from "cors";
import registerVouched from "./routes/register-vouched";
import vouchedMisc from "./routes/vouched";
import veriff from "./routes/veriff";
import credentials from "./routes/credentials";
import proofMetadata from "./routes/proof-metadata";

const app = express();

var corsOptions = {
	origin: true,
	optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/registerVouched", registerVouched);
app.use("/vouched", vouchedMisc);
app.use("/credentials", credentials);
app.use("/proof-metadata", proofMetadata);
app.use("/veriff", veriff);


app.get("/", (_: Request, res: Response) => {
	console.log(`${new Date().toISOString()} GET /`);
	const routes = [
		"GET /registerVouched/vouchedCredentials",
		"GET /veriff/credentials",
		"GET /credentials",
		"POST /credentials",
		"GET /proof-metadata",
		"POST /proof-metadata",
	];
	res.status(200).json({ routes: routes });
}); 

app.get("/aws-health", (_: Request, res: Response) => {
	// console.log(`${new Date().toISOString()} GET /aws-health`);
	return res.status(200).json({ healthy: true });
});

export { app };
