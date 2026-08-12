// controllers/GuidelineController.js
const PostingGuideline = require("../models/Guidelines");
const UserModel = require("../models/User");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const dispatchMultiChannelNotification = require("../utils/dispatchMultiChannelNotification");
const {
  buildGuidelineSms,
  buildGuidelineEmail,
} = require("../utils/notificationMessageBuilders");

const PDFDocument = require("pdfkit");
const Notification = require("../models/Notification");
const createNotification = require("../utils/createNotification");
const { sendExpoPushNotifications } = require("../utils/sendExpoPushNotifications");

const PRIORITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const GUIDELINE_NOTIFICATION_LOOKBACK_DAYS = 30;


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
    sampleEmails: users.slice(0, 5).map((u) => u.email),
  });

  return users;
}
function sanitizeText(value, max = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeGuidelineStatus(value) {
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

function normalizeGuidelinePayload(payload = {}) {
  const nextPayload = { ...payload };
  const publishedValue = nextPayload.published ?? nextPayload.isPublished;
  const priorityLevel = normalizePriorityLevel(
    nextPayload.priorityLevel || nextPayload.priority
  );

  if (nextPayload.status !== undefined) {
    nextPayload.status = normalizeGuidelineStatus(nextPayload.status);
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

  return nextPayload;
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

function buildPublishedGuidelineNotification(guideline, options = {}) {
  const title = sanitizeText(guideline?.title, 120) || "Untitled guideline";
  const dedupeKey = `guideline:${guideline._id}:published`;
  const priority = normalizePriorityLevel(guideline?.priorityLevel);
  const alertLevel = priority === "critical" ? "critical" : priority === "high" ? "high" : "normal";
  const dangerAlert = ["high", "critical"].includes(alertLevel);
  const sendSms = Boolean(options.sendSms);

  return {
    type: "guideline",
    title: "New Guideline Posted",
    message: `MDRRMO posted a new guideline: ${title}`,
    target: "all",
    source: "mdrrmo",
    priority: alertLevel,
    notificationType: dangerAlert ? "danger" : "normal",
    soundType: dangerAlert ? "danger" : "notification",
    guidelineId: guideline._id,
    sourceLabel: "MDRRMO",
    official: true,
    dedupeKey,
    actionable: false,
    metadata: {
      alertLevel,
      category: guideline?.category || "",
      sendSms,
      deliveryChannels: [
        ...(sendSms ? ["sms"] : []),
        ...(options.sendEmail ? ["email"] : []),
      ],
    },
    read: false,
    isRead: false,
    createdAt: guideline.publishedNotificationSentAt || guideline.updatedAt || new Date(),
  };
}

function getGuidelineDispatchOptions(guideline, payload = {}) {
  const priority = normalizePriorityLevel(
    payload.priority || payload.priorityLevel || guideline?.priorityLevel
  );
  const urgent = parseBoolean(payload.urgent) || ["high", "critical"].includes(priority);

  return {
    urgent,
    sendSms: payload.sendSms === undefined ? true : parseBoolean(payload.sendSms),
    sendEmail: payload.sendEmail === undefined ? true : parseBoolean(payload.sendEmail),
  };
}

function buildGuidelineDispatchMessage(guideline) {
  return [
    sanitizeText(guideline?.title, 150),
    sanitizeText(guideline?.description, 1500),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getPublishedNotificationTime(guideline) {
  const value =
    guideline?.publishedNotificationSentAt ||
    guideline?.updatedAt ||
    guideline?.createdAt ||
    null;
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getGuidelineClearDedupeKey(item) {
  const type = String(item?.type || "").toLowerCase();

  if (item?.dedupeKey) return String(item.dedupeKey);

  const guidelineId =
    item?.guidelineId ||
    item?.metadata?.guidelineId ||
    item?.referenceId;

  if (type.includes("guideline") && guidelineId) {
    return `guideline:${String(guidelineId)}:published`;
  }

  return "";
}

async function ensureGuidelineNotificationsForUser(userId, guidelines = []) {
  if (!isValidObjectId(userId) || !Array.isArray(guidelines) || !guidelines.length) {
    return;
  }

  const cutoff = new Date(
    Date.now() - GUIDELINE_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const recentPublishedGuidelines = guidelines.filter((guideline) => {
    const status = String(guideline?.status || "").toLowerCase();
    const timestamp = new Date(
      guideline?.publishedNotificationSentAt || guideline?.updatedAt || guideline?.createdAt || 0
    ).getTime();

    return status === "published" && !Number.isNaN(timestamp) && timestamp >= cutoff.getTime();
  });

  if (!recentPublishedGuidelines.length) {
    return;
  }

  const user = await UserModel.findById(userId).select(
    "notifications notificationClearedAt clearedNotificationDedupeKeys"
  );
  if (!user) {
    console.log("[notifications] guideline sync skipped", {
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
      ...(user.notifications || []).map(getGuidelineClearDedupeKey),
      ...(user.clearedNotificationDedupeKeys || []),
    ]
      .map((key) => String(key || ""))
      .filter(Boolean)
  );
  let skippedExistingOrCleared = 0;
  let skippedBeforeClear = 0;

  const missingNotifications = recentPublishedGuidelines
    .filter((guideline) => {
      const dedupeKey = `guideline:${guideline._id}:published`;
      if (existingDedupeKeys.has(dedupeKey)) {
        skippedExistingOrCleared += 1;
        return false;
      }

      if (clearedAt) {
        const publishedTime = getPublishedNotificationTime(guideline);
        if (publishedTime && publishedTime <= clearedAt) {
          skippedBeforeClear += 1;
          return false;
        }
      }

      return true;
    })
    .map((guideline) =>
      buildPublishedGuidelineNotification(
        guideline,
        getGuidelineDispatchOptions(guideline, {})
      )
    );

  console.log("[notifications] guideline sync check", {
    userId: String(userId),
    publishedGuidelines: recentPublishedGuidelines.length,
    notificationClearedAt: user.notificationClearedAt || null,
    clearedKeys: user.clearedNotificationDedupeKeys?.length || 0,
    missingGuidelineNotifications: missingNotifications.length,
    skippedExistingOrCleared,
    skippedBeforeClear,
  });

  if (!missingNotifications.length) {
    return;
  }

  user.notifications.push(...missingNotifications);
  await user.save();

  console.log("[notifications] guideline notification created:", {
    userId: String(userId),
    count: missingNotifications.length,
  });
  console.log("[notifications] notification type", "guideline");
}

function toClientGuideline(guideline, userId = null, includeUserLists = false) {
  const raw =
    typeof guideline?.toObject === "function"
      ? guideline.toObject({ virtuals: true })
      : guideline || {};

  const viewedBy = Array.isArray(raw.viewedBy) ? raw.viewedBy.map(String) : [];
  const likedBy = Array.isArray(raw.likedBy) ? raw.likedBy.map(String) : [];
  const currentUserId = userId ? String(userId) : "";

  return {
    ...raw,
    views: viewedBy.length || raw.views || 0,
    viewCount: viewedBy.length || raw.views || 0,
    likeCount: likedBy.length,
    viewedByCurrentUser: currentUserId ? viewedBy.includes(currentUserId) : false,
    likedByCurrentUser: currentUserId ? likedBy.includes(currentUserId) : false,
    viewedBy: includeUserLists ? raw.viewedBy : undefined,
    likedBy: includeUserLists ? raw.likedBy : undefined,
  };
}

async function notifyPublishedGuideline(guideline, action = "published", payload = {}) {
  if (String(guideline?.status || "").toLowerCase() !== "published") return;
  if (guideline?.publishedNotificationSent) {
    console.log("[guidelines] shouldNotify:", false, {
      reason: "already_sent",
      guidelineId: String(guideline._id),
      title: guideline.title,
      status: guideline.status,
    });
    return;
  }

  const dedupeKey = `guideline:${guideline._id}:published`;
  const dispatchOptions = getGuidelineDispatchOptions(guideline, payload);
  const notification = buildPublishedGuidelineNotification(guideline, dispatchOptions);

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

  guideline.publishedNotificationSent = true;
  guideline.publishedNotificationSentAt = new Date();
  await guideline.save();

  console.log("[guideline dispatch options]", {
    guidelineId: String(guideline._id),
    priorityLevel: guideline?.priorityLevel || "",
    urgent: dispatchOptions.urgent,
    sendSms: dispatchOptions.sendSms,
    sendEmail: dispatchOptions.sendEmail,
  });

  if (dispatchOptions.sendSms || dispatchOptions.sendEmail) {
    const users = await getExternalNotificationRecipients();
    const email = buildGuidelineEmail(guideline);

    await dispatchMultiChannelNotification({
      users,
      title: sanitizeText(guideline?.title, 120) || "MDRRMO Guideline",
      message: buildGuidelineDispatchMessage(guideline),
      type: "guideline",
      referenceId: guideline._id,
      urgent: dispatchOptions.urgent,
      sendSms: dispatchOptions.sendSms,
      sendEmail: dispatchOptions.sendEmail,
      category: guideline?.category || "General",
      notification: guideline,
      smsMessage: buildGuidelineSms(guideline),
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
    title: "New Guideline Posted",
    body: notification.message,
    priority: dispatchOptions.urgent ? "high" : "default",
    soundType: notification.soundType,
    data: {
      type: "guideline",
      soundType: notification.soundType,
      guidelineId: String(guideline._id),
      referenceId: String(guideline._id),
      screen: "Guidelines",
    },
  });

  console.log("[notifications] guideline notification created:", {
    guidelineId: String(guideline._id),
    action,
    title: notification.message,
    status: guideline.status,
    matched: result?.matchedCount,
    modified: result?.modifiedCount,
    pushSent: pushResult.sent,
  });
  console.log("[notifications] notification type", "guideline");
}

// ✅ Create a new guideline
const createGuideline = async (req, res) => {
  try {
    const files = req.files || [];

    const attachments = await Promise.all(
      files.map(file => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "evacuation_app/guidelines" },
            (err, result) => {
              if (err) return reject(err);

              resolve({
                fileName: file.originalname,
                fileUrl: result.secure_url,
                public_id: result.public_id,
              });
            }
          ).end(file.buffer);
        });
      })
    );

    const guideline = await PostingGuideline.create({
      ...normalizeGuidelinePayload(req.body),
      attachments,
    });

    const status = String(req.body.status || "").toLowerCase().trim();
    const savedStatus = status || String(guideline.status || "").toLowerCase().trim();
    const shouldNotify = savedStatus === "published" && !guideline.publishedNotificationSent;
    console.log("[guidelines] saved status:", {
      title: guideline.title,
      status: guideline.status,
    });
    console.log("[guidelines] shouldNotify:", shouldNotify);

    if (shouldNotify) {
      await notifyPublishedGuideline(guideline, "published", req.body);
    }

    return res.status(201).json(toClientGuideline(guideline, getRequestUserId(req), true));
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};



const sortGuidelines = (items = []) => {
  return [...items].sort((a, b) => {
    const priorityDiff =
      (PRIORITY_RANK[b.priorityLevel] || 0) - (PRIORITY_RANK[a.priorityLevel] || 0);

    if (priorityDiff !== 0) return priorityDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => {
  return normalizeString(value).toLowerCase();
};

const formatDateValue = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatLabel = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return "-";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const drawPdfLabelValue = (doc, label, value) => {
  doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
  doc.font("Helvetica").text(value ?? "-");
};

const ensurePdfPageSpace = (doc, neededSpace = 80) => {
  if (doc.y + neededSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const drawPdfSectionTitle = (doc, title) => {
  ensurePdfPageSpace(doc, 40);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).text(title);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);
};

const getPdfPageWidth = (doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const fitSimpleTableColumns = (doc, columns) => {
  const availableWidth = getPdfPageWidth(doc);
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  if (totalWidth <= availableWidth) {
    const extraWidth = availableWidth - totalWidth;
    return columns.map((col, index) => ({
      ...col,
      width: index === columns.length - 1 ? col.width + extraWidth : col.width,
    }));
  }

  const scale = availableWidth / totalWidth;
  return columns.map((col) => ({
    ...col,
    width: Math.max(col.minWidth || 42, Math.floor(col.width * scale)),
  }));
};

const drawSimpleTableHeader = (doc, columns) => {
  ensurePdfPageSpace(doc, 30);
  const fittedColumns = fitSimpleTableColumns(doc, columns);
  const startX = doc.page.margins.left;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(8);
  let x = startX;

  fittedColumns.forEach((col) => {
    doc.text(col.label, x, startY, {
      width: col.width,
      align: col.align || "left",
      height: 12,
      ellipsis: true,
      lineBreak: false,
    });
    x += col.width;
  });

  doc.moveTo(startX, startY + 14)
    .lineTo(doc.page.width - doc.page.margins.right, startY + 14)
    .stroke();

  doc.y = startY + 18;
  doc.font("Helvetica").fontSize(8);
  return fittedColumns;
};

const drawSimpleTableRow = (doc, columns, row, rowHeight = 24) => {
  ensurePdfPageSpace(doc, rowHeight + 12);

  const startX = doc.page.margins.left;
  const startY = doc.y;
  let x = startX;

  columns.forEach((col) => {
    const value = row[col.key] ?? "-";
    doc.text(String(value), x, startY, {
      width: col.width,
      align: col.align || "left",
      height: rowHeight - 8,
      ellipsis: true,
      lineBreak: false,
    });
    x += col.width;
  });

  doc.moveTo(startX, startY + rowHeight - 4)
    .lineTo(doc.page.width - doc.page.margins.right, startY + rowHeight - 4)
    .strokeColor("#dddddd")
    .stroke()
    .strokeColor("#000000");

  doc.y = startY + rowHeight;
};

const uploadFilesToCloudinary = async (files = []) => {
  return Promise.all(
    files.map((file) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: "evacuation_app/guidelines" },
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
      });
    })
  );
};

// -----------------------------
// NOTIFICATION HELPERS
// DRRMO ONLY
// -----------------------------
const getNotificationDayKey = () => {
  return new Date().toISOString().slice(0, 10);
};

const getGuidelinePriority = (guideline) => {
  return normalizeLower(guideline?.priorityLevel || "medium");
};

const getGuidelineStatus = (guideline) => {
  return normalizeLower(guideline?.status || "draft");
};

const getNotificationPriorityFromGuideline = (guideline, fallback = "normal") => {
  const priority = getGuidelinePriority(guideline);

  if (priority === "critical") return "critical";
  if (priority === "high") return "high";

  return fallback;
};

const getActorName = (req) => {
  return (
    normalizeString(req.session?.username) ||
    normalizeString(req.session?.name) ||
    "System"
  );
};

const createGuidelineNotificationOnce = async ({
  req,
  guideline,
  type,
  priority = "normal",
  title,
  message,
  metadata = {},
}) => {
  try {
    if (!guideline?._id || !type || !title || !message) return null;

    const dayKey = getNotificationDayKey();

    const existing = await Notification.findOne({
      recipientRole: "drrmo",
      module: "guidelines",
      type,
      referenceId: guideline._id,
      "metadata.dayKey": dayKey,
    }).lean();

    if (existing) return existing;

    return await createNotification({
      recipientRole: "drrmo",

      senderUser: req.session?.userId || null,
      senderRole: req.session?.role || "",
      senderName: getActorName(req),

      module: "guidelines",
      type,
      priority,

      title,
      message,
      link: "/drrmo/guidelines",

      referenceId: guideline._id,
      referenceModel: "PostingGuideline",

      metadata: {
        dayKey,
        guidelineId: guideline._id,
        title: guideline.title || "",
        category: guideline.category || "",
        status: guideline.status || "",
        priorityLevel: guideline.priorityLevel || "",
        views: Number(guideline.views || 0),
        attachmentCount: Array.isArray(guideline.attachments)
          ? guideline.attachments.length
          : 0,
        ...metadata,
      },
    });
  } catch (err) {
    console.error("Create Guideline Notification Once Error:", err);
    return null;
  }
};

const notifyGuidelineCreated = async (req, guideline) => {
  try {
    const status = getGuidelineStatus(guideline);
    const priorityLevel = getGuidelinePriority(guideline);

    if (status === "published") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_published",
        priority: getNotificationPriorityFromGuideline(guideline, "normal"),
        title: "Guideline published",
        message: `${guideline.title} was published under ${formatLabel(
          guideline.category
        )} guidelines.`,
        metadata: {
          alertReason: "published_on_create",
        },
      });

      return;
    }

    if (priorityLevel === "critical" || priorityLevel === "high") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_priority_draft_created",
        priority: getNotificationPriorityFromGuideline(guideline, "high"),
        title: "High-priority guideline draft created",
        message: `${guideline.title} was created as a ${formatLabel(
          guideline.priorityLevel
        )} priority draft.`,
        metadata: {
          alertReason: "priority_draft_created",
        },
      });

      return;
    }

    await createGuidelineNotificationOnce({
      req,
      guideline,
      type: "guideline_draft_created",
      priority: "low",
      title: "Guideline draft created",
      message: `${guideline.title} was saved as a draft.`,
      metadata: {
        alertReason: "draft_created",
      },
    });
  } catch (err) {
    console.error("Notify Guideline Created Error:", err);
  }
};

