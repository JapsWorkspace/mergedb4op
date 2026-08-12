import express from "express";
import {
  createWaterLevel,
  getWaterLevels,
  getLatestWaterLevel,
  getWaterLevelHistoryByCamera,
} from "../controllers/waterLevelController.js";

const router = express.Router();

router.post("/", createWaterLevel);
router.get("/", getWaterLevels);
router.get("/latest/:camera_id", getLatestWaterLevel);
router.get("/history/:camera_id", getWaterLevelHistoryByCamera);

export default router;
