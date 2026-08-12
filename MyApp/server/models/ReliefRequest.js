const mongoose = require("mongoose");
const {
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPES,
  VALID_REQUEST_TYPES,
  deriveLegacyRequestType,
  getSupportTypesFromRequest,
  normalizeRequestType,
  normalizeSupportTypes,
} = require("../utils/reliefSupportTypes");

const requestRowSchema = new mongoose.Schema(
  {
    evacPlaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvacPlace",
      default: null,
    },

    evacuationCenterName: {
      type: String,
      required: true,
      trim: true,
    },

    households: {
      type: Number,
      default: 0,
      min: 0,
    },

    families: {
      type: Number,
      default: 0,
      min: 0,
    },

    male: {
      type: Number,
      default: 0,
      min: 0,
    },

    female: {
      type: Number,
      default: 0,
      min: 0,
    },

    lgbtq: {
      type: Number,
      default: 0,
      min: 0,
    },

    pwd: {
      type: Number,
      default: 0,
      min: 0,
    },

    pregnant: {
      type: Number,
      default: 0,
      min: 0,
    },

    senior: {
      type: Number,
      default: 0,
      min: 0,
    },

    requestedFoodPacks: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActiveRow: {
      type: Boolean,
      default: true,
    },
    rowRemarks: {
      type: String,
      default: "",
      trim: true,
    },

  },
  { _id: false }
);

