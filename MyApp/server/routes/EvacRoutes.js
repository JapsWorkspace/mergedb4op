const express = require("express");
const router = express.Router();

const controller = require("../controllers/EvacController");
const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");

/* =========================
   PUBLIC ROUTES
========================= */

router.get("/public", controller.getPublicPlaces);

/* =========================
   ACTIVE EVACUATION ROUTES
========================= */

router.post(
  "/make",
  requireLogin,
  controller.createPlace
);

router.get(
  "/",
  controller.getPlaces
);

router.get(
  "/history/logs",
  requireLogin,
  controller.getHistory
);

router.get(
  "/analytics/summary",
  requireLogin,
  controller.getAnalyticsSummary
);

router.get(
  "/export-pdf",
  requireLogin,
  controller.exportPlacesPdf
);

router.put(
  "/:id",
  requireLogin,
  controller.updatePlace
);

router.put(
  "/:id/status",
  requireLogin,
  controller.updateCapacityStatus
);

router.put(
  "/:id/landing-visibility",
  requireLogin,
  requireAdminOrDrrmo,
  controller.updateLandingVisibility
);

router.delete(
  "/:id",
  requireLogin,
  controller.deletePlace
);

router.put(
  "/:id/unarchive",
  requireLogin,
  controller.unarchivePlace
);

router.delete(
  "/:id/permanent",
  requireLogin,
  controller.permanentDeletePlace
);

router.put("/:id/occupancy", requireLogin, controller.updateOccupancy);

module.exports = router;
