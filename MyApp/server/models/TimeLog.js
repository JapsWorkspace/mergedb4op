const mongoose = require('mongoose');

const TimeLogSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userModel'
  },

  userModel: {
    type: String,
    required: true,
    enum: ['UserStaff', 'Barangay']
  },

  username: String,

  role: String,

  barangay: String,

  timeIn: {
    type: Date,
    default: Date.now
  },

  timeOut: {
    type: Date,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model('TimeLog', TimeLogSchema);