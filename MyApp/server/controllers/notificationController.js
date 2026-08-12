const Notification = require("../models/Notification");
const {
  syncRiskNotificationsForSession,
} = require("../utils/riskNotificationScanner");

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeRole = (value) => normalizeString(value).toLowerCase();

const ROLE_ALLOWED_MODULES = {
  admin: ["evacuation", "inventory", "announcement", "account", "analytics", "system"],
  accountant: ["relief", "inventory", "donation", "analytics", "system"],
  drrmo: [
    "relief",
    "inventory",
    "donation",
    "evacuation",
    "announcement",
    "incident",
    "guidelines",
    "system",
  ],
  barangay: ["relief", "evacuation", "system"],
};

const getAllowedModulesForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  return ROLE_ALLOWED_MODULES[normalizedRole] || ["system"];
};

const escapeRegex = (value) => {
  return normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getSessionUser = (req) => {
  const userId = req.session?.userId || null;
  const role = normalizeRole(req.session?.role);
  const username = normalizeString(req.session?.username);
  const barangayName = normalizeString(req.session?.barangayName);
  const isAuthenticated = Boolean(req.session?.isAuthenticated);

  return {
    userId,
    role,
    username,
    barangayName,
    isAuthenticated,
    isLoggedIn: Boolean(userId && role),
  };
};

const getEmptyNotificationPayload = (page = 1, limit = 50) => {
  return {
    notifications: [],
    pagination: {
      page,
      limit,
      total: 0,
      hasMore: false,
    },
  };
};

const getReadQuery = (statusFilter, userId) => {
  if (statusFilter === "unread") {
    return {
      readBy: {
        $not: {
          $elemMatch: {
            user: userId,
          },
        },
      },
    };
  }

  if (statusFilter === "read") {
    return {
      readBy: {
        $elemMatch: {
          user: userId,
        },
      },
    };
  }

  return {};
};

const buildNotificationQuery = (req) => {
  const session = getSessionUser(req);

  if (!session.isLoggedIn) {
    return null;
  }

  const role = session.role;
  const userId = session.userId;
  const barangayName = session.barangayName || session.username;
  const allowedModules = getAllowedModulesForRole(role);

  const visibilityOr = [
    {
      recipientRole: "all",
    },

    {
      recipientUser: userId,
    },

    {
      recipientRole: role,
      recipientUser: null,
      recipientBarangay: null,
      recipientBarangayName: "",
    },
  ];

  if (role === "barangay") {
    visibilityOr.push({
      recipientRole: "barangay",
      recipientUser: userId,
    });

    visibilityOr.push({
      recipientRole: "barangay",
      recipientBarangay: userId,
    });

    if (barangayName) {
      visibilityOr.push({
        recipientRole: "barangay",
        recipientBarangayName: {
          $regex: `^${escapeRegex(barangayName)}$`,
          $options: "i",
        },
      });
    }
  }

  if (role === "drrmo") {
    visibilityOr.push({
      recipientRole: "drrmo",
      recipientUser: null,
      recipientBarangay: null,
      recipientBarangayName: "",
    });

    visibilityOr.push({
      recipientRole: "drrmo",
      recipientUser: userId,
    });
  }

  if (role === "accountant") {
    visibilityOr.push({
      recipientRole: "accountant",
      recipientUser: null,
      recipientBarangay: null,
      recipientBarangayName: "",
    });

    visibilityOr.push({
      recipientRole: "accountant",
      recipientUser: userId,
    });
  }

  if (role === "admin") {
    visibilityOr.push({
      recipientRole: "admin",
      recipientUser: null,
      recipientBarangay: null,
      recipientBarangayName: "",
    });

    visibilityOr.push({
      recipientRole: "admin",
      recipientUser: userId,
    });
  }

  return {
    $and: [
      {
        $or: visibilityOr,
      },
      {
        module: {
          $in: allowedModules,
        },
      },
      {
        archivedBy: {
          $not: {
            $elemMatch: {
              user: userId,
            },
          },
        },
      },
      {
        $or: [
          { expiresAt: null },
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } },
        ],
      },
    ],
  };
};

const decorateNotification = (notification, userId) => {
  const plain =
    typeof notification.toObject === "function"
      ? notification.toObject()
      : notification;

  const isRead = Array.isArray(plain.readBy)
    ? plain.readBy.some((entry) => String(entry.user) === String(userId))
    : false;

  return {
    ...plain,
    isRead,
  };
};

