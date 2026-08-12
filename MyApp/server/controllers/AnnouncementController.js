const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const UserModel = require("../models/User");
const cloudinary = require("../config/cloudinary");
const dispatchMultiChannelNotification = require("../utils/dispatchMultiChannelNotification");
const {
  buildAnnouncementSms,
  buildAnnouncementEmail,
} = require("../utils/notificationMessageBuilders");
const PDFDocument = require("pdfkit");
const Notification = require("../models/Notification");
const createNotification = require("../utils/createNotification");
const { sendExpoPushNotifications } = require("../utils/sendExpoPushNotifications");

const ANNOUNCEMENT_NOTIFICATION_LOOKBACK_DAYS = 30;


async function getExternalNotificationRecipients() {
  const users = await UserModel.find({
    isArchived: { $ne: true },
    $or: [
      { email: { $exists: true, $ne: "" } },
      { phone: { $exists: true, $ne: "" } },
      { phoneNumber: { $exists: true, $ne: "" } },
    ],
  })
    .select("_id email phone phoneNumber barangay district fname lname username address street streetAddress")
    .lean();

  console.log("[email recipients resolved]", {
    totalUsers: users.length,
    validEmailCount: users.filter((u) => Boolean(u.email)).length,
    validPhoneCount: users.filter((u) => Boolean(u.phone || u.phoneNumber)).length,
    sampleEmails: users.slice(0, 5).map((u) => u.email),
  });

  return users;
}
function sanitizeText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAnnouncementStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["publish", "posted", "active", "public", "live"].includes(status)) {
    return "published";
  }
  return ["draft", "published", "archived"].includes(status) ? status : "draft";
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function normalizePriorityLevel(value) {
  const priority = String(value || "").trim().toLowerCase();
  if (priority === "normal") return "medium";
  return ["low", "medium", "high", "critical"].includes(priority) ? priority : "";
}

function normalizeAnnouncementPayload(payload = {}) {
  const nextPayload = { ...payload };
  const publishedValue = nextPayload.published ?? nextPayload.isPublished;
  const priorityLevel = normalizePriorityLevel(
    nextPayload.priorityLevel || nextPayload.priority
  );

  if (nextPayload.status !== undefined) {
    nextPayload.status = normalizeAnnouncementStatus(nextPayload.status);
  } else if (
    publishedValue === true ||
    String(publishedValue || "").trim().toLowerCase() === "true"
  ) {
    nextPayload.status = "published";
  }

  if (priorityLevel) {
    nextPayload.priorityLevel = priorityLevel;
  }

  delete nextPayload.published;
  delete nextPayload.isPublished;
  delete nextPayload.priority;
  delete nextPayload.urgent;
  delete nextPayload.sendSms;
  delete nextPayload.sendEmail;
  delete nextPayload.viewedBy;
  delete nextPayload.likedBy;
  delete nextPayload.views;

  if (nextPayload.pinned !== undefined) {
    const pinnedValue = String(nextPayload.pinned).trim().toLowerCase();
    nextPayload.pinned =
      nextPayload.pinned === true ||
      pinnedValue === "true" ||
      pinnedValue === "1" ||
      pinnedValue === "yes" ||
      pinnedValue === "on";
  }

  return nextPayload;
}

function getRequestRole(req) {
  return (
    req.user?.role ||
    req.session?.role ||
    req.body?.senderRole ||
    req.headers["x-user-role"] ||
    "drrmo"
  );
}

function formatSenderRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "drrmo" || role === "mdrrmo") return "DRRMO";
  if (role === "admin") return "Admin";
  if (role === "barangay") return "Barangay";
  return role ? role.replace(/\b\w/g, (char) => char.toUpperCase()) : "DRRMO";
}

