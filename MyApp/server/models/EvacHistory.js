const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["ADD", "UPDATE", "STATUS_UPDATE", "DELETE", "ALLOCATE"],
      required: true,
      trim: true,
    },

    placeName: {
      type: String,
      required: true,
      trim: true,
    },

    details: {
      type: String,
      default: "",
      trim: true,
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

    performedBy: {
      type: String,
      default: "",
      trim: true,
    },

    performedByRole: {
      type: String,
      enum: ["admin", "drrmo", "barangay", ""],
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EHistory", notificationSchema);
