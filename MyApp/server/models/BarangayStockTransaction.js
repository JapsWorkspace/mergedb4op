const mongoose = require("mongoose");

const barangayStockTransactionSchema = new mongoose.Schema(
  {
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

    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BarangayStock",
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

    unit: {
      type: String,
      default: "",
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    transactionType: {
      type: String,
      enum: [
        "release_in",         // from DRRMO
        "distribution",       // given to people
        "allocation",         // assigned to evac place
        "return",             // returned to storage
        "adjustment_add",     // manual increase
        "adjustment_deduct",  // manual decrease
      ],
      required: true,
    },

    reliefReleaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReliefRelease",
      default: null,
    },

    evacPlaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvacPlace",
      default: null,
    },

    evacPlaceName: {
      type: String,
      default: "",
      trim: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    performedBy: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "BarangayStockTransaction",
  barangayStockTransactionSchema
);