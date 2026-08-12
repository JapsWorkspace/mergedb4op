const express = require("express");
const router = express.Router();

const YoloCommand = require("../models/YoloCommand");

const CAMERA_ID = "cam_1";

async function getOrCreateCommand(cameraId = CAMERA_ID) {
  let doc = await YoloCommand.findOne({ camera_id: cameraId });

  if (!doc) {
    doc = await YoloCommand.create({
      camera_id: cameraId,
      command: "NONE",
      desired_running: false,
      actual_running: false,
    });
  }

  return doc;
}

// Admin/frontend calls this
router.post("/start", async (req, res) => {
  try {
    const doc = await getOrCreateCommand();

    doc.command = "START";
    doc.desired_running = true;
    doc.message = "Start command requested by admin";
    await doc.save();

    res.json({
      success: true,
      message: "START command sent. Laptop B will pick it up shortly.",
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send START command",
      error: error.message,
    });
  }
});

// Admin/frontend calls this
router.post("/stop", async (req, res) => {
  try {
    const doc = await getOrCreateCommand();

    doc.command = "STOP";
    doc.desired_running = false;
    doc.message = "Stop command requested by admin";
    await doc.save();

    res.json({
      success: true,
      message: "STOP command sent. Laptop B will pick it up shortly.",
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send STOP command",
      error: error.message,
    });
  }
});

// Frontend calls this to display status
router.get("/status", async (req, res) => {
  try {
    const doc = await getOrCreateCommand();

    res.json({
      success: true,
      running: doc.actual_running,
      desired_running: doc.desired_running,
      command: doc.command,
      last_seen_at: doc.last_seen_at,
      last_started_at: doc.last_started_at,
      last_stopped_at: doc.last_stopped_at,
      message: doc.message,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get YOLO status",
      error: error.message,
    });
  }
});

// Laptop B yolo_agent.py calls this repeatedly
router.get("/command/:cameraId", async (req, res) => {
  try {
    const cameraId = req.params.cameraId || CAMERA_ID;
    const doc = await getOrCreateCommand(cameraId);

    doc.last_seen_at = new Date();
    await doc.save();

    res.json({
      success: true,
      camera_id: doc.camera_id,
      command: doc.command,
      desired_running: doc.desired_running,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get command",
      error: error.message,
    });
  }
});

// Laptop B yolo_agent.py calls this after it starts/stops YOLO
router.post("/agent-report", async (req, res) => {
  try {
    const {
      camera_id = CAMERA_ID,
      actual_running,
      command_handled,
      message = "",
    } = req.body;

    const doc = await getOrCreateCommand(camera_id);

    doc.actual_running = Boolean(actual_running);
    doc.last_seen_at = new Date();
    doc.message = message;

    if (command_handled === "START") {
      doc.command = "NONE";
      doc.last_started_at = new Date();
    }

    if (command_handled === "STOP") {
      doc.command = "NONE";
      doc.last_stopped_at = new Date();
    }

    await doc.save();

    res.json({
      success: true,
      message: "Agent report saved",
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to save agent report",
      error: error.message,
    });
  }
});

module.exports = router;
