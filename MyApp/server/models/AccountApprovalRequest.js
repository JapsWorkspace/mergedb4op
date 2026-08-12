const mongoose = require("mongoose");

const BARANGAY_OPTIONS = [
  "Calabasa",
  "Don Mariano Marcos",
  "Dampulan",
  "Hilera",
  "Imbunia",
  "Lambakin",
  "Langla",
  "Magsalisi",
  "Malabon Kaingin",
  "Marawa",
  "Niyugan",
  "Pamacpacan",
  "Pakol",
  "Pinanggaan",
  "Putlod",
  "San Jose",
  "San Josef (Nabao)",
  "San Pablo",
  "San Roque",
  "San Vicente",
  "Santa Rita",
  "Sapang",
  "Santo Tomas North",
  "Santo Tomas South",
  "Ulanin Pitak",
];

const accountApprovalRequestSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["drrmo", "barangay", "accountant"],
      required: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    barangayName: {
      type: String,
      trim: true,
      enum: BARANGAY_OPTIONS,
      default: null,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    hotline: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
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
    createdAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdAccountModel: {
      type: String,
      default: "",
      trim: true,
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

accountApprovalRequestSchema.index(
  { email: 1 },
  { partialFilterExpression: { status: "pending" } }
);

accountApprovalRequestSchema.index(
  { barangayName: 1 },
  {
    partialFilterExpression: {
      status: "pending",
      role: "barangay",
      barangayName: { $type: "string" },
    },
  }
);

module.exports = mongoose.model(
  "AccountApprovalRequest",
  accountApprovalRequestSchema
);
