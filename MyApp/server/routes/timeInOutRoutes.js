const express = require('express');
const router = express.Router();
const { getAllTimeLogs } = require('../controllers/timeInOutController');

router.get('/', getAllTimeLogs);

module.exports = router;