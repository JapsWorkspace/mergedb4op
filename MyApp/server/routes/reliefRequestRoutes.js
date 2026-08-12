const express = require("express");
const router = express.Router();
const controller = require("../controllers/reliefRequestController");
const { requireLogin } = require("../middleware/adminMiddleware");
const { uploadReleaseProofImages } = require("../middleware/upload");

router.get("/bootstrap", requireLogin, controller.getReliefRequestBootstrap);
router.get("/history", requireLogin, controller.getReliefRequestHistory);
router.get("/journey/current", requireLogin, controller.getCurrentReliefJourney);

router.post("/", requireLogin, controller.submitReliefRequest);
router.get("/mine", requireLogin, controller.getMyReliefRequests);
router.get("/mine/:id/export-pdf", requireLogin, controller.exportMyReliefRequestPdf);
router.get("/mine/:id", requireLogin, controller.getMyReliefRequestById);
router.put("/:id", requireLogin, controller.updateOwnReliefRequest);
router.put("/:id/cancel", requireLogin, controller.cancelOwnReliefRequest);
router.put(
  "/:id/received",
  requireLogin,
  uploadReleaseProofImages.array("receiptProofFiles", 5),
  controller.markReliefRequestReceived
);
router.put("/:id/not-received", requireLogin, controller.reportReliefRequestNotReceived);

module.exports = router;
