const express = require("express");
const controller = require("../controllers/AnnouncementController");
const { uploadAnnouncement } = require("../middleware/upload");

const router = express.Router();

router.post("/", uploadAnnouncement.array("attachments"), controller.createAnnouncement);
router.get("/", controller.getAnnouncements);
router.get("/published/export-pdf", controller.exportPublishedAnnouncementsPdf);
router.get("/:id", controller.getAnnouncementById);
router.post("/:id/view", controller.incrementViews);
router.post("/:id/like", controller.toggleLike);
router.put("/:id", uploadAnnouncement.array("attachments"), controller.updateAnnouncement);
router.delete("/:id", controller.deleteAnnouncement);

module.exports = router;
