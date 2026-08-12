const express = require("express");
const router = express.Router();

const safetyMarkingController = require("../controllers/safetyMarkingController");

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    routes: [
      "GET /api/safety-marking/debug-locations",
      "POST /api/safety-marking/debug-location",
      "PATCH /api/safety-marking/status",
      "PATCH /api/safety-marking/debug-location/off",
      "DELETE /api/safety-marking/debug-location/:userId",
    ],
  });
});

router.get("/debug-locations", safetyMarkingController.getDebugLocations);
router.post("/debug-location", safetyMarkingController.upsertDebugLocation);
router.patch("/status", safetyMarkingController.updateSafetyStatus);
router.patch("/debug-location/off", safetyMarkingController.turnOffDebugLocation);
router.delete("/debug-location/:userId", safetyMarkingController.turnOffDebugLocation);

module.exports = router;
