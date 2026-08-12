const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, unique: true },
  password: String,

  role: {
    type: String,
    enum: ['admin', 'drrmo', 'accountant'],
    required: true
  },

  verified: { type: Boolean, default: true },
  phoneNumber: { type: String, required: true },
  hotline: String,
  address: { type: String, required: true },
  themePreference: {
    type: String,
    enum: ['dark', 'light'],
    default: 'dark'
  },

  archived: { type: Boolean, default: false },
  archivedAt: { type: Date }
});

module.exports = mongoose.model('UserStaff', UserSchema);
