const mongoose = require("mongoose");

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["ADD", "UPDATE", "STATUS_UPDATE", "AI_STATUS_UPDATE", "MDRRMO_APPROVAL", "MDRRMO_FORCE_APPROVE", "DELETE", "ALLOCATE"],
      required: true,
    },
    placeName: {
      type: String,
      required: true,
    },
    details: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

const HistoryModel = mongoose.model('History', historySchema);
module.exports = HistoryModel;
