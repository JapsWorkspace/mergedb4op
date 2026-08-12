const express = require("express");
const router = express.Router();

const controller = require("../controllers/barangayStockController");

router.get("/", controller.getBarangayStock);
router.post("/distribute", controller.distributeStock);
router.get("/transactions", controller.getTransactions);

module.exports = router;