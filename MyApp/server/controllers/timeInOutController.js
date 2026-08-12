const TimeLog = require('../models/TimeLog');

const getRoleFilter = (role) => {
  const normalized = String(role || '').trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === 'brgy' || normalized === 'barangay') return ['barangay', 'brgy'];
  if (normalized === 'accountant' || normalized === 'accounting') return ['accountant', 'accounting'];
  if (normalized === 'drrmo') return ['drrmo'];
  if (normalized === 'admin') return ['admin'];

  return [normalized];
};

const isBarangayRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'brgy' || normalized === 'barangay';
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAllTimeLogs = async (req, res) => {
  try {

    if (req.session.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { role, date, search, page = 1, limit = 10 } = req.query;

    let filter = {};
    const andConditions = [];

    // 🔎 Filter by role
    const roleValues = getRoleFilter(role);
    if (roleValues) {
      if (isBarangayRole(role)) {
        andConditions.push({
          $or: [{ role: { $in: roleValues } }, { userModel: 'Barangay' }]
        });
      } else {
        andConditions.push({ role: { $in: roleValues } });
      }
    }

    const searchTerm = String(search || '').trim();
    if (searchTerm) {
      const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');
      andConditions.push({
        $or: [
          { username: searchRegex },
          { role: searchRegex },
          { barangay: searchRegex },
          { userModel: searchRegex }
        ]
      });
    }

    // 🔎 Filter by date
    if (date) {
      const start = new Date(date);
      start.setHours(0,0,0,0);

      const end = new Date(date);
      end.setHours(23,59,59,999);

      filter.timeIn = { $gte: start, $lte: end };
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const skip = (page - 1) * limit;

    const logs = await TimeLog.find(filter)
      .sort({ timeIn: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await TimeLog.countDocuments(filter);

    res.json({
      logs,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getAllTimeLogs };
