const express = require("express");
const cors = require("cors");
const init = require("./init");

const app = express();

var corsOptions = {
  origin: true,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const register = require("./routes/register");
const initialize = require("./routes/initialize");
app.use("/register", register);
app.use("/initialize", initialize);

module.exports = app;
