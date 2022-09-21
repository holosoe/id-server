import express from "express";
import cors from "cors";
// import init from "./init.js";
import initialize from "./routes/initialize.js";
import register from "./routes/register.js";
import provingKeys from "./routes/provingKeys.js";

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
app.use("/proving-keys", provingKeys);

export { app };
