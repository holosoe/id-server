const express = require('express')
const router = express.Router()

const register = require('../services/register.service')

router.get('/', register.register)

module.exports = router
