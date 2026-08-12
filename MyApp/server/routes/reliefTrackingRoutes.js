const express = require("express");
const router = express.Router();
const controller = require("../controllers/reliefTrackingController");
const { requireLogin } = require("../middleware/adminMiddleware");

router.get("/", requireLogin, controller.getReliefTracking);

module.exports = router;