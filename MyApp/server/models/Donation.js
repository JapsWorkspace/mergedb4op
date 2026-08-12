const mongoose = require("mongoose");

const donationPhotoSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "", trim: true },
    fileUrl: { type: String, default: "", trim: true },
    public_id: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ["evacuation_center", "barangay", "general"],
      default: "general",
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    targetName: { type: String, default: "", trim: true },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserStaff",
      default: null,
    },
    assignedAt: { type: Date, default: null },
    notes: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const donationSchema = new mongoose.Schema(
  {
    inventoryType: {
      type: String,
      enum: ["goods", "monetary", "appliance"],
      default: "goods",
      index: true,
    },
    donationType: {
      type: String,
      enum: ["monetary", "non_monetary"],
      required: true,
      index: true,
    },
    category: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    itemName: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "pcs", trim: true },
    description: { type: String, default: "", trim: true },
    amount: { type: Number, default: 0, min: 0 },
    sourceType: {
      type: String,
      enum: ["external", "government", "internal"],
      default: "external",
      trim: true,
      lowercase: true,
    },
    condition: {
      type: String,
      enum: ["brand_new", "used_item", ""],
      default: "",
      trim: true,
    },
    usageDuration: { type: String, default: "", trim: true },
    expirationDate: { type: Date, default: null },
    requiresExpiration: { type: Boolean, default: false },
    paymentMethod: { type: String, default: "", trim: true },
    referenceNumber: { type: String, default: "", trim: true },
    normalizedReferenceNumber: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },
    referenceLocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    gcashReferenceNumber: { type: String, default: "", trim: true },
    gcashSender: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    bankAccountNumber: { type: String, default: "", trim: true },
    transferReferenceNumber: { type: String, default: "", trim: true },
    cashInstructions: { type: String, default: "", trim: true },
    donorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    donorName: { type: String, default: "", trim: true },
    donorPhone: { type: String, default: "", trim: true },
    donorEmail: { type: String, default: "", trim: true, lowercase: true },
    contactInfo: { type: String, default: "", trim: true },
    fulfillmentMethod: {
      type: String,
      enum: ["pickup", "drop_off"],
      default: "drop_off",
    },
    location: { type: String, default: "", trim: true, index: true },
    barangay: { type: String, default: "", trim: true, index: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    photos: { type: [donationPhotoSchema], default: [] },
    status: {
      type: String,
      enum: [
        "pending",
        "received",
        "not_received",
        "resubmitted",
        "accepted",
        "in_transit",
        "delivered",
        "rejected",
      ],
      default: "pending",
      index: true,
    },
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      default: null,
    },
    receivedBy: { type: String, default: "", trim: true },
    receivedAt: { type: Date, default: null },
    notReceivedBy: { type: String, default: "", trim: true },
    notReceivedAt: { type: Date, default: null },
    wasResubmitted: { type: Boolean, default: false },
    resubmissionCount: { type: Number, default: 0, min: 0 },
    lastResubmittedAt: { type: Date, default: null },
    assignment: { type: assignmentSchema, default: () => ({}) },
    matchedNeedIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DonationNeed",
      },
    ],
    adminNotes: { type: String, default: "", trim: true },
    history: {
      type: [
        {
          status: String,
          message: String,
          createdAt: { type: Date, default: Date.now },
          actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

donationSchema.pre("validate", function () {
  const inventoryType = String(this.inventoryType || "").trim().toLowerCase();
  const category = String(this.category || "").trim().toLowerCase();
  const donationType = String(this.donationType || "").trim().toLowerCase();
  const referenceNumber = String(
    this.referenceNumber ||
      this.gcashReferenceNumber ||
      this.transferReferenceNumber ||
      ""
  )
    .trim()
    .toLowerCase();
  this.normalizedReferenceNumber = referenceNumber;
  const paymentMethod = String(this.paymentMethod || "").trim().toLowerCase();
  const amount = Number(this.amount || 0);
  const quantity = Number(this.quantity || 0);

  if (
    donationType === "monetary" ||
    category === "money" ||
    (amount > 0 && quantity <= 0) ||
    Boolean(referenceNumber) ||
    ["gcash", "bank_transfer", "bank", "cash"].includes(paymentMethod)
  ) {
    this.inventoryType = "monetary";
  } else if (
    category.includes("appliance") ||
    ["brand_new", "used_item"].includes(String(this.condition || "").trim().toLowerCase()) ||
    String(this.usageDuration || "").trim()
  ) {
    this.inventoryType = "appliance";
  } else if (!inventoryType) {
    this.inventoryType = "goods";
  }

  if (this.inventoryType === "monetary") {
    this.donationType = "monetary";
    this.category = "money";
    this.quantity = 0;
    this.unit = "";
    this.condition = "";
    this.usageDuration = "";
    this.expirationDate = null;
    this.requiresExpiration = false;
  } else {
    this.donationType = "non_monetary";
    this.amount = 0;
  }

  if (this.inventoryType !== "appliance") {
    this.condition = "";
    this.usageDuration = "";
  }

  if (this.inventoryType === "appliance" && this.condition === "brand_new") {
    this.usageDuration = "";
  }

});

donationSchema.index({ donationType: 1, category: 1, status: 1, barangay: 1 });
donationSchema.index({ inventoryType: 1, status: 1, barangay: 1 });
donationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Donation", donationSchema);
