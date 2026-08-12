const express = require("express");
const router = express.Router();
const foodPackController = require("../controllers/foodPackController");

router.post("/", foodPackController.createFoodPackTemplate);
router.get("/", foodPackController.getFoodPackTemplates);
router.get("/:id", foodPackController.getFoodPackTemplateById);
router.put("/:id", foodPackController.updateFoodPackTemplate);
router.delete("/:id", foodPackController.archiveFoodPackTemplate);
router.get("/:id/preview", foodPackController.previewFoodPackTemplateRelease);

module.exports = router;