const notifyGuidelineUpdated = async ({
  req,
  guideline,
  previousStatus = "",
  previousPriority = "",
}) => {
  try {
    const currentStatus = getGuidelineStatus(guideline);
    const currentPriority = getGuidelinePriority(guideline);

    if (previousStatus !== "published" && currentStatus === "published") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_published",
        priority: getNotificationPriorityFromGuideline(guideline, "normal"),
        title: "Guideline published",
        message: `${guideline.title} was published under ${formatLabel(
          guideline.category
        )} guidelines.`,
        metadata: {
          alertReason: "status_changed_to_published",
          previousStatus,
        },
      });

      return;
    }

    if (previousStatus !== currentStatus) {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_status_updated",
        priority: currentStatus === "archived" ? "high" : "normal",
        title: "Guideline status updated",
        message: `${guideline.title} status changed from ${formatLabel(
          previousStatus
        )} to ${formatLabel(currentStatus)}.`,
        metadata: {
          alertReason: "status_updated",
          previousStatus,
        },
      });

      return;
    }

    if (previousPriority !== currentPriority && currentPriority === "critical") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_critical_priority",
        priority: "critical",
        title: "Guideline marked critical",
        message: `${guideline.title} is now marked as Critical priority.`,
        metadata: {
          alertReason: "priority_changed_to_critical",
          previousPriority,
        },
      });

      return;
    }

    if (previousPriority !== currentPriority && currentPriority === "high") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_high_priority",
        priority: "high",
        title: "Guideline marked high priority",
        message: `${guideline.title} is now marked as High priority.`,
        metadata: {
          alertReason: "priority_changed_to_high",
          previousPriority,
        },
      });

      return;
    }

    if (currentStatus === "published") {
      await createGuidelineNotificationOnce({
        req,
        guideline,
        type: "guideline_published_updated",
        priority: getNotificationPriorityFromGuideline(guideline, "normal"),
        title: "Published guideline updated",
        message: `${guideline.title} was updated while published.`,
        metadata: {
          alertReason: "published_updated",
        },
      });
    }
  } catch (err) {
    console.error("Notify Guideline Updated Error:", err);
  }
};