function getRequestUserId(req) {
  return (
    req.user?._id ||
    req.session?.userId ||
    req.query?.userId ||
    req.body?.userId ||
    req.headers["x-user-id"] ||
    null
  );
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function toClientAnnouncement(announcement, userId = null, includeUserLists = false) {
  const raw =
    typeof announcement?.toObject === "function"
      ? announcement.toObject({ virtuals: true })
      : announcement || {};

  const viewedBy = Array.isArray(raw.viewedBy) ? raw.viewedBy.map(String) : [];
  const likedBy = Array.isArray(raw.likedBy) ? raw.likedBy.map(String) : [];
  const currentUserId = userId ? String(userId) : "";

  return {
    ...raw,
    senderRole: raw.senderRole || "drrmo",
    senderDisplay: formatSenderRole(raw.senderRole || "drrmo"),
    views: viewedBy.length || raw.views || 0,
    viewCount: viewedBy.length || raw.views || 0,
    likeCount: likedBy.length,
    viewedByCurrentUser: currentUserId ? viewedBy.includes(currentUserId) : false,
    likedByCurrentUser: currentUserId ? likedBy.includes(currentUserId) : false,
    viewedBy: includeUserLists ? raw.viewedBy : undefined,
    likedBy: includeUserLists ? raw.likedBy : undefined,
  };
}

function buildPublishedAnnouncementNotification(announcement, options = {}) {
  const title = sanitizeText(announcement?.title, 120) || "Untitled announcement";
  const dedupeKey = `announcement:${announcement._id}:published`;
  const priority = normalizePriorityLevel(announcement?.priorityLevel);
  const category = String(announcement?.category || "").trim().toLowerCase();
  const alertLevel =
    priority === "critical" || category === "emergency"
      ? "critical"
      : priority === "high"
      ? "high"
      : "normal";
  const dangerAlert = ["high", "critical"].includes(alertLevel);
  const sendSms = Boolean(options.sendSms);

  return {
    type: "announcement",
    title: "New MDRRMO Announcement",
    message: `MDRRMO posted a new announcement: ${title}`,
    target: "all",
    source: "mdrrmo",
    priority: alertLevel,
    notificationType: dangerAlert ? "danger" : "normal",
    soundType: dangerAlert ? "danger" : "notification",
    announcementId: announcement._id,
    sourceLabel: "MDRRMO",
    official: true,
    dedupeKey,
    actionable: false,
    metadata: {
      alertLevel,
      category: announcement?.category || "",
      sendSms,
      deliveryChannels: [
        ...(sendSms ? ["sms"] : []),
        ...(options.sendEmail ? ["email"] : []),
      ],
    },
    read: false,
    isRead: false,
    createdAt: announcement.publishedNotificationSentAt || announcement.updatedAt || new Date(),
  };
}

function getAnnouncementDispatchOptions(announcement, payload = {}) {
  const priority = normalizePriorityLevel(
    payload.priority || payload.priorityLevel || announcement?.priorityLevel
  );
  const category = String(announcement?.category || payload.category || "").toLowerCase();
  const urgent =
    parseBoolean(payload.urgent) ||
    ["high", "critical"].includes(priority) ||
    category === "emergency";

  return {
    urgent,
    sendSms: payload.sendSms === undefined ? true : parseBoolean(payload.sendSms),
    sendEmail: payload.sendEmail === undefined ? true : parseBoolean(payload.sendEmail),
  };
}

function buildAnnouncementDispatchMessage(announcement) {
  return [
    sanitizeText(announcement?.title, 150),
    sanitizeText(announcement?.description, 1500),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getPublishedNotificationTime(announcement) {
  const value =
    announcement?.publishedNotificationSentAt ||
    announcement?.updatedAt ||
    announcement?.createdAt ||
    null;
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getAnnouncementClearDedupeKey(item) {
  const type = String(item?.type || "").toLowerCase();

  if (item?.dedupeKey) return String(item.dedupeKey);

  const announcementId =
    item?.announcementId ||
    item?.metadata?.announcementId ||
    item?.referenceId;

  if (type.includes("announcement") && announcementId) {
    return `announcement:${String(announcementId)}:published`;
  }

  return "";
}

async function ensureAnnouncementNotificationsForUser(userId, announcements = []) {
  if (!isValidObjectId(userId) || !Array.isArray(announcements) || !announcements.length) {
    return;
  }

  const cutoff = new Date(
    Date.now() - ANNOUNCEMENT_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const recentPublishedAnnouncements = announcements.filter((announcement) => {
    const status = String(announcement?.status || "").toLowerCase();
    const timestamp = new Date(
      announcement?.publishedNotificationSentAt ||
        announcement?.updatedAt ||
        announcement?.createdAt ||
        0
    ).getTime();

    return status === "published" && !Number.isNaN(timestamp) && timestamp >= cutoff.getTime();
  });

  if (!recentPublishedAnnouncements.length) {
    return;
  }

  const user = await UserModel.findById(userId).select(
    "notifications notificationClearedAt clearedNotificationDedupeKeys"
  );
  if (!user) {
    console.log("[notifications] announcement sync skipped", {
      reason: "user_not_found",
      userId: String(userId),
    });
    return;
  }

  const clearedAt = user.notificationClearedAt
    ? new Date(user.notificationClearedAt)
    : null;
  const existingDedupeKeys = new Set(
    [
      ...(user.notifications || []).map(getAnnouncementClearDedupeKey),
      ...(user.clearedNotificationDedupeKeys || []),
    ]
      .map((key) => String(key || ""))
      .filter(Boolean)
  );
  let skippedExistingOrCleared = 0;
  let skippedBeforeClear = 0;

  const missingNotifications = recentPublishedAnnouncements
    .filter((announcement) => {
      const dedupeKey = `announcement:${announcement._id}:published`;
      if (existingDedupeKeys.has(dedupeKey)) {
        skippedExistingOrCleared += 1;
        return false;
      }

      if (clearedAt) {
        const publishedTime = getPublishedNotificationTime(announcement);
        if (publishedTime && publishedTime <= clearedAt) {
          skippedBeforeClear += 1;
          return false;
        }
      }

      return true;
    })
    .map((announcement) =>
      buildPublishedAnnouncementNotification(
        announcement,
        getAnnouncementDispatchOptions(announcement, {})
      )
    );

  console.log("[notifications] announcement sync check", {
    userId: String(userId),
    publishedAnnouncements: recentPublishedAnnouncements.length,
    notificationClearedAt: user.notificationClearedAt || null,
    clearedKeys: user.clearedNotificationDedupeKeys?.length || 0,
    missingAnnouncementNotifications: missingNotifications.length,
    skippedExistingOrCleared,
    skippedBeforeClear,
  });

  if (!missingNotifications.length) {
    return;
  }

  user.notifications.push(...missingNotifications);
  await user.save();

  console.log("[notifications] announcement notification created:", {
    userId: String(userId),
    count: missingNotifications.length,
  });
  console.log("[notifications] notification type", "announcement");
}

async function notifyPublishedAnnouncement(
  announcement,
  action = "published",
  payload = {},
  req = null
) {
  if (String(announcement?.status || "").toLowerCase() !== "published") return;
  if (announcement?.publishedNotificationSent) {
    console.log("[announcements] shouldNotify:", false, {
      reason: "already_sent",
      announcementId: String(announcement._id),
      title: announcement.title,
      status: announcement.status,
    });
    return;
  }

  const dedupeKey = `announcement:${announcement._id}:published`;
  const dispatchOptions = getAnnouncementDispatchOptions(announcement, payload);
  const notification = buildPublishedAnnouncementNotification(announcement, dispatchOptions);

  const result = await UserModel.updateMany(
    {
      isArchived: { $ne: true },
      "notifications.dedupeKey": { $ne: dedupeKey },
    },
    {
      $push: {
        notifications: notification,
      },
    }
  );

  const existingNotification = await Notification.findOne({
    type: "announcement_published",
    referenceId: announcement._id,
    referenceModel: "Announcement",
  }).select("_id");

  if (!existingNotification) {
    const priority = normalizePriorityLevel(announcement?.priorityLevel);

    await createNotification({
      recipientRole: "all",
      senderUser: req?.session?.userId || getRequestUserId(req || {}) || null,
      senderRole: req?.session?.role || getRequestRole(req || {}),
      senderName: req?.session?.username || "MDRRMO",
      module: "announcement",
      type: "announcement_published",
      priority:
        priority === "critical" ? "critical" : priority === "high" ? "high" : "normal",
      title: "New MDRRMO Announcement",
      message: notification.message,
      link: "/announcements",
      referenceId: announcement._id,
      referenceModel: "Announcement",
      metadata: {
        announcementId: announcement._id,
        category: announcement?.category || "general",
        status: announcement?.status || "published",
        sendSms: dispatchOptions.sendSms,
        deliveryChannels: [
          ...(dispatchOptions.sendSms ? ["sms"] : []),
          ...(dispatchOptions.sendEmail ? ["email"] : []),
        ],
      },
    });
  }

  announcement.publishedNotificationSent = true;
  announcement.publishedNotificationSentAt = new Date();
  await announcement.save();

  console.log("[announcement dispatch options]", {
    announcementId: String(announcement._id),
    priorityLevel: announcement?.priorityLevel || "",
    urgent: dispatchOptions.urgent,
    sendSms: dispatchOptions.sendSms,
    sendEmail: dispatchOptions.sendEmail,
  });

  if (dispatchOptions.sendSms || dispatchOptions.sendEmail) {
    const users = await getExternalNotificationRecipients();
    const email = buildAnnouncementEmail(announcement);

    await dispatchMultiChannelNotification({
      users,
      title: sanitizeText(announcement?.title, 120) || "MDRRMO Announcement",
      message: buildAnnouncementDispatchMessage(announcement),
      type: "announcement",
      referenceId: announcement._id,
      urgent: dispatchOptions.urgent,
      sendSms: dispatchOptions.sendSms,
      sendEmail: dispatchOptions.sendEmail,
      category: announcement?.category || "Announcement",
      notification: announcement,
      smsMessage: buildAnnouncementSms(announcement),
      emailSubject: email.subject,
      emailMessage: email.message,
      emailHtml: email.html,
    });
  }

  const pushUsers = await UserModel.find({
    isArchived: { $ne: true },
    "notificationTokens.0": { $exists: true },
  })
    .select("_id notificationTokens")
    .lean();

  const pushResult = await sendExpoPushNotifications(pushUsers, {
    title: "New MDRRMO Announcement",
    body: notification.message,
    priority: dispatchOptions.urgent ? "high" : "default",
    soundType: notification.soundType,
    data: {
      type: "announcement",
      soundType: notification.soundType,
      announcementId: String(announcement._id),
      referenceId: String(announcement._id),
      screen: "Announcement",
    },
  });

  console.log("[notifications] announcement notification created:", {
    announcementId: String(announcement._id),
    action,
    title: notification.message,
    status: announcement.status,
    matched: result?.matchedCount,
    modified: result?.modifiedCount,
    pushSent: pushResult.sent,
  });
  console.log("[notifications] notification type", "announcement");
}

async function uploadAnnouncementFiles(files = []) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { folder: "evacuation_app/announcements" },
              (err, result) => {
                if (err) return reject(err);

                resolve({
                  fileName: file.originalname,
                  fileUrl: result.secure_url,
                  public_id: result.public_id,
                });
              }
            )
            .end(file.buffer);
        })
    )
  );
}

