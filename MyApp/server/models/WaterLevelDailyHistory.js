import mongoose from "mongoose";

const waterLevelDailyHistorySchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
    },

    camera_id: {
      type: String,
      required: true,
      default: "cam_1",
      trim: true,
    },

    minimum_level: {
      type: Number,
      required: true,
      default: 0,
    },

    maximum_level: {
      type: Number,
      required: true,
      default: 0,
    },

    total_level: {
      type: Number,
      required: true,
      default: 0,
    },

    reading_count: {
      type: Number,
      required: true,
      default: 0,
    },

    safe_count: {
      type: Number,
      required: true,
      default: 0,
    },

    warning_count: {
      type: Number,
      required: true,
      default: 0,
    },

    danger_count: {
      type: Number,
      required: true,
      default: 0,
    },

    latest_level: {
      type: Number,
      required: true,
      default: 0,
    },

    latest_status: {
      type: String,
      enum: ["SAFE", "WARNING", "DANGER"],
      required: true,
      default: "SAFE",
    },

    latest_timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Only one summary per camera per day
waterLevelDailyHistorySchema.index(
  {
    camera_id: 1,
    date: 1,
  },
  {
    unique: true,
  }
);

// Fast history and analytics lookup
waterLevelDailyHistorySchema.index({
  camera_id: 1,
  date: -1,
});

export default mongoose.model(
  "WaterLevelDailyHistory",
  waterLevelDailyHistorySchema
);
