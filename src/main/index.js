import express from "express";
import cors from "cors";
// import init from "./init.js";
import initialize from "./routes/initialize.js";
import register from "./routes/register.js";
import registerVouched from "./routes/registerVouched.js";

const app = express();

var corsOptions = {
  origin: true,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/initialize", initialize);
app.use("/register", register);
app.use("/registerVouched", registerVouched);

app.get("/", (req, res) => {
  console.log(`${new Date().toISOString()} GET /`);
  const routes = [
    "GET /initialize",
    "GET /register",
    "GET /register/redirect",
    "GET /register/credentials",
    "GET /registerVouched/vouchedCredentials",
  ];
  res.status(200).json({ routes: routes });
});

export { app };
