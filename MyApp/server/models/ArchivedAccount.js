const mongoose = require('mongoose');

const ArchivedAccountSchema = new mongoose.Schema({
  originalId: { type: mongoose.Schema.Types.ObjectId, required: true },
  accountType: { type: String, enum: ['User', 'Barangay'], required: true },
  role: String,
  username: String,
  email: String,
  phoneNumber: String,
  hotline: String,
  address: String,
  password: String,
  barangayName: String,
  themePreference: {
    type: String,
    enum: ['dark', 'light'],
    default: 'dark'
  },
  archivedAt: { type: Date, default: Date.now },
});

const ArchivedAccountModel = mongoose.model('ArchivedAccount', ArchivedAccountSchema);
module.exports = ArchivedAccountModel;