const notifyGuidelineArchived = async (req, guideline) => {
  try {
    await createGuidelineNotificationOnce({
      req,
      guideline,
      type: "guideline_archived",
      priority: "high",
      title: "Guideline archived",
      message: `${guideline.title} was archived and is no longer published.`,
      metadata: {
        alertReason: "archived",
      },
    });
  } catch (err) {
    console.error("Notify Guideline Archived Error:", err);
  }
};

const notifyGuidelineRestored = async (req, guideline) => {
  try {
    await createGuidelineNotificationOnce({
      req,
      guideline,
      type: "guideline_restored",
      priority: "normal",
      title: "Guideline restored",
      message: `${guideline.title} was restored as a draft.`,
      metadata: {
        alertReason: "restored",
      },
    });
  } catch (err) {
    console.error("Notify Guideline Restored Error:", err);
  }
};

const notifyGuidelineDeleted = async (req, guideline) => {
  try {
    await createGuidelineNotificationOnce({
      req,
      guideline,
      type: "guideline_deleted",
      priority: "high",
      title: "Guideline deleted",
      message: `${guideline.title} was permanently deleted.`,
      metadata: {
        alertReason: "deleted",
      },
    });
  } catch (err) {
    console.error("Notify Guideline Deleted Error:", err);
  }
};