const createAnnouncement = async (req, res) => {
  try {
    const attachments = await uploadAnnouncementFiles(req.files || []);
    const announcement = await Announcement.create({
      ...normalizeAnnouncementPayload(req.body),
      senderRole: getRequestRole(req),
      attachments,
    });

    const savedStatus = String(announcement.status || "").toLowerCase().trim();
    if (savedStatus === "published") {
      await notifyPublishedAnnouncement(announcement, "published", req.body, req);
    }

    res
      .status(201)
      .json(toClientAnnouncement(announcement, getRequestUserId(req), true));
  } catch (err) {
    console.error("Error creating announcement:", err);
    res.status(400).json({ error: err.message });
  }
};

const getAnnouncements = async (req, res) => {
  try {
    const { status, category, includeAll } = req.query;
    const filter = String(includeAll || "false") === "true" ? {} : { status: "published" };
    const userId = getRequestUserId(req);

    if (status) filter.status = normalizeAnnouncementStatus(status);
    if (category && category !== "all") filter.category = category;

    const announcements = await Announcement.find(filter).sort({
      pinned: -1,
      createdAt: -1,
      updatedAt: -1,
    });

    if (filter.status === "published" && isValidObjectId(userId)) {
      await ensureAnnouncementNotificationsForUser(userId, announcements);
    }

    res
      .status(200)
      .json(
        announcements.map((item) =>
          toClientAnnouncement(item, userId, filter.status !== "published")
        )
      );
  } catch (err) {
    console.error("Error fetching announcements:", err);
    res.status(500).json({ error: err.message });
  }
};

