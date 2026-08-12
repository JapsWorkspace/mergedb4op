const express = require("express");
const router = express.Router();

const controller = require("../controllers/overviewAnalyticsController");

const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");

router.get(
  "/overview",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getOverviewAnalyticsOverview
);

router.get(
  "/ai-insights",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getOverviewAiInsights
);

module.exports = router;
