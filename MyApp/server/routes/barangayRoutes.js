const express = require('express');
const router = express.Router();
const controller = require('../controllers/barangayController');

console.log('controller keys:', Object.keys(controller));
console.log('getMe:', typeof controller.getMe);
console.log('getBarangays:', typeof controller.getBarangays);
console.log('getBarangayBounds:', typeof controller.getBarangayBounds);

router.get('/me', controller.getMe);
router.get('/', controller.getBarangays);
router.get('/bounds', controller.getBarangayBounds);

module.exports = router;