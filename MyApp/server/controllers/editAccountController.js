const User = require('../models/User.js');
const Barangay = require('../models/Barangay.js');
const bcrypt = require('bcryptjs');

// Edit account (self or admin)
const editAccount = async (req, res) => {
  try {
    const userId = req.session.userId;
    const role = req.session.role;

    if (!userId || !role) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    const {
      username,
      email,
      barangay,
      phoneNumber,
      hotline,
      address,
      password
    } = req.body;

    let account;

    // Find account based on role
    if (role === 'barangay') {
      account = await Barangay.findById(userId);
    } else {
      account = await User.findById(userId);
    }

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // ---------------- UPDATE FIELDS ----------------
    if (username) account.username = username;
    if (phoneNumber) account.phoneNumber = phoneNumber;
    if (address) account.address = address;
    if (hotline !== undefined) account.hotline = hotline; // allow blank string

    if (password) {
      const same = await bcrypt.compare(password, account.password);
      if (same) {
        return res.status(400).json({ message: 'New password must be different from old password' });
      }
      account.password = await bcrypt.hash(password, 10);
    }

    // Admin-only updates
    if (role === 'admin') {
      if (email) account.email = email;
      if (barangay) account.barangayName = barangay;
    }

    await account.save();

    res.json(account); // send back updated account
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  editAccount
};
