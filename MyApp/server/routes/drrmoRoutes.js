const express = require("express");
const router = express.Router();
const controller = require("../controllers/drrmoController");
const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");

router.get(
  "/pending-requests",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getPendingRequests
);

router.get(
  "/requests/queue",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getRequestQueue
);

router.get(
  "/requests/:requestId",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getRequestReviewDetails
);

router.get(
  "/requests/:requestId/feasibility",
  requireLogin,
  requireAdminOrDrrmo,
  controller.getRequestFeasibility
);

router.put(
  "/requests/:requestId/status",
  requireLogin,
  requireAdminOrDrrmo,
  controller.updateReliefStatus
);

module.exports = router;