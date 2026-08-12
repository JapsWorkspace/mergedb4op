const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true
  },
  creator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },

  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  pendingMembers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User" 
  }]
}, { timestamps: true });

const ConnectionModel = mongoose.model("Connection", connectionSchema);
module.exports = ConnectionModel;
