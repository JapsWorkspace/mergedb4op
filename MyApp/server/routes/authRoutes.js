const express = require('express');
const authController = require('../controllers/authController');
const { requireAdmin, requireLogin } = require('../middleware/adminMiddleware');
const router = express.Router();

router.get('/init', authController.initAdmin);
router.post('/register', requireAdmin, authController.register);
router.get('/approve-account/:token', authController.approveAccountRequest);
router.get('/approve-account-update/:token', authController.approveAccountUpdateRequest);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.put('/theme-preference', requireLogin, authController.updateThemePreference);
router.get('/barangay-options', authController.getAvailableBarangays);

router.get('/all', requireAdmin, authController.getAllAccounts);          // admin list
router.put('/update/:id', requireAdmin, authController.updateAccount);   // update any account
router.put('/archive/:id', requireAdmin, authController.archiveAccount);
router.get('/archived', requireAdmin, authController.getArchivedAccounts);
router.delete('/archived/:id', requireAdmin, authController.deleteArchivedAccount);
router.put('/restore/:id', requireAdmin, authController.restoreAccount);
router.get('/admin/logs', requireAdmin, authController.getAdminLogs);

module.exports = router;