// CREATE


// GET /published
const getPublishedGuidelines = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const guidelines = await PostingGuideline.find({ status: "published" })
      .sort({ priorityLevel: -1, createdAt: -1 });

    res.json(guidelines.map((item) => toClientGuideline(item, userId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// controllers/GuidelineController.js
const incrementViews = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid userId is required to count a view." });
    }

    const guideline = await PostingGuideline.findOneAndUpdate(
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
    const existing = guideline || (await PostingGuideline.findById(req.params.id));
    if (!existing) return res.status(404).json({ message: "Guideline not found" });
    if (String(existing.status || "").toLowerCase() !== "published") {
      return res.status(404).json({ message: "Guideline not found" });
    }

    existing.views = existing.viewedBy?.length || 0;
    await existing.save();
    res.json(toClientGuideline(existing, userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// ✅ Get all guidelines
const getGuidelines = async (req, res) => {
  try {
    const { status, category, includeAll } = req.query;
    const filter = String(includeAll || "false") === "true" ? {} : { status: "published" };
    const userId = getRequestUserId(req);

    if (status) filter.status = status;
    if (category) filter.category = category;

    const guidelines = await PostingGuideline.find(filter).sort({
      createdAt: -1,
      updatedAt: -1,
    });

    if (filter.status === "published" && isValidObjectId(userId)) {
      await ensureGuidelineNotificationsForUser(userId, guidelines);
    }

    res
      .status(200)
      .json((guidelines || []).map((item) => toClientGuideline(item, userId, filter.status !== "published")));
  } catch (err) {
    console.error("Error fetching guidelines:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get a single guideline by ID
const getGuidelineById = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const filter = { _id: req.params.id };
    if (String(req.query.includeAll || "false") !== "true") {
      filter.status = "published";
    }

    const guideline = await PostingGuideline.findOne(filter)
      .populate("createdBy", "name email");

    if (!guideline) return res.status(404).json({ message: "Guideline not found" });
    res.json(toClientGuideline(guideline, userId));
  } catch (err) {
    console.error("Error fetching guideline:", err);
    res.status(500).json({ error: err.message });
  }
};


// EXPORT PUBLISHED GUIDELINES PDF
const exportPublishedGuidelinesPdf = async (req, res) => {
  try {
    const guidelines = await PostingGuideline.find({ status: "published" }).lean();
    const sorted = sortGuidelines(guidelines);

    const summary = sorted.reduce(
      (acc, item) => {
        acc.totalPublished += 1;
        acc.totalViews += Number(item.views || 0);

        const category = normalizeString(item.category).toLowerCase() || "general";
        acc.categories[category] = (acc.categories[category] || 0) + 1;

        const priority = normalizeString(item.priorityLevel).toLowerCase() || "medium";
        acc.priorities[priority] = (acc.priorities[priority] || 0) + 1;

        return acc;
      },
      {
        totalPublished: 0,
        totalViews: 0,
        categories: {
          earthquake: 0,
          flood: 0,
          typhoon: 0,
          general: 0,
        },
        priorities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="published-guidelines-${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 30,
      bufferPages: true,
    });

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).text("Published Guidelines Report", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).text(
      "Generated from Disaster Relief Management System",
      { align: "center" }
    );

    drawPdfSectionTitle(doc, "Summary");
    drawPdfLabelValue(doc, "Total Published Guidelines", String(summary.totalPublished));
    drawPdfLabelValue(doc, "Total Views", String(summary.totalViews));
    drawPdfLabelValue(doc, "Earthquake", String(summary.categories.earthquake));
    drawPdfLabelValue(doc, "Flood", String(summary.categories.flood));
    drawPdfLabelValue(doc, "Typhoon", String(summary.categories.typhoon));
    drawPdfLabelValue(doc, "General", String(summary.categories.general));
    drawPdfLabelValue(doc, "Critical Priority", String(summary.priorities.critical));
    drawPdfLabelValue(doc, "High Priority", String(summary.priorities.high));
    drawPdfLabelValue(doc, "Medium Priority", String(summary.priorities.medium));
    drawPdfLabelValue(doc, "Low Priority", String(summary.priorities.low));

    drawPdfSectionTitle(doc, "Published Guidelines");

    const columns = [
      { label: "Title", key: "title", width: 170 },
      { label: "Category", key: "category", width: 80 },
      { label: "Priority", key: "priorityLevel", width: 70 },
      { label: "Status", key: "status", width: 70 },
      { label: "Views", key: "views", width: 50, align: "right" },
      { label: "Attachments", key: "attachmentCount", width: 65, align: "right" },
      { label: "Created", key: "createdAt", width: 95 },
      { label: "Updated", key: "updatedAt", width: 95 },
    ];

    if (!sorted.length) {
      doc.font("Helvetica").fontSize(10).text("No published guidelines available.");
    } else {
      let tableColumns = drawSimpleTableHeader(doc, columns);

      sorted.forEach((item) => {
        drawSimpleTableRow(
          doc,
          tableColumns,
          {
            title: normalizeString(item.title) || "-",
            category: formatLabel(item.category),
            priorityLevel: formatLabel(item.priorityLevel),
            status: formatLabel(item.status),
            views: Number(item.views || 0),
            attachmentCount: Array.isArray(item.attachments) ? item.attachments.length : 0,
            createdAt: formatDateValue(item.createdAt),
            updatedAt: formatDateValue(item.updatedAt),
          },
          26
        );
      });
    }

    const withDescriptions = sorted.filter((item) => normalizeString(item.description));

    if (withDescriptions.length) {
      drawPdfSectionTitle(doc, "Descriptions");

      withDescriptions.forEach((item, index) => {
        ensurePdfPageSpace(doc, 55);
        doc.font("Helvetica-Bold").fontSize(10).text(
          `${index + 1}. ${normalizeString(item.title) || "Untitled Guideline"}`
        );
        doc.font("Helvetica").fontSize(10).text(normalizeString(item.description));
        doc.moveDown(0.35);
      });
    }

    const withAttachments = sorted.filter(
      (item) => Array.isArray(item.attachments) && item.attachments.length > 0
    );

    if (withAttachments.length) {
      drawPdfSectionTitle(doc, "Attachment References");

      withAttachments.forEach((item, index) => {
        ensurePdfPageSpace(doc, 45);
        doc.font("Helvetica-Bold").fontSize(10).text(
          `${index + 1}. ${normalizeString(item.title) || "Untitled Guideline"}`
        );
        doc.font("Helvetica").fontSize(10).text(
          item.attachments
            .map((file) => normalizeString(file.fileName) || normalizeString(file.fileUrl) || "Unnamed attachment")
            .join(", ")
        );
        doc.moveDown(0.35);
      });
    }

    ensurePdfPageSpace(doc, 60);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).text(
      `Document generated on ${formatDateValue(new Date())}`,
      { align: "right" }
    );

    doc.end();
  } catch (err) {
    console.error("Error exporting published guidelines PDF:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
};

// UPDATE
const updateGuideline = async (req, res) => {
  try {
    const guideline = await PostingGuideline.findById(req.params.id);

    if (!guideline) {
      return res.status(404).json({ message: "Guideline not found" });
    }

    const previousStatus = getGuidelineStatus(guideline);
    const previousPriority = getGuidelinePriority(guideline);

    let remainingAttachments = guideline.attachments || [];

    if (req.body.removeImages) {
      let removeList = [];

      try {
        removeList = JSON.parse(req.body.removeImages);
      } catch (parseErr) {
        return res.status(400).json({ error: "Invalid removeImages format" });
      }

      if (removeList.length > 0) {
        await Promise.all(
          removeList
            .filter((img) => img?.public_id)
            .map((img) => cloudinary.uploader.destroy(img.public_id))
        );

        remainingAttachments = remainingAttachments.filter(
          (img) => !removeList.some((r) => r.public_id === img.public_id)
        );
      }
    }

    const newAttachments = await uploadFilesToCloudinary(req.files || []);

    guideline.attachments = [...remainingAttachments, ...newAttachments];

    if (typeof req.body.title !== "undefined") guideline.title = req.body.title;
    if (typeof req.body.description !== "undefined") guideline.description = req.body.description;
    if (typeof req.body.category !== "undefined") guideline.category = req.body.category;
    if (typeof req.body.status !== "undefined") guideline.status = req.body.status;
    if (typeof req.body.priorityLevel !== "undefined") {
      guideline.priorityLevel = req.body.priorityLevel;
    }

    await guideline.save();

    await notifyGuidelineUpdated({
      req,
      guideline,
      previousStatus,
      previousPriority,
    });

    return res.status(200).json(guideline);
  } catch (err) {
    console.error("Error updating guideline:", err);
    return res.status(400).json({ error: err.message });
  }
};

// ARCHIVE
const archiveGuideline = async (req, res) => {
  try {
    const guideline = await PostingGuideline.findByIdAndUpdate(
      req.params.id,
      { status: "archived" },
      { new: true }
    );

    if (!guideline) {
      return res.status(404).json({ message: "Guideline not found" });
    }

    await notifyGuidelineArchived(req, guideline);

    return res.status(200).json(guideline);
  } catch (err) {
    console.error("Error archiving guideline:", err);
    return res.status(500).json({ error: err.message });
  }
};

// RESTORE
const restoreGuideline = async (req, res) => {
  try {
    const guideline = await PostingGuideline.findByIdAndUpdate(
      req.params.id,
      { status: "draft" },
      { new: true }
    );

    if (!guideline) {
      return res.status(404).json({ message: "Guideline not found" });
    }

    await notifyGuidelineRestored(req, guideline);

    return res.status(200).json(guideline);
  } catch (err) {
    console.error("Error restoring guideline:", err);
    return res.status(500).json({ error: err.message });
  }
};

// DELETE
const deleteGuideline = async (req, res) => {
  try {
    const guideline = await PostingGuideline.findById(req.params.id);

    if (!guideline) {
      return res.status(404).json({ message: "Guideline not found" });
    }

    // ✅ delete images from Cloudinary
    if (guideline.attachments?.length) {
      await Promise.all(
        guideline.attachments.map(file =>
          cloudinary.uploader.destroy(file.public_id)
        )
      );
    }

    await PostingGuideline.findByIdAndDelete(req.params.id);

    res.json({ message: "Guideline deleted successfully" });
  } catch (err) {
    console.error("Error deleting guideline:", err);
    res.status(500).json({ error: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Valid userId is required to like a post." });
    }

    const guideline = await PostingGuideline.findOne({
      _id: req.params.id,
      status: "published",
    });

    if (!guideline) {
      return res.status(404).json({ message: "Guideline not found" });
    }

    const liked = guideline.likedBy.some((id) => String(id) === String(userId));
    if (liked) {
      guideline.likedBy = guideline.likedBy.filter((id) => String(id) !== String(userId));
    } else {
      guideline.likedBy.addToSet(userId);
    }

    await guideline.save();
    return res.json(toClientGuideline(guideline, userId));
  } catch (err) {
    console.error("Error toggling guideline like:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createGuideline,
  getGuidelines,
  getGuidelineById,
  updateGuideline,
  deleteGuideline,
  incrementViews,
  toggleLike,
  getPublishedGuidelines,
  exportPublishedGuidelinesPdf,
  archiveGuideline,
  restoreGuideline,
};
