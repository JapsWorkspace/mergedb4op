const mongoose = require("mongoose");

const inventoryProofFileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryProofFile", inventoryProofFileSchema);
