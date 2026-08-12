const express = require("express");
const router = express.Router();

const {
  getEvacAnalyticsOverview,
  getEvacSummary,
  getEvacStatusBreakdown,
  getEvacBarangayCapacity,
  getEvacRecentTrend,
  getEvacFacilityReadiness,
  getEvacActivityPerformance,
  getEvacAiInsights,
  exportEvacAnalyticsPdf,
} = require("../controllers/EvacAnalyticsController");

router.get("/overview", getEvacAnalyticsOverview);
router.get("/summary", getEvacSummary);
router.get("/status-breakdown", getEvacStatusBreakdown);
router.get("/barangay-capacity", getEvacBarangayCapacity);
router.get("/recent-trend", getEvacRecentTrend);
router.get("/facility-readiness", getEvacFacilityReadiness);
router.get("/activity-performance", getEvacActivityPerformance);
router.get("/ai-insights", getEvacAiInsights);
router.get("/export-pdf", exportEvacAnalyticsPdf);

module.exports = router;