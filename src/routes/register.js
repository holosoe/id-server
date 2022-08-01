const express = require("express");

const router = express.Router();

const register = require("../services/register.service");

router.get("/", register.startPersonaInquiry);
router.get("/redirect", register.acceptPersonaRedirect);
router.get("/credentials", register.acceptFrontendRedirect);

module.exports = router;
