const mongoose = require("mongoose");

const foodPackTemplateItemSchema = new mongoose.Schema(
  {
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
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

    quantityPerPack: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      required: true,
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

const foodPackTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    items: {
      type: [foodPackTemplateItemSchema],
      default: [],
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one item is required in a food pack template.",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

foodPackTemplateSchema.pre("validate", function () {
  const items = this.items || [];

  this.items = items.map((item) => {
    const normalizedItem = { ...(item.toObject?.() ? item.toObject() : item) };

    if (normalizedItem.itemName) {
      normalizedItem.itemName = String(normalizedItem.itemName).trim();
    }

    if (normalizedItem.category) {
      normalizedItem.category = String(normalizedItem.category).toLowerCase().trim();
    }

    if (normalizedItem.unit) {
      normalizedItem.unit = String(normalizedItem.unit).trim();
    }

    if (normalizedItem.remarks) {
      normalizedItem.remarks = String(normalizedItem.remarks).trim();
    }

    normalizedItem.quantityPerPack = Number(normalizedItem.quantityPerPack || 0);

    return normalizedItem;
  });
});

module.exports = mongoose.model("FoodPackTemplate", foodPackTemplateSchema);