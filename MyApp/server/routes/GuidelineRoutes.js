const express = require("express");
const router = express.Router();
const controller = require("../controllers/GuidelineController");
const { uploadGuideline } = require("../middleware/upload");

// specific routes first
router.get("/published", controller.getPublishedGuidelines);
router.get("/published/export-pdf", controller.exportPublishedGuidelinesPdf);
router.patch("/view/:id", controller.incrementViews);
router.post("/:id/view", controller.incrementViews);
router.post("/:id/like", controller.toggleLike);
router.patch("/soft-delete/:id", controller.archiveGuideline);
router.patch("/restore/:id", controller.restoreGuideline);

// main CRUD
router.post("/", uploadGuideline.array("attachments"), controller.createGuideline);
router.get("/", controller.getGuidelines);
router.get("/:id", controller.getGuidelineById);
router.put("/:id", uploadGuideline.array("attachments"), controller.updateGuideline);
router.delete("/:id", controller.deleteGuideline);

module.exports = router;
