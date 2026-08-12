import mongoose from "mongoose";

const waterLevelSchema = new mongoose.Schema(
  {
    // 📍 Camera / Device ID (indexed for speed)
    camera_id: {
      type: String,
      default: "cam_1",
      index: true,
    },

    // 🌊 Water data
    water_level: {
      type: Number,
      required: true,
    },

    warning_level: {
      type: Number,
      required: true,
    },

    danger_level: {
      type: Number,
      default: 10,
    },

    status: {
      type: String,
      enum: ["SAFE", "WARNING", "DANGER"],
      required: true,
      index: true,
    },

    // ⏱ Timestamp (indexed for fast sorting)
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

// 🚀 FAST QUERY INDEX (IMPORTANT for Unity + dashboards)
waterLevelSchema.index({ camera_id: 1, timestamp: -1 });

export default mongoose.model("WaterLevel", waterLevelSchema);