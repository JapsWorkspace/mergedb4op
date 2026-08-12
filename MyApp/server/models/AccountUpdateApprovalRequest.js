const mongoose = require("mongoose");

const accountUpdateApprovalRequestSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    accountModel: {
      type: String,
      enum: ["UserStaff", "Barangay"],
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["drrmo", "barangay", "accountant"],
      required: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    currentUsername: {
      type: String,
      required: true,
      trim: true,
    },
    pendingUsername: {
      type: String,
      required: true,
      trim: true,
    },
    pendingPhoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    pendingHotline: {
      type: String,
      default: "",
      trim: true,
    },
    pendingAddress: {
      type: String,
      required: true,
      trim: true,
    },
    pendingPasswordHash: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "expired", "cancelled"],
      default: "pending",
      trim: true,
      lowercase: true,
    },
    approvalTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    approvalExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedByEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    requestedBy: {
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      adminUsername: {
        type: String,
        default: "",
        trim: true,
      },
      adminRole: {
        type: String,
        default: "admin",
        trim: true,
        lowercase: true,
      },
    },
  },
  { timestamps: true }
);

accountUpdateApprovalRequestSchema.index(
  { accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

module.exports = mongoose.model(
  "AccountUpdateApprovalRequest",
  accountUpdateApprovalRequestSchema
);
