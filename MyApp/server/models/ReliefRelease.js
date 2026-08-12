const mongoose = require("mongoose");
const {
  SUPPORT_TYPE_FOODPACKS,
  VALID_REQUEST_TYPES,
  normalizeRequestType,
} = require("../utils/reliefSupportTypes");

const releaseItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ["goods", "appliance"],
      default: "goods",
      trim: true,
    },
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      default: null,
    },

    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    quantityReleased: {
      type: Number,
      default: 0,
      min: 0,
    },

    quantityReceived: {
      type: Number,
      default: 0,
      min: 0,
    },

    unit: {
      type: String,
      default: "",
      trim: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const reliefReleaseSchema = new mongoose.Schema(
  {
    reliefRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReliefRequest",
      required: true,
    },

    barangayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    barangayName: {
      type: String,
      required: true,
      trim: true,
    },

    releaseNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    requestType: {
      type: String,
      enum: VALID_REQUEST_TYPES,
      default: SUPPORT_TYPE_FOODPACKS,
      trim: true,
      set: normalizeRequestType,
    },

    releaseMode: {
      type: String,
      enum: ["manual", "template"],
      default: "manual",
    },

    foodPackTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodPackTemplate",
      default: null,
    },

    foodPackTemplateName: {
      type: String,
      default: "",
      trim: true,
    },

    foodPacksReleased: {
      type: Number,
      default: 0,
      min: 0,
    },

    releasedMonetaryAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    receivedMonetaryAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    items: {
      type: [releaseItemSchema],
      default: [],
      validate: {
        validator: function (value) {
          return (
            (Array.isArray(value) && value.length > 0) ||
            Number(this.releasedMonetaryAmount || 0) > 0
          );
        },
        message: "At least one released item or a released monetary amount is required.",
      },
    },

    totalItemsReleased: {
      type: Number,
      default: 0,
      min: 0,
    },

    releaseStatus: {
      type: String,
      enum: ["draft", "released", "received", "cancelled"],
      default: "released",
    },

    releasedBy: {
      type: String,
      required: true,
      trim: true,
    },

    releasedAt: {
      type: Date,
      default: Date.now,
    },

    receivedAt: {
      type: Date,
      default: null,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    proofFiles: {
      type: [String],
      default: [],
    },

    receiptProofFiles: {
      type: [String],
      default: [],
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    isFinalRelease: {
      type: Boolean,
      default: false,
    },
    receivedBy: {
  type: String,
  default: "",
  trim: true,
},
releaseSummary: {
  totalLineItems: { type: Number, default: 0, min: 0 },
  totalQuantityReleased: { type: Number, default: 0, min: 0 },
  totalMonetaryReleased: { type: Number, default: 0, min: 0 },
},

  },
  { timestamps: true }
);

reliefReleaseSchema.pre("validate", function () {
  const items = this.items || [];

  this.items = items.map((item) => {
    const normalizedItem = { ...(item.toObject?.() ? item.toObject() : item) };

    normalizedItem.itemType =
      String(normalizedItem.itemType || "goods").trim().toLowerCase() === "appliance"
        ? "appliance"
        : "goods";

    if (normalizedItem.category) {
      normalizedItem.category = String(normalizedItem.category).toLowerCase().trim();
    }

    if (normalizedItem.itemName) {
      normalizedItem.itemName = String(normalizedItem.itemName).trim();
    }

    if (normalizedItem.unit) {
      normalizedItem.unit = String(normalizedItem.unit).trim();
    }

    if (normalizedItem.remarks) {
      normalizedItem.remarks = String(normalizedItem.remarks).trim();
    }

    return normalizedItem;
  });

  if (this.foodPackTemplateName) {
    this.foodPackTemplateName = String(this.foodPackTemplateName).trim();
  }

  this.requestType = normalizeRequestType(this.requestType);

  if (this.remarks) {
    this.remarks = String(this.remarks).trim();
  }

  this.proofFiles = Array.isArray(this.proofFiles)
    ? this.proofFiles
        .map((file) => String(file || "").trim())
        .filter(Boolean)
    : [];

  this.receiptProofFiles = Array.isArray(this.receiptProofFiles)
    ? this.receiptProofFiles
        .map((file) => String(file || "").trim())
        .filter(Boolean)
    : [];
});

reliefReleaseSchema.pre("save", function () {
  const items = this.items || [];

  const totalQuantityReleased = items.reduce(
    (sum, item) => sum + (Number(item.quantityReleased) || 0),
    0
  );
  const totalMonetaryReleased = Number(this.releasedMonetaryAmount || 0);

  this.totalItemsReleased = totalQuantityReleased;

  this.releaseSummary = {
    totalLineItems: items.length,
    totalQuantityReleased,
    totalMonetaryReleased,
  };
});

module.exports = mongoose.model("ReliefRelease", reliefReleaseSchema);
