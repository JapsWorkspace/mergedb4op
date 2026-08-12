const express = require("express");
const router = express.Router();
const controller = require("../controllers/reliefDistributionController");
const { requireLogin } = require("../middleware/adminMiddleware");

router.get(
  "/:reliefRequestId/export-accomplished-report-pdf",
  requireLogin,
  controller.exportAccomplishedReportPdf
);

router.post(
  "/:reliefRequestId/import-workbook",
  requireLogin,
  controller.importDistributionWorkbook
);

router.post(
  "/:reliefRequestId/confirm-accomplished",
  requireLogin,
  controller.confirmAccomplishedDistribution
);

router.get(
  "/:reliefRequestId",
  requireLogin,
  controller.getRequestDistributions
);

router.post(
  "/:reliefRequestId/records",
  requireLogin,
  controller.createDistributionRecord
);

router.put(
  "/:reliefRequestId/records/:recordId",
  requireLogin,
  controller.updateDistributionRecord
);

router.delete(
  "/:reliefRequestId/records/:recordId",
  requireLogin,
  controller.deleteDistributionRecord
);

module.exports = router;
