import mongoose from "mongoose";

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;

const waterLevelSchema = new mongoose.Schema(
  {
    water_level: {
      type: Number,
      required: true,
      min: 0,
    },

    warning_level: {
      type: Number,
      required: true,
      default: 8,
    },

    danger_level: {
      type: Number,
      required: true,
      default: 10,
    },

    status: {
      type: String,
      enum: ["SAFE", "WARNING", "DANGER"],
      required: true,
    },

    camera_id: {
      type: String,
      required: true,
      default: "cam_1",
      trim: true,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },

    received_at: {
      type: Date,
      default: Date.now,
    },

    expires_at: {
      type: Date,
      default: () => new Date(Date.now() + THIRTY_DAYS_IN_MS),
      index: {
        expireAfterSeconds: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Fast latest-reading lookup
waterLevelSchema.index({
  camera_id: 1,
  timestamp: -1,
});

// Auto-delete raw readings after expires_at
waterLevelSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model("WaterLevel", waterLevelSchema);
