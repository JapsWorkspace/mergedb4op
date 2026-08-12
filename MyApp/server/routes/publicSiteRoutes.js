const express = require("express");
const router = express.Router();

const controller = require("../controllers/publicSiteController");
const {
  requireLogin,
  requireAdminOrDrrmo,
} = require("../middleware/adminMiddleware");
const { uploadPublicSiteImage } = require("../middleware/upload");

/* =========================
   PUBLIC
========================= */

router.get("/", controller.getPublicSite);

/* =========================
   ADMIN / DRRMO EDIT
========================= */

router.put(
  "/",
  requireLogin,
  requireAdminOrDrrmo,
  controller.updatePublicSite
);

router.put(
  "/reset",
  requireLogin,
  requireAdminOrDrrmo,
  controller.resetPublicSite
);

router.put(
  "/incident-feed-mode",
  requireLogin,
  requireAdminOrDrrmo,
  controller.updateIncidentFeedMode
);

router.post(
  "/hero-images",
  requireLogin,
  requireAdminOrDrrmo,
  uploadPublicSiteImage.single("image"),
  controller.uploadPublicSiteHeroImage
);

router.delete(
  "/hero-images/:imageId",
  requireLogin,
  requireAdminOrDrrmo,
  controller.removePublicSiteHeroImage
);

router.put(
  "/hero-images/reorder",
  requireLogin,
  requireAdminOrDrrmo,
  controller.reorderPublicSiteHeroImages
);

router.put(
  "/hero-images/:imageId",
  requireLogin,
  requireAdminOrDrrmo,
  controller.updatePublicSiteHeroImageCaption
);

module.exports = router;
