const express = require('express');
const { exportAuditLogsPdf, getAuditLogs } = require('../controllers/auditController.js');
const { requireLogin, requireAdmin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/export-pdf', requireLogin, requireAdmin, exportAuditLogsPdf);
router.get('/', requireLogin, requireAdmin, getAuditLogs);

module.exports = router;
