const express = require("express");
const router = express.Router();

const controller = require("../controllers/incidentAnalyticsController");

const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");

router.get(
  "/overview",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getIncidentAnalyticsOverview
);

router.get(
  "/ai-insights",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getIncidentAiInsights
);

router.get(
  "/export-pdf",
  requireLogin,
  requireAdminOrDrrmo,
  controller.exportIncidentAnalyticsPdf
);

module.exports = router;