const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      default: "system",
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      default: "general",
      trim: true,
      lowercase: true,
    },
    priority: {
      type: String,
      default: "normal",
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    actorId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    actorName: {
      type: String,
      default: "",
      trim: true,
    },
    actorRole: {
      type: String,
      default: "system",
      trim: true,
      lowercase: true,
    },
    recipientRole: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    barangayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      default: null,
    },
    barangayName: {
      type: String,
      default: "",
      trim: true,
    },
    requestNo: {
      type: String,
      default: "",
      trim: true,
    },
    releaseNo: {
      type: String,
      default: "",
      trim: true,
    },
    disaster: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    referenceModel: {
      type: String,
      default: "",
      trim: true,
    },
    targetLabel: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Legacy fields kept for backward compatibility with existing records.
    category: {
      type: String,
      default: "",
      trim: true,
    },
    peopleRange: {
      type: String,
      default: "",
      trim: true,
    },
    actionBy: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    actionAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ actionAt: -1 });
auditSchema.index({ module: 1, createdAt: -1 });
auditSchema.index({ actorRole: 1, createdAt: -1 });
auditSchema.index({ requestNo: 1, releaseNo: 1 });

module.exports = mongoose.model("Audit", auditSchema);