const getAnnouncementById = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const filter = { _id: req.params.id };

    if (String(req.query.includeAll || "false") !== "true") {
      filter.status = "published";
    }

    const announcement = await Announcement.findOne(filter);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json(toClientAnnouncement(announcement, userId));
  } catch (err) {
    console.error("Error fetching announcement:", err);
    res.status(500).json({ error: err.message });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    let remainingAttachments = announcement.attachments || [];

    if (req.body.removeImages) {
      const removeList = JSON.parse(req.body.removeImages);

      await Promise.all(
        removeList
          .filter((item) => item?.public_id)
          .map((item) => cloudinary.uploader.destroy(item.public_id))
      );

      remainingAttachments = remainingAttachments.filter(
        (file) => !removeList.some((item) => item.public_id === file.public_id)
      );
    }

    const newAttachments = await uploadAnnouncementFiles(req.files || []);
    announcement.attachments = [...remainingAttachments, ...newAttachments];

    const previousStatus = String(announcement.status || "").toLowerCase().trim();
    Object.assign(announcement, normalizeAnnouncementPayload(req.body));
    announcement.senderRole = announcement.senderRole || getRequestRole(req);

    if (previousStatus !== "published" && announcement.status === "published") {
      announcement.publishedNotificationSent = false;
      announcement.publishedNotificationSentAt = null;
    }

    await announcement.save();

    const nextStatus = String(announcement.status || "").toLowerCase().trim();
    if (
      previousStatus !== "published" &&
      nextStatus === "published" &&
      !announcement.publishedNotificationSent
    ) {
      await notifyPublishedAnnouncement(announcement, "published", req.body, req);
    }

    res.json(toClientAnnouncement(announcement, getRequestUserId(req), true));
  } catch (err) {
    console.error("Error updating announcement:", err);
    res.status(400).json({ error: err.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    if (announcement.attachments?.length) {
      await Promise.all(
        announcement.attachments
          .filter((file) => file?.public_id)
          .map((file) => cloudinary.uploader.destroy(file.public_id))
      );
    }

    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    console.error("Error deleting announcement:", err);
    res.status(500).json({ error: err.message });
  }
};

const incrementViews = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid userId is required to count a view." });
    }

    const announcement = await Announcement.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "published",
        viewedBy: { $ne: userId },
      },
      {
        $addToSet: { viewedBy: userId },
      },
      { new: true }
    );

    const existing = announcement || (await Announcement.findById(req.params.id));
    if (!existing || String(existing.status || "").toLowerCase() !== "published") {
      return res.status(404).json({ message: "Announcement not found" });
    }

    existing.views = existing.viewedBy?.length || 0;
    await existing.save();

    res.json(toClientAnnouncement(existing, userId));
  } catch (err) {
    console.error("Error recording announcement view:", err);
    res.status(500).json({ error: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid userId is required to like a post." });
    }

    const announcement = await Announcement.findOne({
      _id: req.params.id,
      status: "published",
    });

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const liked = announcement.likedBy.some((id) => String(id) === String(userId));
    if (liked) {
      announcement.likedBy = announcement.likedBy.filter(
        (id) => String(id) !== String(userId)
      );
    } else {
      announcement.likedBy.addToSet(userId);
    }

    await announcement.save();
    res.json(toClientAnnouncement(announcement, userId));
  } catch (err) {
    console.error("Error toggling announcement like:", err);
    res.status(500).json({ error: err.message });
  }
};

