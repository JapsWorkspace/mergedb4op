const mongoose = require("mongoose");

const donationNeedSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        "clothes",
        "food",
        "appliances",
        "furniture",
        "medicine",
        "essentials",
        "other",
      ],
      required: true,
      index: true,
    },
    itemName: { type: String, default: "", trim: true },
    quantityNeeded: { type: Number, default: 0, min: 0 },
    quantityFulfilled: { type: Number, default: 0, min: 0 },
    urgency: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["evacuation_center", "barangay"],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    targetName: { type: String, required: true, trim: true },
    barangay: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

donationNeedSchema.virtual("remainingQuantity").get(function () {
  return Math.max(0, (this.quantityNeeded || 0) - (this.quantityFulfilled || 0));
});

donationNeedSchema.set("toJSON", { virtuals: true });
donationNeedSchema.set("toObject", { virtuals: true });
donationNeedSchema.index({ category: 1, barangay: 1, urgency: 1, isActive: 1 });

module.exports = mongoose.model("DonationNeed", donationNeedSchema);
