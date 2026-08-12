const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

/* =========================
   HISTORY ROUTES
========================= */

// ✅ Register a new history entry (SAFE / NOT SAFE / etc.)
router.post('/', historyController.registerHistory);
router.post('/registerHistory', historyController.registerHistory);

// ✅ Get history for a specific family / connection
router.get('/:placeName', historyController.getHistory);

module.exports = router;
