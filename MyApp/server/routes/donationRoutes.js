const express = require("express");
const router = express.Router();
const donationController = require("../controllers/donationController");
const { uploadDonationPhotos } = require("../middleware/upload");
const { requireLogin, requireAdminOrDrrmo } = require("../middleware/adminMiddleware");

router.post(
  "/",
  (req, res, next) => {
    uploadDonationPhotos.array("photos", 4)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || "Donation photo upload failed.",
          code: err.code || null,
        });
      }
      next();
    });
  },
  donationController.createDonation
);

router.get("/", donationController.getDonations);
router.get("/my-donations/:userId", donationController.getMyDonations);
router.get("/needs", donationController.getNeeds);
router.post("/needs", donationController.createNeed);
router.get("/:id", donationController.getDonationById);
router.get("/:id/matches", donationController.getMatches);
router.put("/:id/status", requireLogin, requireAdminOrDrrmo, donationController.updateDonationStatus);
router.put(
  "/:id/resubmit",
  (req, res, next) => {
    uploadDonationPhotos.array("photos", 4)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || "Donation photo upload failed.",
          code: err.code || null,
        });
      }
      next();
    });
  },
  donationController.resubmitDonation
);
router.put("/:id/assign", donationController.assignDonation);

module.exports = router;
