const mongoose = require("mongoose");

const safetyDebugLocationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      default: "User",
      trim: true,
      maxlength: 80,
    },
    avatar: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    safetyStatus: {
      type: String,
      enum: ["SAFE", "NOT_SAFE", "UNKNOWN"],
      default: "SAFE",
      index: true,
    },
    debugMode: {
      type: Boolean,
      default: true,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

safetyDebugLocationSchema.index({ debugMode: 1, updatedAt: -1 });

module.exports = mongoose.model("SafetyDebugLocation", safetyDebugLocationSchema);
