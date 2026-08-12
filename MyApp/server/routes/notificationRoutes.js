const express = require("express");
const router = express.Router();

const {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} = require("../controllers/notificationController");

router.get("/", getNotifications);
router.get("/unread-count", getUnreadNotificationCount);
router.put("/read-all", markAllNotificationsRead);
router.put("/:id/read", markNotificationRead);
router.put("/:id/archive", archiveNotification);

module.exports = router;