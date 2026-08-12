const { isPrivilegedStaffRole } = require("../utils/roleAccessUtils");

const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  console.log("SESSION IN requireAdmin:", req.session);

  if (!req.session || req.session.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};

const requireDrrmo = (req, res, next) => {
  console.log("SESSION IN requireDrrmo:", req.session);

  if (!req.session || req.session.role !== "drrmo") {
    return res.status(403).json({ message: "DRRMO access required" });
  }

  next();
};

const requireAdminOrDrrmo = (req, res, next) => {
  console.log("SESSION IN requireAdminOrDrrmo:", req.session);

  if (!req.session || !isPrivilegedStaffRole(req.session.role)) {
    return res
      .status(403)
      .json({ message: "Admin, DRRMO, or accountant access required" });
  }

  next();
};

module.exports = {
  requireLogin,
  requireAdmin,
  requireDrrmo,
  requireAdminOrDrrmo,
};
