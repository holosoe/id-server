import express from "express";
import cors from "cors";
import verify from "./routes/verify-vouched.js";

const app = express();

var corsOptions = {
  origin: true,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/registerVouched", verify);

app.get("/", (req, res) => {
  console.log(`${new Date().toISOString()} GET /`);
  const routes = ["GET /registerVouched/vouchedCredentials"];
  res.status(200).json({ routes: routes });
});

export { app };
