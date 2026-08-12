const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['goods', 'monetary', 'appliance'],
      required: true,
      default: 'goods',
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: function () {
        return this.type === 'goods' || this.type === 'appliance';
      },
      trim: true
    },

    quantity: {
      type: Number,
      required: function () {
        return this.type === 'goods' || this.type === 'appliance';
      },
      min: 0
    },

    unit: {
      type: String,
      required: function () {
        return this.type === 'goods';
      },
      trim: true
    },

    amount: {
      type: Number,
      required: function () {
        return this.type === 'monetary';
      },
      min: 0
    },

    referenceNumber: {
      type: String,
      trim: true,
      default: undefined
    },

    expirationDate: {
      type: Date,
      default: undefined
    },

    requiresExpiration: {
      type: Boolean,
      default: undefined
    },

    condition: {
      type: String,
      enum: ['brand_new', 'used_item'],
      required: function () {
        return this.type === 'appliance';
      },
      trim: true
    },

    usageDuration: {
      type: String,
      required: function () {
        return this.type === 'appliance' && this.condition === 'used_item';
      },
      trim: true,
      default: undefined
    },

    description: {
      type: String,
      trim: true,
      default: ''
    },

    sourceType: {
      type: String,
      enum: ['external', 'government', 'internal'],
      default: 'external',
      trim: true
    },

    sourceName: {
      type: String,
      trim: true,
      default: ''
    },

    proofFiles: {
      type: [String],
      default: []
    },

    addedBy: {
      type: String,
      trim: true,
      default: ''
    },

    isArchive: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Normalize fields before saving
inventoryItemSchema.pre('validate', function () {
  if (this.category) {
    this.category = this.category.toLowerCase().trim();
  }

  if (this.type === 'goods') {
    this.amount = undefined;
    this.referenceNumber = undefined;
    this.condition = undefined;
    this.usageDuration = undefined;
  }

  if (this.type === 'monetary') {
    this.category = undefined;
    this.quantity = undefined;
    this.unit = undefined;
    this.expirationDate = undefined;
    this.requiresExpiration = undefined;
    this.condition = undefined;
    this.usageDuration = undefined;
  }

  if (this.type === 'appliance') {
    this.amount = undefined;
    this.referenceNumber = undefined;
    this.unit = undefined;
    this.expirationDate = undefined;
    this.requiresExpiration = undefined;

    if (this.condition === 'brand_new') {
      this.usageDuration = undefined;
    }
  }
});

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
