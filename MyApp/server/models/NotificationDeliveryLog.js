const mongoose = require("mongoose");

const notificationDeliveryLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    referenceId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: ["sms", "email", "inapp"],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["unisms", "philsms", "smtp", "app"],
      required: true,
    },
    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
      index: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    errorMessage: {
      type: String,
      default: "",
      trim: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports =
  mongoose.models.NotificationDeliveryLog ||
  mongoose.model("NotificationDeliveryLog", notificationDeliveryLogSchema);