const getNotifications = async (req, res) => {
  try {
    const session = getSessionUser(req);

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const skip = (page - 1) * limit;

    /*
      Important:
      Sidebar notification polling should not flood the browser with 401 errors.
      If the session is temporarily missing during reload/backend restart,
      return an empty list instead of an error.
    */
    if (!session.isLoggedIn) {
      return res.status(200).json(getEmptyNotificationPayload(page, limit));
    }

    const query = buildNotificationQuery(req);

    if (!query) {
      return res.status(200).json(getEmptyNotificationPayload(page, limit));
    }

    const moduleFilter = normalizeString(req.query.module).toLowerCase();
    const statusFilter = normalizeString(req.query.status).toLowerCase();
    const allowedModules = getAllowedModulesForRole(session.role);

    await syncRiskNotificationsForSession(session, moduleFilter);

    const finalQuery = {
      ...query,
      ...getReadQuery(statusFilter, session.userId),
    };

    if (moduleFilter && moduleFilter !== "all") {
      if (!allowedModules.includes(moduleFilter)) {
        return res.status(200).json(getEmptyNotificationPayload(page, limit));
      }
      finalQuery.module = moduleFilter;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(finalQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments(finalQuery),
    ]);

    const decorated = notifications.map((item) =>
      decorateNotification(item, session.userId)
    );

    return res.json({
      notifications: decorated,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + notifications.length < total,
      },
    });
  } catch (err) {
    console.error("Get Notifications Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const getUnreadNotificationCount = async (req, res) => {
  try {
    const session = getSessionUser(req);

    /*
      Same reason as getNotifications:
      unread-count is polled by sidebars, so return 0 instead of console-spamming 401.
    */
    if (!session.isLoggedIn) {
      return res.status(200).json({ unreadCount: 0 });
    }

    const query = buildNotificationQuery(req);

    if (!query) {
      return res.status(200).json({ unreadCount: 0 });
    }

    await syncRiskNotificationsForSession(session, normalizeString(req.query.module));

    const unreadQuery = {
      ...query,
      ...getReadQuery("unread", session.userId),
    };

    const unreadCount = await Notification.countDocuments(unreadQuery);

    return res.json({ unreadCount });
  } catch (err) {
    console.error("Get Unread Notification Count Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const session = getSessionUser(req);

    if (!session.isLoggedIn) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const query = buildNotificationQuery(req);

    if (!query) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      ...query,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const alreadyRead = notification.readBy.some(
      (entry) => String(entry.user) === String(session.userId)
    );

    if (!alreadyRead) {
      notification.readBy.push({
        user: session.userId,
        role: session.role,
        readAt: new Date(),
      });

      await notification.save();
    }

    return res.json({
      message: "Notification marked as read.",
      notification: decorateNotification(notification, session.userId),
    });
  } catch (err) {
    console.error("Mark Notification Read Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const session = getSessionUser(req);

    if (!session.isLoggedIn) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const query = buildNotificationQuery(req);

    if (!query) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const unreadQuery = {
      ...query,
      ...getReadQuery("unread", session.userId),
    };

    const notifications = await Notification.find(unreadQuery).select("_id readBy");

    let updatedCount = 0;

    for (const notification of notifications) {
      notification.readBy.push({
        user: session.userId,
        role: session.role,
        readAt: new Date(),
      });

      await notification.save();
      updatedCount += 1;
    }

    return res.json({
      message: "All notifications marked as read.",
      updatedCount,
    });
  } catch (err) {
    console.error("Mark All Notifications Read Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const archiveNotification = async (req, res) => {
  try {
    const session = getSessionUser(req);

    if (!session.isLoggedIn) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const query = buildNotificationQuery(req);

    if (!query) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      ...query,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const alreadyArchived = notification.archivedBy.some(
      (entry) => String(entry.user) === String(session.userId)
    );

    if (!alreadyArchived) {
      notification.archivedBy.push({
        user: session.userId,
        role: session.role,
        archivedAt: new Date(),
      });

      await notification.save();
    }

    return res.json({ message: "Notification archived." });
  } catch (err) {
    console.error("Archive Notification Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
};
