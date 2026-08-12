const mongoose = require('mongoose');

const mrcSchema = new mongoose.Schema({

  module: {
    type: String, // inventory, donation, release
    required: true
  },

  action: {
    type: String, // ADD, EDIT, DELETE, RELEASE, DONATION
    required: true
  },

  item: String,
  quantity: Number,

  description: String,

  proofFiles: [String], // images / pdf

  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserStaff'
  },

  username: String,
  role: String,

  isArchived: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model('MRCLog', mrcSchema);