const express = require('express');
const { editAccount } = require('../controllers/editAccountController.js');

const router = express.Router();

router.put('/edit-account', editAccount);

module.exports = router;
