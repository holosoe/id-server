const express = require("express");

const router = express.Router();

const initialize = require("../services/initialize.service");

router.get("/", initialize.initialize);

module.exports = router;