const requestedApplianceSchema = new mongoose.Schema(
  {
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
    quantityRequested: {
      type: Number,
      default: 0,
      min: 0,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const reliefRequestSchema = new mongoose.Schema(
  {
    requestNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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

    disaster: {
      type: String,
      required: true,
      trim: true,
    },

    requestType: {
      type: String,
      enum: VALID_REQUEST_TYPES,
      default: SUPPORT_TYPE_FOODPACKS,
      trim: true,
      set: normalizeRequestType,
    },

    supportTypes: {
      type: [String],
      enum: SUPPORT_TYPES,
      default: [SUPPORT_TYPE_FOODPACKS],
    },

    requestDate: {
      type: Date,
      default: Date.now,
    },

    rows: {
      type: [requestRowSchema],
      default: [],
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one evacuation center row is required.",
      },
    },

    requestedAppliances: {
      type: [requestedApplianceSchema],
      default: [],
    },

    totals: {
      households: { type: Number, default: 0, min: 0 },
      families: { type: Number, default: 0, min: 0 },
      male: { type: Number, default: 0, min: 0 },
      female: { type: Number, default: 0, min: 0 },
      lgbtq: { type: Number, default: 0, min: 0 },
      pwd: { type: Number, default: 0, min: 0 },
      pregnant: { type: Number, default: 0, min: 0 },
      senior: { type: Number, default: 0, min: 0 },
      requestedFoodPacks: { type: Number, default: 0, min: 0 },
      requestedMonetaryAmount: { type: Number, default: 0, min: 0 },
      requestedApplianceQuantity: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "partially_released",
        "released",
        "received",
        "cancelled",
      ],
      default: "pending",
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    approvedBy: {
      type: String,
      default: "",
      trim: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: String,
      default: "",
      trim: true,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    releasedBy: {
      type: String,
      default: "",
      trim: true,
    },

    releasedAt: {
      type: Date,
      default: null,
    },

    receivedAt: {
      type: Date,
      default: null,
    },

    emailSent: {
      type: Boolean,
      default: false,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
    currentStage: {
      type: String,
      enum: [
    "preparation",
    "pending_review",
    "rejected",
    "approved_waiting_release",
    "partially_released",
    "released_waiting_receipt",
    "completed",
    "accomplished"
  ],
  default: "pending_review"
},

entryMode: {
  type: String,
  enum: ["manual", "excel_import", "system_bootstrap"],
  default: "system_bootstrap"
},

rowSource: {
  type: String,
  enum: ["evac_place_snapshot", "manual_override"],
  default: "evac_place_snapshot"
},

approvalRemarks: {
  type: String,
  default: "",
  trim: true,
},
releaseNotes: {
  type: String,
  default: "",
  trim: true,
},

isEditedAfterSubmit: {
  type: Boolean,
  default: false,
},

lastEditedAt: {
  type: Date,
  default: null,
},

editCount: {
  type: Number,
  default: 0,
  min: 0,
},

lastEditedBy: {
  type: String,
  default: "",
  trim: true,
},

lastEditAction: {
  type: String,
  enum: ["", "updated", "resubmitted"],
  default: "",
  trim: true,
},


fulfillment: {
  totalReleases: { type: Number, default: 0, min: 0 },
  releasedFoodPacks: { type: Number, default: 0, min: 0 },
  releasedApplianceQuantity: { type: Number, default: 0, min: 0 },
  releasedMonetaryAmount: { type: Number, default: 0, min: 0 },
  receivedApplianceQuantity: { type: Number, default: 0, min: 0 },
  receivedMonetaryAmount: { type: Number, default: 0, min: 0 },
  receivedReleases: { type: Number, default: 0, min: 0 },
  pendingReleases: { type: Number, default: 0, min: 0 },
  lastReleaseAt: { type: Date, default: null },
},

prioritySnapshot: {
  totalAffected: { type: Number, default: 0, min: 0 },
  vulnerableCount: { type: Number, default: 0, min: 0 },
  priorityScore: { type: Number, default: 0, min: 0 },
},

  },
  { timestamps: true }
);

reliefRequestSchema.pre("save", function () {
  const rows = this.rows || [];
  const activeRows = rows.filter((row) => row && row.isActiveRow !== false);
  const requestedMonetaryAmount = Number(this.totals?.requestedMonetaryAmount) || 0;
  const requestedAppliances = Array.isArray(this.requestedAppliances)
    ? this.requestedAppliances
        .map((item) => ({
          itemName: String(item?.itemName || "").trim(),
          category: String(item?.category || "").trim(),
          quantityRequested: Number(item?.quantityRequested || 0),
          remarks: String(item?.remarks || "").trim(),
        }))
        .filter((item) => item.itemName && item.category && item.quantityRequested > 0)
    : [];

  this.supportTypes = getSupportTypesFromRequest({
    supportTypes: this.supportTypes,
    requestType: this.requestType,
    rows: activeRows,
    requestedAppliances,
    totals: {
      requestedFoodPacks: activeRows.reduce(
        (sum, row) => sum + (Number(row.requestedFoodPacks) || 0),
        0
      ),
      requestedMonetaryAmount,
      requestedApplianceQuantity: requestedAppliances.reduce(
        (sum, item) => sum + (Number(item.quantityRequested) || 0),
        0
      ),
    },
  });
  this.requestType = deriveLegacyRequestType(this.supportTypes);
  this.requestedAppliances = requestedAppliances;

  this.totals = {
    households: activeRows.reduce((sum, row) => sum + (Number(row.households) || 0), 0),
    families: activeRows.reduce((sum, row) => sum + (Number(row.families) || 0), 0),
    male: activeRows.reduce((sum, row) => sum + (Number(row.male) || 0), 0),
    female: activeRows.reduce((sum, row) => sum + (Number(row.female) || 0), 0),
    lgbtq: activeRows.reduce((sum, row) => sum + (Number(row.lgbtq) || 0), 0),
    pwd: activeRows.reduce((sum, row) => sum + (Number(row.pwd) || 0), 0),
    pregnant: activeRows.reduce((sum, row) => sum + (Number(row.pregnant) || 0), 0),
    senior: activeRows.reduce((sum, row) => sum + (Number(row.senior) || 0), 0),
    requestedFoodPacks: activeRows.reduce(
      (sum, row) => sum + (Number(row.requestedFoodPacks) || 0),
      0
    ),
    requestedMonetaryAmount,
    requestedApplianceQuantity: requestedAppliances.reduce(
      (sum, item) => sum + (Number(item.quantityRequested) || 0),
      0
    ),
  };
});

module.exports = mongoose.model("ReliefRequest", reliefRequestSchema);