const exportPublishedAnnouncementsPdf = async (req, res) => {
  try {
    const announcements = await Announcement.find({ status: "published" }).lean();
    const sorted = announcements.sort((a, b) => {
      const aPinned = Number(Boolean(a?.pinned));
      const bPinned = Number(Boolean(b?.pinned));
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
    });

    const summary = sorted.reduce(
      (acc, item) => {
        acc.totalPublished += 1;
        acc.totalViews += Number(item.viewedBy?.length || item.views || 0);

        const category = normalizeString(item.category).toLowerCase() || "general";
        acc.categories[category] = (acc.categories[category] || 0) + 1;

        const priority = normalizeString(item.priorityLevel).toLowerCase() || "medium";
        acc.priorities[priority] = (acc.priorities[priority] || 0) + 1;

        if (item?.pinned) acc.totalPinned += 1;

        return acc;
      },
      {
        totalPublished: 0,
        totalViews: 0,
        totalPinned: 0,
        categories: {},
        priorities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      }
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="published-announcements-report.pdf"'
    );

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111");
    doc.text("Published Announcements Report", { align: "left" });

    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#444444");
    doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`);

    doc.moveDown(0.9);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
    doc.text("Summary");

    doc.moveDown(0.35);
    doc.font("Helvetica").fontSize(10).fillColor("#222222");
    doc.text(`Published announcements: ${summary.totalPublished}`);
    doc.text(`Pinned announcements: ${summary.totalPinned}`);
    doc.text(`Total views: ${summary.totalViews}`);

    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
    doc.text("Priority Breakdown");
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(10);
    ["critical", "high", "medium", "low"].forEach((priority) => {
      doc.text(
        `${priority.charAt(0).toUpperCase() + priority.slice(1)}: ${
          summary.priorities[priority] || 0
        }`
      );
    });

    const categoryEntries = Object.entries(summary.categories || {});
    if (categoryEntries.length) {
      doc.moveDown(0.7);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
      doc.text("Category Breakdown");
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(10);
      categoryEntries
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          const label = category.replace(/\b\w/g, (char) => char.toUpperCase());
          doc.text(`${label}: ${count}`);
        });
    }

    doc.moveDown(0.9);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
    doc.text("Published Announcement List");

    sorted.forEach((item, index) => {
      if (doc.y > 700) {
        doc.addPage();
      }

      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
      doc.text(
        `${index + 1}. ${normalizeString(item.title) || "Untitled Announcement"}${
          item?.pinned ? " (Pinned)" : ""
        }`
      );

      doc.font("Helvetica").fontSize(9).fillColor("#444444");
      doc.text(
        `Category: ${normalizeString(item.category) || "-"} | Priority: ${
          normalizeString(item.priorityLevel) || "-"
        } | Sender: ${formatSenderRole(item.senderRole || "drrmo")}`
      );
      doc.text(
        `Views: ${Number(item.viewedBy?.length || item.views || 0)} | Created: ${new Date(
          item.createdAt || Date.now()
        ).toLocaleString("en-PH")}`
      );

      const description = normalizeString(item.description) || "No description provided.";
      doc.moveDown(0.1);
      doc.font("Helvetica").fontSize(10).fillColor("#222222");
      doc.text(description, {
        align: "left",
      });
    });

    doc.end();
  } catch (err) {
    console.error("Error exporting published announcements PDF:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  incrementViews,
  toggleLike,
  exportPublishedAnnouncementsPdf,
};
