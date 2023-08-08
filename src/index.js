import express from "express";
import cors from "cors";
import registerVouched from "./routes/register-vouched.js";
import vouchedMisc from "./routes/vouched.js";
import veriff from "./routes/veriff.js";
import idenfy from "./routes/idenfy.js";
import onfido from "./routes/onfido.js";
import credentials from "./routes/credentials.js";
import proofMetadata from "./routes/proof-metadata.js";
import admin from "./routes/admin.js";
import sessionStatus from "./routes/session-status.js";

const app = express();

var corsOptions = {
  origin: true,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/v2/registerVouched", registerVouched);
app.use("/vouched", vouchedMisc);
app.use("/credentials", credentials);
app.use("/proof-metadata", proofMetadata);
app.use("/veriff", veriff);
app.use("/idenfy", idenfy);
app.use("/onfido", onfido);
app.use("/admin", admin);
app.use("/session-status", sessionStatus);

app.get("/", (req, res) => {
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

app.get("/aws-health", (req, res) => {
  // console.log(`${new Date().toISOString()} GET /aws-health`);
  return res.status(200).json({ healthy: true });
});

export { app };
