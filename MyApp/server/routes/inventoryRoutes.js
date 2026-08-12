const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");
const { uploadProof } = require("../middleware/upload");
const { requireLogin, requireAdminOrDrrmo } = require("../middleware/adminMiddleware");

router.get("/categories", inventoryController.getInventoryCategories);

// =========================
// ANALYTICS
// =========================
router.get("/analytics/summary", inventoryController.getInventorySummary);
router.get("/analytics/category-stats", inventoryController.getInventoryCategoryStats);
router.get("/analytics/source-stats", inventoryController.getInventorySourceStats);
router.get("/analytics/recent-trend", inventoryController.getInventoryRecentTrend);
router.get("/analytics/health", inventoryController.getInventoryHealth);
router.get("/analytics/top-donors", inventoryController.getTopDonors);
router.get("/analytics/donation-activity", inventoryController.getDonationActivity);
router.get("/analytics/ai-insights", inventoryController.getInventoryAiInsights);
router.get("/analytics/donation-ai-insights", inventoryController.getDonationAiInsights);

// =========================
// EXPORT
// =========================
router.get(
  "/export-pdf",
  requireLogin,
  requireAdminOrDrrmo,
  inventoryController.exportInventoryPdf
);

router.get(
  "/proof-preview",
  requireLogin,
  requireAdminOrDrrmo,
  inventoryController.previewInventoryProof
);

router.get(
  "/proof-file/:id",
  requireLogin,
  requireAdminOrDrrmo,
  inventoryController.streamInventoryProofFile
);

router.get(
  "/proof-file/:id/:filename",
  requireLogin,
  requireAdminOrDrrmo,
  inventoryController.streamInventoryProofFile
);

// =========================
// INVENTORY CRUD
// =========================
router.post(
  "/",
  requireLogin,
  requireAdminOrDrrmo,
  uploadProof.array("proofFiles", 5),
  inventoryController.addInventory
);

router.get("/", requireAdminOrDrrmo, inventoryController.getInventory);

router.get("/archived", requireAdminOrDrrmo, inventoryController.getArchivedInventory);

router.put("/archived/:id/restore", requireAdminOrDrrmo, inventoryController.unarchiveInventory);

router.delete("/archived/:id/permanent", requireAdminOrDrrmo, inventoryController.permanentDeleteInventory);

router.put(
  "/:id",
  requireLogin,
  requireAdminOrDrrmo,
  uploadProof.array("proofFiles", 5),
  inventoryController.updateInventory
);

router.delete("/:id", requireLogin, requireAdminOrDrrmo, inventoryController.deleteInventory);

module.exports = router;
