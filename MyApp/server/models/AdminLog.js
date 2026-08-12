const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
  adminId: mongoose.Schema.Types.ObjectId,
  adminUsername: String,

  action: String,
  targetUserId: mongoose.Schema.Types.ObjectId,
  targetUsername: String,

  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AdminLog', AdminLogSchema);