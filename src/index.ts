import express from "express";
import cors from "cors";
import registerVouched from "./routes/register-vouched.js";
import vouchedMisc from "./routes/vouched.js";
import veriff from "./routes/veriff.js";
import credentials from "./routes/credentials.js";
import proofMetadata from "./routes/proof-metadata.js";

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

// @ts-expect-error TS(6133) FIXME: 'req' is declared but its value is never read.
app.get("/", (req: $TSFixMe, res: $TSFixMe) => {
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

// @ts-expect-error TS(6133) FIXME: 'req' is declared but its value is never read.
app.get("/aws-health", (req: $TSFixMe, res: $TSFixMe) => {
  // console.log(`${new Date().toISOString()} GET /aws-health`);
  return res.status(200).json({ healthy: true });
});

export { app };
