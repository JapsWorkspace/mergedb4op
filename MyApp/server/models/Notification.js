const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipientRole: {
      type: String,
      enum: ["admin", "drrmo", "barangay", "accountant", "all"],
      required: true,
      lowercase: true,
      trim: true,
    },

    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "recipientUserModel",
      default: null,
    },

    recipientUserModel: {
      type: String,
      enum: ["User", "UserStaff", "Barangay", null],
      default: null,
    },

    recipientBarangay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      default: null,
    },

    recipientBarangayName: {
      type: String,
      default: "",
      trim: true,
    },

    senderUser: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    senderRole: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    senderName: {
      type: String,
      default: "",
      trim: true,
    },

    module: {
      type: String,
      enum: [
        "relief",
        "inventory",
        "donation",
        "announcement",
        "incident",
        "evacuation",
        "guidelines",
        "account",
        "analytics",
        "system",
      ],
      default: "system",
      lowercase: true,
      trim: true,
    },

    type: {
      type: String,
      default: "general",
      lowercase: true,
      trim: true,
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
      lowercase: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 800,
    },

    link: {
      type: String,
      default: "",
      trim: true,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    referenceModel: {
      type: String,
      default: "",
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        role: {
          type: String,
          default: "",
          lowercase: true,
          trim: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    archivedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        role: {
          type: String,
          default: "",
          lowercase: true,
          trim: true,
        },
        archivedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ recipientRole: 1, createdAt: -1 });
NotificationSchema.index({ recipientUser: 1, createdAt: -1 });
NotificationSchema.index({ recipientBarangay: 1, createdAt: -1 });
NotificationSchema.index({ module: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
