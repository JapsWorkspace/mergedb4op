const express = require("express");
const router = express.Router();
const incidentController = require("../controllers/incidentController");
const { uploadIncidentImage } = require("../middleware/upload");

// ✅ Get all incidents
router.get("/getIncidents", incidentController.getIncidents);
router.get("/history", incidentController.getIncidentHistory);
router.get("/stats", incidentController.getIncidentStats);
router.get("/typeStats", incidentController.getIncidentTypeStats);
router.get("/trend", incidentController.getTrend);

// ✅ Export single incident PDF
router.get("/export-pdf/:id", incidentController.exportIncidentPdf);

// ✅ Admin verification override
router.put("/updateVerification/:id", incidentController.updateVerification);

// ✅ Re-run AI verification
router.put("/reverify/:id", incidentController.reverifyIncident);

// ✅ Register incident (single image) + prevent undefined body
router.post(
  "/register",
  (req, res, next) => {
    if (!req.body) req.body = {};
    next();
  },
  (req, res, next) => {
    uploadIncidentImage.fields([
      { name: "image", maxCount: 1 },
      { name: "images", maxCount: 2 },
    ])(req, res, (err) => {
      if (err) {
        console.error("INCIDENT IMAGE UPLOAD ERROR:", {
          message: err.message,
          code: err.code,
          field: err.field,
          name: err.name,
        });

        return res.status(400).json({
          message: err.message || "Incident image upload failed.",
          code: err.code || null,
          field: err.field || null,
        });
      }

      console.log("INCIDENT UPLOAD OK:", {
        body: req.body,
        files: req.files || null,
      });

      next();
    });
  },
  incidentController.registerIncident
);

// ✅ Update status
router.put("/updateStatus/:id", incidentController.updateStatus);
router.put("/aiStatus/:id", incidentController.updateAIStatus);
router.put("/updateVerification/:id", incidentController.updateVerification);
router.put("/forceApprove/:id", incidentController.forceApproveIncident);
router.put("/reverify/:id", incidentController.reverifyIncident);

// ✅ Delete incident
router.delete("/delete/:id", incidentController.deleteIncident);

module.exports = router;
