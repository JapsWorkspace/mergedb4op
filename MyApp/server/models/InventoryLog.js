const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },

    itemName: {
      type: String,
      required: true,
      trim: true
    },

    itemType: {
      type: String,
      enum: ['goods', 'monetary', 'appliance'],
      required: true
    },

    action: {
      type: String,
      enum: ['create', 'update', 'archive', 'release'],
      required: true
    },

    quantity: {
      type: Number,
      default: undefined
    },

    amount: {
      type: Number,
      default: undefined
    },

    performedBy: {
      type: String,
      default: '',
      trim: true
    },

    remarks: {
      type: String,
      default: '',
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
