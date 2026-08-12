const express = require("express");
const router = express.Router();

const controller = require("../controllers/reliefAnalyticsController");

const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");

router.get(
  "/overview",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefAnalyticsOverview
);

router.get(
  "/summary",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefSummary
);

router.get(
  "/status-breakdown",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefStatusBreakdown
);

router.get(
  "/barangay-demand",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefBarangayDemand
);

router.get(
  "/recent-trend",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefRecentTrend
);

router.get(
  "/release-performance",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefReleasePerformance
);

router.get(
  "/ai-insights",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getReliefAiInsights
);

router.get(
  "/export-pdf",
  requireLogin,
  requireAdminOrDrrmo,
  controller.exportReliefAnalyticsPdf
);

module.exports = router;