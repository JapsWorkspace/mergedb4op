const IncidentModel = require("../models/Incident");
const HistoryModel = require("../models/History");
const UserModel = require("../models/User");
const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const dispatchMultiChannelNotification = require("../utils/dispatchMultiChannelNotification");
const { sendExpoPushNotifications } = require("../utils/sendExpoPushNotifications");
const {
  buildIncidentSmsMessage,
  buildIncidentEmail,
  buildClusterSmsMessage,
  buildClusterEmail,
  getIncidentLocationLabel,
} = require("../utils/notificationMessageBuilders");
const axios = require("axios");
const Notification = require("../models/Notification");
const createNotification = require("../utils/createNotification");


const exif = require("exif-parser");
const { verifyIncidentImage } = require("../utils/verifyIncidentImage");
const INCIDENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_VERIFY_INTERVAL_MS = 2 * 60 * 1000;
const AUTO_VERIFY_BATCH_SIZE = 5;

const DUPLICATE_INCIDENT_RADIUS_METERS = 200;
const INCIDENT_USER_ALERT_RADIUS_METERS = 1000;
const INCIDENT_USER_ALERT_RECENT_HOURS = 24;
const INCIDENT_CLUSTER_RECENT_HOURS = 6;
const INCIDENT_CLUSTER_RADIUS_METERS = 3500;
const INCIDENT_CLUSTER_THRESHOLDS = [
  { count: 10, level: "danger" },
  { count: 8, level: "warning" },
  { count: 5, level: "caution" },
];
const BARANGAY_DANGER_THRESHOLDS = [
  { count: 10, level: "severe" },
  { count: 6, level: "danger" },
  { count: 3, level: "caution" },
];
const DUPLICATE_ACTIVE_STATUSES = [
  "pending",
  "reported",
  "on process",
  "in progress",
  "ongoing",
  "active",
  "approved",
];
const DUPLICATE_CLOSED_STATUSES = [
  "resolved",
  "closed",
  "cancelled",
  "canceled",
  "rejected",
  "dismissed",
  "invalid",
];

const BARANGAY_BY_DISTRICT = {
  "District 1": [
    "Bagong Sikat",
    "Balbalino",
    "Banganan",
    "Langla",
    "Mabini",
    "Maligaya",
    "Santo Tomas South",
  ],
  "District 2": [
    "Imbunia",
    "Lambakin",
    "Marawa",
    "Naglabrahan",
    "San Josef",
    "San Roque",
    "Santo Tomas North",
  ],
  "District 3": [
    "Don Mariano Marcos",
    "Hilera",
    "Pinanggaan",
    "San Andres",
    "San Nicolas",
    "Ulanin-Pitak",
  ],
  "District 4": [
    "Calabasa",
    "Kasanglayan",
    "Pamacpacan",
    "Putlod",
    "Sapang",
  ],
};

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeText(value, max = 200) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[<>{}[\]`$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function sanitizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^63/, "")
    .replace(/^0+/, "")
    .slice(0, 10);
}

function sanitizeIncidentText(value, max = 500) {
  return sanitizeText(value, max).replace(/[^A-Za-z0-9\s,.\-()/#]/g, "");
}

function sanitizeAlphaNumericText(value, max = 120) {
  return sanitizeText(value, max).replace(/[^A-Za-z0-9\s-]/g, "");
}

function normalizeBarangayName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[._-]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\bbrgy\b/g, "barangay")
    .trim();
}

function stripBarangayPrefix(value) {
  return normalizeBarangayName(value).replace(/^barangay\s+/, "").trim();
}

function toObjectIdOrNull(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value))
    ? value
    : null;
}

function buildIncidentAddress({ district, barangay, street, location }) {
  const cleanDistrict = sanitizeText(district, 80);
  const cleanBarangay = sanitizeAlphaNumericText(barangay, 80);
  const cleanStreet = sanitizeIncidentText(street, 160);
  const cleanLocation = sanitizeIncidentText(location, 220);

  if (cleanStreet || cleanBarangay || cleanDistrict) {
    return [cleanStreet, cleanBarangay, cleanDistrict, "Jaen, Nueva Ecija"]
      .filter(Boolean)
      .join(", ");
  }

  return cleanLocation;
}

function normalizeNotificationType(type) {
  return String(type || "system").trim().toLowerCase();
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const PUBLIC_INCIDENT_QUERY = {
  $or: [
    { isPublic: true },
    { forceApproved: true },
    { approvedByMDRRMO: true },
    { status: /^approved$/i },
  ],
};

function isPublicIncident(incident) {
  const status = normalizeStatus(incident?.status);

  return (
    incident?.isPublic === true ||
    incident?.forceApproved === true ||
    incident?.approvedByMDRRMO === true ||
    status === "approved"
  );
}

function normalizeIncidentType(type) {
  const clean = sanitizeText(type, 60).toLowerCase();
  if (clean.includes("flood")) return "flood";
  if (clean.includes("fire")) return "fire";
  if (clean.includes("earthquake")) return "earthquake";
  if (clean.includes("typhoon") || clean.includes("storm")) return "typhoon";
  if (clean.includes("accident") || clean.includes("collision")) return "accident";
  if (
    clean.includes("road_block") ||
    clean.includes("road block") ||
    clean.includes("blockage") ||
    clean.includes("obstruction")
  ) {
    return "road_block";
  }
  return clean || "incident";
}

function formatIncidentTypeLabel(type) {
  const category = normalizeIncidentType(type);
  return category
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Incident";
}

function getBarangayDangerThreshold(count) {
  return BARANGAY_DANGER_THRESHOLDS.find((item) => count >= item.count) || null;
}

function getIncidentClusterThreshold(count) {
  return INCIDENT_CLUSTER_THRESHOLDS.find((item) => count >= item.count) || null;
}

function toPlainObject(document) {
  return typeof document?.toObject === "function"
    ? document.toObject({ virtuals: true })
    : document;
}

function getNotificationStorageDebugInfo() {
  return {
    dbName: mongoose.connection?.name || "",
    notificationCollection: UserModel.collection?.name || "users",
    notificationPath: "users.notifications",
  };
}

function getDistrictBarangays(district) {
  return BARANGAY_BY_DISTRICT[sanitizeText(district, 80)] || [];
}

function uniqueNormalizedBarangays(barangays) {
  const seen = new Set();
  return barangays.filter((name) => {
    const key = sanitizeText(name, 80).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getIncidentClusterMessage(type, barangayCount) {
  const category = normalizeIncidentType(type);
  if (category === "flood") {
    return "Multiple nearby barangays have reported flooding. Stay alert.";
  }

  return `${barangayCount} barangays have reported the same incident nearby. Be careful.`;
}

function getBarangayDangerMessage(type) {
  switch (normalizeIncidentType(type)) {
    case "flood":
      return "Warning: Multiple flood reports have been recorded in your barangay. Avoid flooded areas and stay alert.";
    case "fire":
      return "Warning: Multiple fire reports have been recorded in your barangay. Stay away from affected areas.";
    case "earthquake":
      return "Warning: Multiple earthquake-related reports have been recorded in your barangay. Check your surroundings and stay alert.";
    case "typhoon":
      return "Warning: Multiple typhoon-related hazards have been reported in your barangay. Stay indoors if possible.";
    default:
      return "Warning: Multiple incidents have been reported in your barangay. Please stay alert.";
  }
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceMeters(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;

  const lat1 = Number(pointA.latitude);
  const lon1 = Number(pointA.longitude);
  const lat2 = Number(pointB.latitude);
  const lon2 = Number(pointB.longitude);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildCoordinateBox(latitude, longitude, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta =
    radiusMeters /
    (111320 * Math.max(Math.cos(toRadians(latitude)), 0.00001));

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}

async function findDuplicateIncident({ type, latitude, longitude }) {
  const normalizedType = normalizeIncidentType(type);
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !normalizedType ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  const point = { latitude: lat, longitude: lng };
  const box = buildCoordinateBox(lat, lng, DUPLICATE_INCIDENT_RADIUS_METERS);

  const candidates = await IncidentModel.find({
    latitude: { $gte: box.minLat, $lte: box.maxLat },
    longitude: { $gte: box.minLng, $lte: box.maxLng },
    $or: [
      ...PUBLIC_INCIDENT_QUERY.$or,
      { status: { $in: DUPLICATE_ACTIVE_STATUSES } },
      { status: /^pending$/i },
      { status: /^reported$/i },
      { status: /^on[ _-]?process$/i },
      { status: /^in[ _-]?progress$/i },
      { status: /^ongoing$/i },
      { status: /^active$/i },
    ],
  })
    .sort({ createdAt: -1 })
    .select(
      "_id type status aiStatus isPublic forceApproved approvedByMDRRMO latitude longitude location createdAt"
    );

  return candidates.find(
    (incident) =>
      normalizeIncidentType(incident.type) === normalizedType &&
      !DUPLICATE_CLOSED_STATUSES.includes(normalizeStatus(incident.status)) &&
      (isPublicIncident(incident) ||
        DUPLICATE_ACTIVE_STATUSES.includes(normalizeStatus(incident.status))) &&
      distanceMeters(point, {
        latitude: incident.latitude,
        longitude: incident.longitude,
      }) <= DUPLICATE_INCIDENT_RADIUS_METERS
  );
}

async function verifyIncidentImageWithAI({ incident, image }) {
  const aiEndpoint = sanitizeText(process.env.INCIDENT_AI_VERIFY_URL, 300);

  if (!image?.fileUrl) {
    return {
      aiStatus: "rejected",
      score: 0,
      labels: [],
      reason: "No image evidence was uploaded.",
    };
  }

  if (!aiEndpoint) {
    return {
      aiStatus: "approved",
      score: 1,
      labels: [normalizeIncidentType(incident?.type)],
      reason: "Image evidence received and accepted by local AI verification fallback.",
    };
  }

  const fetch = require("node-fetch");
  const response = await fetch(aiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.INCIDENT_AI_VERIFY_TOKEN
        ? { Authorization: `Bearer ${process.env.INCIDENT_AI_VERIFY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      incidentId: String(incident?._id || ""),
      type: incident?.type,
      level: incident?.level,
      barangay: incident?.barangay,
      district: incident?.district,
      latitude: incident?.latitude,
      longitude: incident?.longitude,
      imageUrl: image.fileUrl,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "AI verification failed.");
  }

  const status = String(data?.aiStatus || data?.status || "")
    .trim()
    .toLowerCase();

  return {
    aiStatus: status === "approved" ? "approved" : "rejected",
    score: Number.isFinite(Number(data?.score)) ? Number(data.score) : null,
    labels: Array.isArray(data?.labels)
      ? data.labels.map((label) => sanitizeText(label, 80)).filter(Boolean)
      : [],
    reason: sanitizeText(data?.reason || data?.message, 500),
  };
}

async function publishIncidentIfPublic(incident, { excludeUsername = "", excludePhone = "" } = {}) {
  if (!isPublicIncident(incident)) return;

  await notifyUsersInSameBarangay({
    incident,
    excludeUsername,
    excludePhone,
  });
  await notifyNearbyRepeatedIncidents(incident);
  await notifyBarangayIncidentDangerThreshold(incident);
}

async function getIncidentReporterUserId(incident) {
  const reporterUserId = toObjectIdOrNull(incident?.reporterUserId);
  if (reporterUserId) return String(reporterUserId);

  const fallbackUserId = toObjectIdOrNull(incident?.userId);
  if (fallbackUserId) return String(fallbackUserId);

  const reportedBy = toObjectIdOrNull(incident?.reportedBy);
  return reportedBy ? String(reportedBy) : null;
}

function getIncidentApprovalDedupeKey(incidentId, reporterUserId) {
  return `incident-approved-${incidentId}-${reporterUserId}`;
}

async function hasIncidentApprovalNotification(incidentId, reporterUserId, dedupeKey) {
  const incidentObjectId = toObjectIdOrNull(incidentId);
  const reporterObjectId = toObjectIdOrNull(reporterUserId);

  if (!incidentObjectId || !reporterObjectId) return false;

  return Boolean(
    await UserModel.exists({
      _id: reporterObjectId,
      $or: [
        {
          notifications: {
            $elemMatch: {
              type: "incident_approved",
              referenceId: incidentObjectId,
              recipientUser: reporterObjectId,
            },
          },
        },
        {
          notifications: {
            $elemMatch: {
              type: "incident_approved",
              incidentId: incidentObjectId,
              targetUsers: reporterObjectId,
            },
          },
        },
        {
          notifications: {
            $elemMatch: {
              type: "incident_approved",
              dedupeKey,
            },
          },
        },
      ],
    })
  );
}

function emitIncidentApproved(req, incident, reporterUserId = null, notification = null) {
  const io = req.app.get("io");
  if (!io || !incident) return;

  const payload = toPlainObject(incident);
  const notificationPayload = notification ? toPlainObject(notification) : null;

  io.emit("incident:updated", payload);
  io.emit("incident:approved", payload);
  io.emit("incidentApproved", payload);

  if (reporterUserId) {
    const reporterRoom = String(reporterUserId);
    io.to(reporterRoom).emit("myIncidentApproved", payload);
    if (notificationPayload) {
      io.to(reporterRoom).emit("notification:new", notificationPayload);
    }
  }

  console.log("[incident socket emitted]", {
    id: String(payload?._id || ""),
    reporterUserId: reporterUserId ? String(reporterUserId) : "",
    events: [
      "incident:updated",
      "incident:approved",
      "incidentApproved",
      ...(reporterUserId ? ["myIncidentApproved"] : []),
      ...(notificationPayload ? ["notification:new"] : []),
    ],
  });
}

async function notifyReporterIncidentApproved(req, incident) {
  try {
    const reporterUserId = await getIncidentReporterUserId(incident);
    let notification = null;

    if (!reporterUserId) {
      console.log("[reporter approval notification skipped no reporter]", {
        incidentId: String(incident?._id || ""),
        reporterUserId: incident?.reporterUserId || null,
        userId: incident?.userId || null,
      });
      emitIncidentApproved(req, incident, null, null);
      return;
    }

    const dedupeKey = getIncidentApprovalDedupeKey(incident._id, reporterUserId);
    const alreadyNotified = await hasIncidentApprovalNotification(
      incident._id,
      reporterUserId,
      dedupeKey
    );

    if (alreadyNotified) {
      console.log("[reporter approval notification skipped duplicate]", {
        incidentId: String(incident._id),
        reporterUserId: String(reporterUserId),
        ...getNotificationStorageDebugInfo(),
      });
      emitIncidentApproved(req, incident, reporterUserId, null);
      return;
    }

    notification = await addNotification(reporterUserId, {
      type: "incident_approved",
      module: "incident",
      priority: "normal",
      title: "Incident Report Verified",
      message:
        "Your reported incident has been reviewed and verified by the MDRRMO. It has been approved as a valid incident and is now visible on the public map for community awareness.",
      referenceId: incident._id,
      referenceModel: "Incident",
      recipientUser: reporterUserId,
      recipientUserModel: "User",
      sourceLabel: "Incident Alert",
      source: "incident",
      official: true,
      notificationType: "danger",
      soundType: "danger",
      incidentId: incident._id,
      targetUsers: [reporterUserId],
      dedupeKey,
      actionable: false,
      metadata: {
        incidentId: incident._id,
        incidentType: incident.type || "",
        location: incident.location || "",
        approvalStatus: "approved",
        sendSms: true,
        deliveryChannels: ["sms", "email"],
      },
    });

    if (notification) {
      console.log("[reporter approval notification created]", {
        incidentId: String(incident._id),
        reporterUserId: String(reporterUserId),
        notificationId: String(notification._id || ""),
        ...getNotificationStorageDebugInfo(),
      });

      const reporterUser = await UserModel.findById(reporterUserId).select(
        "_id email phone phoneNumber notificationTokens fname lname barangay district address street streetAddress"
      );
      const sendEmail =
        req.body?.sendEmail === undefined ? true : parseBoolean(req.body?.sendEmail);
      const sendSms = req.body?.sendSms === undefined ? true : parseBoolean(req.body?.sendSms);

      if (reporterUser && (sendEmail || sendSms)) {
        await dispatchMultiChannelNotification({
          users: [reporterUser],
          title: "Incident Report Verified",
          message:
            "Your reported incident has been reviewed and verified by the MDRRMO. It has been approved as a valid incident and is now visible on the public map for community awareness.",
          type: "incident_approved",
          referenceId: incident._id,
          notificationId: notification._id,
          urgent: true,
          sendSms,
          sendEmail,
          barangay: incident.barangay || reporterUser.barangay || "",
          incidentType: formatIncidentTypeLabel(incident.type),
          incident,
        });

        await sendExpoPushNotifications([reporterUser], {
          title: "Incident Report Verified",
          body:
            "Your reported incident has been reviewed and verified by the MDRRMO.",
          priority: "high",
          soundType: "danger",
          data: {
            type: "incident_approved",
            soundType: "danger",
            incidentId: String(incident._id),
            referenceId: String(incident._id),
            screen: "Map",
          },
        });
      }
    } else {
      console.log("[reporter approval notification skipped duplicate]", {
        incidentId: String(incident._id),
        reporterUserId: String(reporterUserId),
        reason: "dedupe_update_noop",
        ...getNotificationStorageDebugInfo(),
      });
    }

    emitIncidentApproved(req, incident, reporterUserId, notification);
  } catch (err) {
    console.error("[reporter approval notification error]", {
      incidentId: String(incident?._id || ""),
      reporterUserId: incident?.reporterUserId || null,
      userId: incident?.userId || null,
      message: err?.message || err,
      ...getNotificationStorageDebugInfo(),
    });
    emitIncidentApproved(req, incident, null, null);
  }
}

async function applyIncidentAIResult(incidentId, aiResult) {
  const aiStatus = aiResult.aiStatus === "approved" ? "approved" : "rejected";

  const incident = await IncidentModel.findByIdAndUpdate(
    incidentId,
    {
      aiStatus,
      isPublic: false,
      aiReview: {
        status: aiStatus,
        score: aiResult.score,
        labels: aiResult.labels || [],
        reason:
          aiResult.reason ||
          (aiStatus === "approved"
            ? "Approved by AI verification."
            : "Rejected by AI verification."),
        reviewedAt: new Date(),
      },
    },
    { new: true }
  );

  console.log("[ai result]", {
    id: String(incident?._id || incidentId),
    aiStatus,
    score: aiResult.score,
    reason: aiResult.reason || "",
  });
  console.log("[public status]", {
    id: String(incident?._id || incidentId),
    isPublic: incident?.isPublic === true,
    aiStatus: incident?.aiStatus,
    forceApproved: incident?.forceApproved === true,
    approvedByMDRRMO: incident?.approvedByMDRRMO === true,
  });

  return incident;
}

async function addNotification(userId, notification) {
  if (!userId) return;

  const notificationType = normalizeNotificationType(notification.type);
  const dedupeKey = sanitizeText(notification.dedupeKey, 180);
  const referenceId = toObjectIdOrNull(
    notification.referenceId ||
      notification.incidentId ||
      notification.guidelineId ||
      notification.announcementId
  );
  const recipientUser = toObjectIdOrNull(notification.recipientUser || userId);
  const notificationDoc = {
    _id: new mongoose.Types.ObjectId(),
    type: notificationType,
    module: notification.module || "",
    message: notification.message,
    title: notification.title || "",
    sourceLabel: notification.sourceLabel || "",
    source: notification.source || "",
    official: Boolean(notification.official),
    notificationType: notification.notificationType || "normal",
    priority: notification.priority || "normal",
    soundType: notification.soundType || "notification",
    incidentId: notification.incidentId || null,
    referenceId: referenceId || null,
    referenceModel: notification.referenceModel || "",
    recipientUser: recipientUser || null,
    recipientUserModel: notification.recipientUserModel || "",
    targetBarangays: Array.isArray(notification.targetBarangays)
      ? notification.targetBarangays
      : [],
    targetUsers: Array.isArray(notification.targetUsers)
      ? notification.targetUsers
      : [],
    connectionId: notification.connectionId || null,
    actorUserId: notification.actorUserId || null,
    actorName: notification.actorName || "",
    actorUsername: notification.actorUsername || "",
    actorAvatar: notification.actorAvatar || "",
    connectionCode: notification.connectionCode || "",
    actionable: Boolean(notification.actionable),
    handledAt: notification.handledAt || null,
    dedupeKey,
    metadata:
      notification.metadata && typeof notification.metadata === "object"
        ? notification.metadata
        : {},
    read: false,
    isRead: false,
    createdAt: new Date(),
  };
  const filter = dedupeKey
    ? { _id: userId, "notifications.dedupeKey": { $ne: dedupeKey } }
    : { _id: userId };

  const result = await UserModel.updateOne(filter, {
    $push: {
      notifications: notificationDoc,
    },
  });

  return result.modifiedCount > 0 ? notificationDoc : null;
}

async function notifyUsersInSameBarangay({ incident }) {
  try {
    if (!isPublicIncident(incident)) return;
    const barangay = sanitizeText(incident?.barangay, 80);
    const targetBarangay = normalizeBarangayName(barangay);

    if (!targetBarangay) {
      console.log("[incident barangay notification target]", {
        incidentId: String(incident?._id || ""),
        incidentBarangay: incident?.barangay || "",
        normalizedBarangay: targetBarangay,
        matchedUsers: 0,
      });
      return;
    }

    const users = await UserModel.find({
      isArchived: { $ne: true },
    }).select(
      "_id email phone phoneNumber notificationTokens barangay district address street streetAddress fname lname username notifications"
    );

    const targetBarangayShort = stripBarangayPrefix(targetBarangay);
    const seenUserIds = new Set();
    const barangayUsers = users.filter((user) => {
      const userId = String(user?._id || "");
      if (!userId || seenUserIds.has(userId)) return false;

      const userBarangay = normalizeBarangayName(user?.barangay);
      const userBarangayShort = stripBarangayPrefix(user?.barangay);
      const userAddress = normalizeBarangayName(
        [
          user?.address,
          user?.streetAddress,
          user?.street,
          user?.district,
        ]
          .filter(Boolean)
          .join(" ")
      );
      const matched =
        userBarangay === targetBarangay ||
        (userBarangayShort &&
          targetBarangayShort &&
          userBarangayShort === targetBarangayShort) ||
        (!userBarangay &&
          (userAddress.includes(targetBarangay) ||
            (targetBarangayShort && userAddress.includes(targetBarangayShort))));

      if (matched) {
        seenUserIds.add(userId);
      }

      return matched;
    });

    console.log("[incident barangay notification target]", {
      incidentId: String(incident._id),
      incidentBarangay: incident.barangay,
      normalizedBarangay: targetBarangay,
      matchedUsers: barangayUsers.length,
    });

    if (!barangayUsers.length) return;

    const notificationType = normalizeNotificationType("incident_barangay_alert");
    const incidentType = formatIncidentTypeLabel(incident?.type);
    const incidentLocation = sanitizeIncidentText(
      incident?.location ||
        buildIncidentAddress({
          district: incident?.district,
          barangay: incident?.barangay,
          street: incident?.street || incident?.streetAddress,
          location: incident?.location,
        }),
      220
    );
    const title = "Incident Alert in Your Barangay";
    const message =
      "A verified incident has been reported in your barangay. Please stay alert and follow MDRRMO instructions.";
    const incidentEmail = buildIncidentEmail(incident);

    const notificationResults = await Promise.all(
      barangayUsers.map((user) =>
        addNotification(user._id, {
          type: notificationType,
          module: "incident",
          priority: "high",
          title,
          message,
          sourceLabel: "Incident Alert",
          source: "incident",
          official: true,
          notificationType: "danger",
          soundType: "danger",
          incidentId: incident._id,
          referenceId: incident._id,
          referenceModel: "Incident",
          recipientUser: user._id,
          recipientUserModel: "User",
          targetBarangays: barangay ? [barangay] : [],
          targetUsers: [user._id],
          dedupeKey: `inapp:incident_barangay_alert:${incident._id}:${user._id}`,
          actionable: false,
          metadata: {
            incidentId: incident._id,
            incidentType,
            location: incidentLocation,
            barangay,
            approvalStatus: "approved",
            sendSms: true,
            deliveryChannels: ["sms", "email"],
          },
        })
      )
    );
    const deliveryTargets = barangayUsers.filter((_, index) => notificationResults[index]);

    await dispatchMultiChannelNotification({
      users: deliveryTargets,
      title,
      message,
      type: "incident_barangay_alert",
      referenceId: incident._id,
      urgent: true,
      sendSms: true,
      sendEmail: true,
      barangay,
      incidentType,
      incidentLocation,
      incident,
      smsMessage: buildIncidentSmsMessage(incident),
      emailSubject: incidentEmail.subject,
      emailMessage: incidentEmail.message,
      emailHtml: incidentEmail.html,
    });

    await sendExpoPushNotifications(deliveryTargets, {
      title,
      body: message,
      priority: "high",
      soundType: "danger",
      data: {
        type: "barangay_incident_danger",
        soundType: "danger",
        incidentId: String(incident._id),
        referenceId: String(incident._id),
        screen: "Map",
      },
    });

    console.log(
      `[incident notify] Sent ${deliveryTargets.length} incident_barangay_alert notifications for barangay ${barangay}.`
    );
  } catch (err) {
    console.error("Incident barangay notification error:", err);
  }
}

async function notifyNearbyRepeatedIncidents(incident) {
  try {
    if (!isPublicIncident(incident)) return;

    const type = normalizeIncidentType(incident?.type);
    const barangay = sanitizeText(incident?.barangay, 80);
    const district = sanitizeText(incident?.district, 80);
    if (!type || !barangay) return;

    const since = new Date(
      Date.now() - INCIDENT_CLUSTER_RECENT_HOURS * 60 * 60 * 1000
    );
    const incidentPoint = {
      latitude: Number(incident?.latitude),
      longitude: Number(incident?.longitude),
    };
    const districtBarangays = getDistrictBarangays(district);
    const recentPublicReports = await IncidentModel.find({
      ...PUBLIC_INCIDENT_QUERY,
      barangay: { $ne: "" },
      createdAt: { $gte: since },
    }).select(
      "_id type district barangay latitude longitude aiStatus isPublic forceApproved approvedByMDRRMO createdAt"
    );

    const clusterReports = recentPublicReports.filter((candidate) => {
      if (!isPublicIncident(candidate)) return false;
      if (normalizeIncidentType(candidate?.type) !== type) return false;

      const candidateBarangay = sanitizeText(candidate?.barangay, 80);
      const candidateDistrict = sanitizeText(candidate?.district, 80);
      const sameBarangay =
        candidateBarangay.toLowerCase() === barangay.toLowerCase();
      const sameDistrict =
        district && candidateDistrict && candidateDistrict.toLowerCase() === district.toLowerCase();
      const listedNearby =
        districtBarangays.length &&
        districtBarangays.some(
          (name) => name.toLowerCase() === candidateBarangay.toLowerCase()
        );
      const candidatePoint = {
        latitude: Number(candidate?.latitude),
        longitude: Number(candidate?.longitude),
      };
      const closeByCoordinate =
        Number.isFinite(incidentPoint.latitude) &&
        Number.isFinite(incidentPoint.longitude) &&
        Number.isFinite(candidatePoint.latitude) &&
        Number.isFinite(candidatePoint.longitude) &&
        distanceMeters(incidentPoint, candidatePoint) <= INCIDENT_CLUSTER_RADIUS_METERS;

      return sameBarangay || sameDistrict || listedNearby || closeByCoordinate;
    });

    const totalReports = clusterReports.length;
    const threshold = getIncidentClusterThreshold(totalReports);
    if (!threshold) return;

    const previousThreshold = getIncidentClusterThreshold(Math.max(0, totalReports - 1));
    if (previousThreshold?.level === threshold.level) return;

    const clusterBarangays = uniqueNormalizedBarangays(
      clusterReports.map((item) => sanitizeText(item?.barangay, 80))
    );
    const barangayCount = clusterBarangays.length;
    if (barangayCount < 2) return;

    const affectedBarangays = uniqueNormalizedBarangays([
      ...clusterBarangays,
      ...districtBarangays,
    ]);
    const barangayGroupKey = clusterBarangays
      .map((name) => name.toLowerCase())
      .sort()
      .join("|");
    const dedupeKey = `incident-cluster:${type}:${barangayGroupKey}:${threshold.level}`;
    const users = await UserModel.find({
      barangay: {
        $in: affectedBarangays.map((name) => new RegExp(`^${escapeRegex(name)}$`, "i")),
      },
      isArchived: { $ne: true },
    }).select("_id email phone phoneNumber notificationTokens barangay district address street streetAddress");

    if (!users.length) {
      console.log("[incident notify] No users found for incident cluster:", dedupeKey);
      return;
    }

    const clusterLandmark = getIncidentLocationLabel(incident);
    const clusterLocations = clusterReports.map((item) => getIncidentLocationLabel(item));
    const message = getIncidentClusterMessage(type, barangayCount);
    const clusterSmsMessage = buildClusterSmsMessage({
      type,
      barangay,
      landmark: clusterLandmark,
    });
    const clusterEmail = buildClusterEmail({
      type: formatIncidentTypeLabel(type),
      barangay,
      barangays: affectedBarangays,
      locations: clusterLocations,
      landmark: clusterLandmark,
      count: totalReports,
    });

    const notificationResults = await Promise.all(
      users.map((user) =>
        addNotification(user._id, {
          type: "nearby_repeated_incident",
          title: "Multiple incident reports nearby",
          message,
          sourceLabel: "Incident Alert",
          source: "incident",
          official: true,
          notificationType: "danger",
          soundType: "danger",
          incidentId: incident._id,
          targetBarangays: affectedBarangays,
          targetUsers: [user._id],
          dedupeKey,
          actionable: false,
          metadata: {
            sendSms: true,
            deliveryChannels: ["sms", "email"],
          },
        })
      )
    );
    const deliveryTargets = users.filter((_, index) => notificationResults[index]);

    await dispatchMultiChannelNotification({
      users: deliveryTargets,
      title: "Multiple incident reports nearby",
      message,
      type: "clustered_incident",
      referenceId: dedupeKey,
      urgent: true,
      sendSms: true,
      sendEmail: true,
      barangay,
      incidentType: formatIncidentTypeLabel(type),
      clusterBarangays: affectedBarangays,
      clusterLocations,
      clusterCount: totalReports,
      clusterLandmark,
      smsMessage: clusterSmsMessage,
      emailSubject: clusterEmail.subject,
      emailMessage: clusterEmail.message,
      emailHtml: clusterEmail.html,
    });

    await sendExpoPushNotifications(deliveryTargets, {
      title: "Multiple incident reports nearby",
      body: message,
      priority: "high",
      soundType: "danger",
      data: {
        type: "nearby_repeated_incident",
        soundType: "danger",
        incidentId: String(incident._id),
        referenceId: String(incident._id),
        screen: "Map",
      },
    });

    console.log(
      `[incident notify] Cluster ${threshold.level} sent for ${type}: ${totalReports} public reports across ${barangayCount} barangays.`
    );
  } catch (err) {
    console.error("Nearby repeated incident notification error:", err);
  }
}

async function notifyBarangayIncidentDangerThreshold(incident) {
  try {
    if (!isPublicIncident(incident)) return;

    const barangay = sanitizeAlphaNumericText(incident?.barangay, 80);
    if (!barangay) return;

    const stats = await IncidentModel.aggregate([
      {
        $match: {
          ...PUBLIC_INCIDENT_QUERY,
          barangay: { $regex: new RegExp(`^${escapeRegex(barangay)}$`, "i") },
        },
      },
      {
        $group: {
          _id: { $toLower: "$type" },
          type: { $first: "$type" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const totalCount = stats.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const threshold = getBarangayDangerThreshold(totalCount);
    if (!threshold) return;

    const previousThreshold = getBarangayDangerThreshold(Math.max(0, totalCount - 1));
    if (previousThreshold?.level === threshold.level) return;

    const dominant = stats[0] || {};
    const dominantType = normalizeIncidentType(dominant.type);
    const dedupeKey = `barangay-danger:${barangay.toLowerCase()}:${dominantType}:${threshold.level}`;

    const users = await UserModel.find({
      barangay: { $regex: new RegExp(`^${escapeRegex(barangay)}$`, "i") },
      isArchived: { $ne: true },
    }).select("_id email phone phoneNumber notificationTokens barangay district address street streetAddress");

    if (!users.length) {
      console.log("[incident notify] No users found for barangay danger threshold:", barangay);
      return;
    }

    const clusterLandmark = getIncidentLocationLabel(incident);
    const message = getBarangayDangerMessage(dominantType);
    const clusterSmsMessage = buildClusterSmsMessage({
      type: dominantType,
      barangay,
      landmark: clusterLandmark,
    });
    const clusterEmail = buildClusterEmail({
      type: formatIncidentTypeLabel(dominantType),
      barangay,
      barangays: [barangay],
      locations: [clusterLandmark],
      landmark: clusterLandmark,
      count: totalCount,
    });

    const notificationResults = await Promise.all(
      users.map((user) =>
        addNotification(user._id, {
          type: "barangay_incident_danger",
          title: "Barangay danger warning",
          message,
          sourceLabel: "Incident Alert",
          source: "incident",
          official: true,
          notificationType: "danger",
          soundType: "danger",
          incidentId: incident._id,
          targetBarangays: [barangay],
          targetUsers: [user._id],
          dedupeKey,
          actionable: false,
          metadata: {
            sendSms: true,
            deliveryChannels: ["sms", "email"],
          },
        })
      )
    );
    const deliveryTargets = users.filter((_, index) => notificationResults[index]);

    await dispatchMultiChannelNotification({
      users: deliveryTargets,
      title: "Barangay danger warning",
      message,
      type: "clustered_incident",
      referenceId: dedupeKey,
      urgent: true,
      sendSms: true,
      sendEmail: true,
      barangay,
      incidentType: formatIncidentTypeLabel(dominantType),
      clusterBarangays: [barangay],
      clusterLocations: [clusterLandmark],
      clusterCount: totalCount,
      clusterLandmark,
      smsMessage: clusterSmsMessage,
      emailSubject: clusterEmail.subject,
      emailMessage: clusterEmail.message,
      emailHtml: clusterEmail.html,
    });

    await sendExpoPushNotifications(deliveryTargets, {
      title: "Barangay danger warning",
      body: message,
      priority: "high",
      soundType: "danger",
      data: {
        type: "barangay_incident_danger",
        soundType: "danger",
        incidentId: String(incident._id),
        referenceId: String(incident._id),
        screen: "Map",
      },
    });

    console.log(
      `[incident notify] Barangay danger threshold ${threshold.level} reached for ${barangay}: ${totalCount} public reports, dominant ${dominantType}.`
    );
  } catch (err) {
    console.error("Barangay incident danger threshold notification error:", err);
  }
}

async function uploadIncidentFile(file) {
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "evacuation_app/incidents" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    ).end(file.buffer);
  });

  return {
    fileName: file.originalname,
    fileUrl: result.secure_url,
    public_id: result.public_id,
  };
}


const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeRole = (value) => {
  return normalizeString(value).toLowerCase();
};

const safeLower = (value) => normalizeString(value).toLowerCase();

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

const generateReasoning = (v) => {
  if (!v) return "No verification data";

  if (!v.isMatch) {
    return "Rejected: Image does not match the reported incident type.";
  }

  if (!v.metadata?.gps && !v.metadata?.timestamp) {
    return "Weak evidence: Missing GPS and timestamp metadata.";
  }

  if (!v.metadataFlags?.isWithinArea) {
    return "Outside monitored area (Jaen).";
  }

  if (!v.metadataFlags?.isRecent) {
    return "Image is not recent (older than 24 hours).";
  }

  if (v.status === "approved") {
    return `Approved: High confidence (${v.confidence}%) with labels: ${v.matchedLabels.join(", ")}`;
  }

  return `Pending: Partial match (${v.confidence}%) — needs manual review.`;
};

const buildStoredVerification = (verification) => {
  if (!verification) return undefined;

  return {
    status: verification.status || "pending",
    confidence: verification.confidence || 0,
    labels: verification.labels || [],
    matchedLabels: verification.matchedLabels || [],
    isMatch: verification.isMatch || false,
    score: verification.confidence || 0,
    reasoning: generateReasoning(verification),
    metadata: {
      hasGPS: verification.metadataFlags?.hasLocation || false,
      isRecent: verification.metadataFlags?.isRecent || false,
      isWithinArea: verification.metadataFlags?.isWithinArea || false,
      device: verification.metadata?.device || null,
      width: verification.metadata?.width || null,
      height: verification.metadata?.height || null,
      timestamp: verification.metadata?.timestamp || null,
    },
  };
};

const applyVerificationOutcome = (incident, verificationResult) => {
  if (!incident || !verificationResult) return incident;

  incident.verification = buildStoredVerification(verificationResult);

  const status = normalizeString(incident.verification?.status).toLowerCase();

  if (status === "approved") {
    incident.set("isPublic", true);
    incident.set("approvedByMDRRMO", true);
    incident.set("forceApproved", true);
  } else if (status === "rejected") {
    incident.set("isPublic", false);
    incident.set("approvedByMDRRMO", false);
    incident.set("forceApproved", false);

    if (normalizeString(incident.status).toLowerCase() === "approved") {
      incident.status = "reported";
    }
  } else {
    incident.set("isPublic", false);
    incident.set("approvedByMDRRMO", false);
    incident.set("forceApproved", false);
  }

  return incident;
};

const hasVerificationEvidence = (verification = {}) => {
  if (!verification || typeof verification !== "object") return false;

  const labels = Array.isArray(verification.labels) ? verification.labels : [];
  const matchedLabels = Array.isArray(verification.matchedLabels)
    ? verification.matchedLabels
    : [];
  const metadata = verification.metadata || {};

  return Boolean(
    normalizeString(verification.reasoning) ||
      verification.confidence !== undefined ||
      verification.score !== undefined ||
      labels.length ||
      matchedLabels.length ||
      metadata.timestamp ||
      metadata.device ||
      metadata.hasGPS !== undefined ||
      metadata.isRecent !== undefined ||
      metadata.isWithinArea !== undefined
  );
};

const needsIncidentAutoVerification = (incident = {}) => {
  if (!incident?.image?.fileUrl) return false;

  const verification = incident.verification || null;
  if (!verification) return true;

  const status = normalizeString(verification.status).toLowerCase();
  if (!status) return true;
  if (status === "approved" || status === "rejected") return false;

  return !hasVerificationEvidence(verification);
};

const verifyIncidentFromImageUrl = async (incident) => {
  if (!incident?.image?.fileUrl) return null;

  const response = await axios.get(incident.image.fileUrl, {
    responseType: "arraybuffer",
  });

  const buffer = Buffer.from(response.data);
  return verifyIncidentImage(buffer, incident.type);
};

let pendingIncidentVerifierStarted = false;
let pendingIncidentVerifierRunning = false;

const verifyPendingIncidentsBatch = async () => {
  if (pendingIncidentVerifierRunning) return;
  pendingIncidentVerifierRunning = true;

  try {
    const incidents = await IncidentModel.find({
      "image.fileUrl": { $exists: true, $ne: "" },
      $or: [
        { verification: { $exists: false } },
        { "verification.reasoning": { $exists: false } },
        { "verification.reasoning": "" },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(AUTO_VERIFY_BATCH_SIZE);

    for (const incident of incidents) {
      if (!needsIncidentAutoVerification(incident)) continue;

      try {
        const verificationResult = await verifyIncidentFromImageUrl(incident);
        if (!verificationResult) continue;

        applyVerificationOutcome(incident, verificationResult);
        await incident.save();

        if (normalizeString(incident.verification?.status).toLowerCase() === "approved") {
          await notifyReporterIncidentApprovedOnce({
            req: { session: {}, body: {} },
            incident,
          });
        }
      } catch (error) {
        console.error("Background incident auto-verification error:", {
          incidentId: String(incident?._id || ""),
          message: error?.message || error,
        });
      }
    }
  } catch (error) {
    console.error("Pending incident verifier batch failed:", error);
  } finally {
    pendingIncidentVerifierRunning = false;
  }
};

const ensurePendingIncidentVerifier = () => {
  if (pendingIncidentVerifierStarted) return;
  pendingIncidentVerifierStarted = true;

  const initialTimer = setTimeout(() => {
    verifyPendingIncidentsBatch().catch((error) => {
      console.error("Initial pending incident verifier failed:", error);
    });
  }, 15 * 1000);
  initialTimer.unref?.();

  const intervalTimer = setInterval(() => {
    verifyPendingIncidentsBatch().catch((error) => {
      console.error("Scheduled pending incident verifier failed:", error);
    });
  }, AUTO_VERIFY_INTERVAL_MS);
  intervalTimer.unref?.();
};

ensurePendingIncidentVerifier();

// -----------------------------
// NOTIFICATION HELPERS
// -----------------------------
const getNotificationDayKey = () => {
  return new Date().toISOString().slice(0, 10);
};

const getActorMeta = (req) => {
  return {
    actorRole: normalizeRole(req.session?.role) || "system",
    actorUser: req.session?.userId || null,
    actorName:
      normalizeString(req.session?.username) ||
      normalizeString(req.session?.name) ||
      normalizeString(req.body?.usernames) ||
      "System",
  };
};

const getIncidentBarangayName = (req, incident = {}) => {
  return (
    normalizeString(incident.barangayName) ||
    normalizeString(incident.barangay) ||
    normalizeString(req.body?.barangayName) ||
    normalizeString(req.body?.barangay) ||
    normalizeString(req.session?.barangayName) ||
    ""
  );
};

const getIncidentBarangayId = (req, incident = {}) => {
  return (
    incident.barangayId ||
    incident.barangay ||
    req.body?.barangayId ||
    req.session?.barangayId ||
    null
  );
};

const getIncidentRecipientLink = () => {
  return "/drrmo/incident-report";
};

const getIncidentRecipientsForActor = () => {
  return [{ role: "drrmo" }];
};

const buildIncidentNotificationPayload = ({
  eventType,
  incident,
  status = "",
}) => {
  const incidentType = formatLabel(incident?.type || "Incident");
  const level = formatLabel(incident?.level || "");
  const location = normalizeString(incident?.location) || "an unspecified location";
  const verificationStatus = normalizeString(incident?.verification?.status);
  const incidentStatus = normalizeString(status || incident?.status);

  if (eventType === "created") {
    const isCritical =
      normalizeRole(incident?.level) === "critical" ||
      normalizeRole(incident?.level) === "high";

    return {
      type: "incident_reported",
      priority: isCritical ? "critical" : "high",
      title: "New incident reported",
      message: `${incidentType} incident reported at ${location}${level ? ` with ${level} level` : ""}.`,
      alertReason: "created",
    };
  }

  if (eventType === "status") {
    return {
      type: "incident_status_updated",
      priority:
        incidentStatus === "resolved"
          ? "normal"
          : incidentStatus === "onProcess"
            ? "high"
            : "normal",
      title: "Incident status updated",
      message: `${incidentType} incident at ${location} was updated to ${formatLabel(incidentStatus)}.`,
      alertReason: "status_updated",
    };
  }

  if (eventType === "verification") {
    return {
      type: "incident_verification_updated",
      priority:
        verificationStatus === "rejected"
          ? "high"
          : verificationStatus === "approved"
            ? "normal"
            : "high",
      title: "Incident verification updated",
      message: `${incidentType} incident at ${location} verification was set to ${formatLabel(verificationStatus)}.`,
      alertReason: "verification_updated",
    };
  }

  if (eventType === "reverified") {
    return {
      type: "incident_reverified",
      priority:
        verificationStatus === "rejected"
          ? "high"
          : verificationStatus === "approved"
            ? "normal"
            : "high",
      title: "Incident image reverified",
      message: `${incidentType} incident at ${location} was reverified with result ${formatLabel(verificationStatus)}.`,
      alertReason: "reverified",
    };
  }

  if (eventType === "deleted") {
    return {
      type: "incident_deleted",
      priority: "high",
      title: "Incident report deleted",
      message: `${incidentType} incident at ${location} was deleted.`,
      alertReason: "deleted",
    };
  }

  return {
    type: "incident_activity",
    priority: "normal",
    title: "Incident activity",
    message: `${incidentType} incident at ${location} had an update.`,
    alertReason: "activity",
  };
};

const createIncidentNotificationForRecipientOnce = async ({
  req,
  incident,
  recipientRole,
  eventType,
  status = "",
  metadata = {},
}) => {
  try {
    if (!incident?._id || !recipientRole) return null;

    const { actorRole, actorUser, actorName } = getActorMeta(req);
    const dayKey = getNotificationDayKey();
    const barangayId = getIncidentBarangayId(req, incident);
    const barangayName = getIncidentBarangayName(req, incident);

    const payload = buildIncidentNotificationPayload({
      eventType,
      incident,
      status,
    });

    const existing = await Notification.findOne({
      recipientRole,
      module: "incident",
      type: payload.type,
      referenceId: incident._id,
      "metadata.dayKey": dayKey,
      "metadata.actorRole": actorRole,
    }).lean();

    if (existing) return existing;

    const recipientData = {
      recipientRole,
    };

    if (recipientRole === "barangay") {
      if (!barangayId && !barangayName) return null;

      recipientData.recipientUser = barangayId || null;
      recipientData.recipientUserModel = barangayId ? "Barangay" : null;
      recipientData.recipientBarangay = barangayId || null;
      recipientData.recipientBarangayName = barangayName || "";
    }

    return await createNotification({
      ...recipientData,

      senderUser: actorUser,
      senderRole: actorRole || "",
      senderName: actorName,

      module: "incident",
      type: payload.type,
      priority: payload.priority,

      title: payload.title,
      message: payload.message,
      link: getIncidentRecipientLink(recipientRole),

      referenceId: incident._id,
      referenceModel: "Incident",
      metadata: {
        dayKey,
        actorRole,
        actorName,
        alertReason: payload.alertReason,
        incidentId: incident._id,
        incidentType: incident.type || "",
        incidentLevel: incident.level || "",
        incidentStatus: incident.status || "",
        verificationStatus: incident.verification?.status || "",
        location: incident.location || "",
        barangayId: barangayId || null,
        barangayName: barangayName || "",
        latitude: incident.latitude || null,
        longitude: incident.longitude || null,
        ...metadata,
      },
    });
  } catch (err) {
    console.error("Create Incident Notification For Recipient Error:", err);
    return null;
  }
};

const notifyIncidentEvent = async ({
  req,
  incident,
  eventType,
  status = "",
  metadata = {},
}) => {
  try {
    if (!incident?._id) return;

    const recipients = getIncidentRecipientsForActor(req, incident);

    await Promise.all(
      recipients.map((recipient) =>
        createIncidentNotificationForRecipientOnce({
          req,
          incident,
          recipientRole: recipient.role,
          eventType,
          status,
          metadata,
        })
      )
    );
  } catch (err) {
    console.error("Notify Incident Event Error:", err);
  }
};

const buildIncidentHistoryMetadata = (req, incident, extra = {}) => ({
  incidentId: incident?._id || null,
  incidentType: normalizeString(incident?.type),
  incidentLevel: normalizeString(incident?.level),
  incidentStatus: normalizeString(incident?.status),
  actorName:
    normalizeString(req.session?.username) ||
    normalizeString(req.session?.name) ||
    "System",
  actorRole: normalizeRole(req.session?.role) || "system",
  ...extra,
});

// ✅ Get all incidents
const getIncidents = async (req, res) => {
  try {
    const includeAll =
      req.query.includeAll === "true" ||
      req.query.admin === "true" ||
      ["admin", "drrmo"].includes(String(req.session?.role || "").toLowerCase());
    const status = sanitizeText(req.query.status, 40);
    const statusQuery = status
      ? { status: new RegExp(`^${escapeRegex(status)}$`, "i") }
      : null;

    let query = {};

    if (!includeAll) {
      query = {
        $or: [
          { isPublic: true },
          { approvedByMDRRMO: true },
          { forceApproved: true },
          { status: "approved" },
          { "verification.status": "approved", isPublic: true },
        ],
      };
    }

    if (statusQuery) {
      query = Object.keys(query).length ? { $and: [query, statusQuery] } : statusQuery;
    }

    const incidents = await IncidentModel.find(query).sort({ createdAt: -1 });

    console.log("[incident getIncidents]", {
      includeAll,
      role: req.session?.role || "",
      requestedStatus: status || "",
      fetched: incidents.length,
      statuses: [...new Set(incidents.map((incident) => incident?.status || ""))],
      aiStatuses: [...new Set(incidents.map((incident) => incident?.aiStatus || ""))],
      verificationStatuses: [
        ...new Set(incidents.map((incident) => incident?.verification?.status)),
      ],
    });

    res.json(incidents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ✅ Register Incident (WITH IMAGE SUPPORT)
const registerIncident = async (req, res) => {
  const buffer = req.file?.buffer
    ? Buffer.isBuffer(req.file.buffer)
      ? req.file.buffer
      : Buffer.from(req.file.buffer)
    : null;

  if (req.file && buffer) {
    try {
      const parser = exif.create(buffer);
      parser.parse();
    } catch (err) {
      console.log("⚠️ Metadata extraction failed:", err.message);
    }
  }

  try {
    if (!req.body) req.body = {};

    const type = sanitizeText(req.body.type, 60);
    const incidentType = normalizeIncidentType(type);
    const level = sanitizeText(req.body.level, 40);

    const district = sanitizeAlphaNumericText(req.body.district, 80);

    const barangay = sanitizeAlphaNumericText(req.body.barangay, 80);

    const street = sanitizeIncidentText(
      req.body.street || req.body.streetAddress,
      160
    );

    const location = buildIncidentAddress({
      district,
      barangay,
      street,
      location: req.body.location,
    });

    const description = sanitizeIncidentText(
      req.body.description,
      1000
    );

    const usernames =
      sanitizeText(req.body.usernames, 60) || null;

    const phone = sanitizePhone(req.body.phone) || null;

    const userId = toObjectIdOrNull(
      req.body.userId || req.session?.userId
    );

    const reporterUserId = toObjectIdOrNull(
      req.body.reporterUserId ||
      req.body.userId ||
      req.session?.userId
    );

    const allowedTypes = new Set([
      "flood",
      "typhoon",
      "fire",
      "earthquake",
      "accident",
      "road_block",
    ]);

    const allowedLevels = new Set([
      "low",
      "medium",
      "high",
      "critical",
    ]);

    const latitude =
      req.body.latitude !== undefined &&
      req.body.latitude !== ""
        ? Number(req.body.latitude)
        : null;

    const longitude =
      req.body.longitude !== undefined &&
      req.body.longitude !== ""
        ? Number(req.body.longitude)
        : null;

    if (!type || !allowedTypes.has(incidentType)) {
      return res.status(400).json({
        message: "A valid incident type is required.",
      });
    }

    if (!level || !allowedLevels.has(level.toLowerCase())) {
      return res.status(400).json({
        message: "A valid severity level is required.",
      });
    }

    if (!district) {
      return res.status(400).json({
        message: "District is required.",
      });
    }

    if (!barangay) {
      return res.status(400).json({
        message: "Barangay is required.",
      });
    }

    if (!street) {
      return res.status(400).json({
        message:
          "Street or landmark details are required.",
      });
    }

    if (!location) {
      return res.status(400).json({
        message: "Incident location is required.",
      });
    }

    if (!description || description.length < 5) {
      return res.status(400).json({
        message:
          "Description/reason must be at least 5 characters.",
      });
    }

    if (req.body.phone && !/^9\d{9}$/.test(phone)) {
      return res.status(400).json({
        message:
          "Contact number must be a valid 10-digit mobile number starting with 9.",
      });
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      return res.status(400).json({
        message: "Valid incident coordinates are required.",
      });
    }

    const duplicateIncident =
      await findDuplicateIncident({
        type: incidentType,
        latitude,
        longitude,
      });

    if (duplicateIncident) {
      return res.status(409).json({
        code: "DUPLICATE_INCIDENT",
        title: "Similar Incident Already Reported",
        message:
          "A similar incident has already been reported in this area. Please check the existing report instead.",
      });
    }

    const uploadedFiles = Array.isArray(req.files)
      ? req.files
      : req.files
      ? Object.values(req.files).flat()
      : req.file
      ? [req.file]
      : [];

    const primaryIncidentFile = uploadedFiles[0] || req.file || null;
    const verificationBuffer = primaryIncidentFile?.buffer
      ? Buffer.isBuffer(primaryIncidentFile.buffer)
        ? primaryIncidentFile.buffer
        : Buffer.from(primaryIncidentFile.buffer)
      : buffer;

    let verification = null;

    if (primaryIncidentFile && verificationBuffer) {
      verification = await verifyIncidentImage(
        verificationBuffer,
        req.body.type
      );
    }

    const imageItems = await Promise.all(
      uploadedFiles.map(uploadIncidentFile)
    );

    const imageData = imageItems[0] || null;

    const newIncident = new IncidentModel({
      type: incidentType,
      level,
      district,
      barangay,
      street,
      streetAddress: street,
      location,
      description,
      latitude,
      longitude,

      image: imageData,
      images: imageItems,

      barangayId:
        req.body.barangayId ||
        req.session?.barangayId ||
        null,

      barangayName:
        normalizeString(req.body.barangayName) ||
        normalizeString(req.body.barangay) ||
        normalizeString(req.session?.barangayName),

      usernames,
      phone,

      userId,
      reporterUserId,

      status: "reported",
      aiStatus: "pending",

      isPublic: false,
      forceApproved: false,
      approvedByMDRRMO: false,

      expiresAt: new Date(
        Date.now() + INCIDENT_TTL_MS
      ),

      verification: verification
        ? buildStoredVerification(verification)
        : undefined,
    });

    if (verification) {
      applyVerificationOutcome(
        newIncident,
        verification
      );
    }

    const incident = await newIncident.save();

    console.log("[incident reporter saved]", {
      incidentId: String(incident._id),
      userId: incident.userId || null,
      reporterUserId:
        incident.reporterUserId || null,
      bodyUserId: req.body.userId || null,
      bodyReporterUserId:
        req.body.reporterUserId || null,
      sessionUserId:
        req.session?.userId || null,
    });

    if (!incident.userId && !incident.reporterUserId) {
      console.log("[incident reporter missing]", {
        incidentId: String(incident._id),
        bodyUserId: req.body.userId || null,
        bodyReporterUserId:
          req.body.reporterUserId || null,
        sessionUserId:
          req.session?.userId || null,
      });
    }

    console.log("[incident submit]", {
      id: String(incident._id),
      status: incident.status,
      aiStatus: incident.aiStatus,
      isPublic: incident.isPublic,
      type: incident.type,
      barangay: incident.barangay,
      userId: incident.userId
        ? String(incident.userId)
        : "",
      reporterUserId:
        incident.reporterUserId
          ? String(incident.reporterUserId)
          : "",
      images: imageItems.length,
    });

    console.log("[public status]", {
      id: String(incident._id),
      isPublic: incident.isPublic,
      aiStatus: incident.aiStatus,
      forceApproved: incident.forceApproved,
      approvedByMDRRMO:
        incident.approvedByMDRRMO,
    });

    await notifyIncidentEvent({
      req,
      incident,
      eventType: "created",
    });

    console.log("Incident registered:", incident);

    return res.status(201).json({
      message: "Incident reported successfully.",
      incident,
    });
  } catch (error) {
    console.error("registerIncident error:", error);

    return res.status(500).json({
      message: "Failed to register incident.",
      error: error.message,
    });
  }
};

 
// ✅ Update status
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const nextStatus = normalizeStatus(status);
    const previousIncident = await IncidentModel.findById(req.params.id).select(
      "status aiStatus isPublic forceApproved approvedByMDRRMO"
    );
    const isAdminApprovalStatus = nextStatus === "approved";

    const updatedIncident = await IncidentModel.findByIdAndUpdate(
      req.params.id,
      {
        status: isAdminApprovalStatus ? "approved" : nextStatus || status,
        ...(isAdminApprovalStatus
          ? { isPublic: true, approvedByMDRRMO: true, forceApproved: true }
          : {}),
      },
      { new: true }
    );

    if (!updatedIncident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    await HistoryModel.create({
      action: isAdminApprovalStatus ? "MDRRMO_APPROVAL" : "STATUS_UPDATE",
      placeName: updatedIncident.location,
      details: `Updated to ${nextStatus || status}`,
      metadata: buildIncidentHistoryMetadata(req, updatedIncident, {
        eventType: "status_update",
        status,
      }),
    });

    if (isAdminApprovalStatus) {
      console.log("[verification update]", {
        incidentId: String(updatedIncident._id),
        requestedStatus: status,
        status: updatedIncident.status,
        isPublic: updatedIncident.isPublic,
        approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
        forceApproved: updatedIncident.forceApproved,
        reporterUserId: updatedIncident.reporterUserId || null,
        userId: updatedIncident.userId || null,
        ...getNotificationStorageDebugInfo(),
      });
      console.log("[incident approval]", {
        id: String(updatedIncident._id),
        status: updatedIncident.status,
        isPublic: updatedIncident.isPublic,
        forceApproved: updatedIncident.forceApproved,
        approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
      });
      console.log("[public status]", {
        id: String(updatedIncident._id),
        isPublic: updatedIncident.isPublic,
        aiStatus: updatedIncident.aiStatus,
        forceApproved: updatedIncident.forceApproved,
        approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
      });
    }

    if (isPublicIncident(updatedIncident) && !isPublicIncident(previousIncident)) {
      await publishIncidentIfPublic(updatedIncident, {
        excludeUsername: updatedIncident.usernames,
        excludePhone: updatedIncident.phone,
      });
    }

    if (isAdminApprovalStatus && isPublicIncident(updatedIncident)) {
      await notifyReporterIncidentApproved(req, updatedIncident);
    }

    await notifyIncidentEvent({
      req,
      incident: updatedIncident,
      eventType: "status",
      status,
    });

    res.json(updatedIncident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

const updateAIStatus = async (req, res) => {
  try {
    const aiStatus = String(req.body.aiStatus || req.body.status || "")
      .trim()
      .toLowerCase();

    if (!["approved", "rejected"].includes(aiStatus)) {
      return res.status(400).json({ message: "aiStatus must be approved or rejected." });
    }

    const incident = await applyIncidentAIResult(req.params.id, {
      aiStatus,
      score: req.body.score == null ? null : Number(req.body.score),
      labels: Array.isArray(req.body.labels) ? req.body.labels : [],
      reason: sanitizeText(req.body.reason, 500),
    });

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    await HistoryModel.create({
      action: "AI_STATUS_UPDATE",
      placeName: incident.location,
      details: `AI verification ${aiStatus}`,
    });

    res.json(incident);
  } catch (err) {
    console.error("Update AI status error:", err);
    res.status(500).json({ error: "Failed to update AI status" });
  }
};

const forceApproveIncident = async (req, res) => {
  try {
    const previousIncident = await IncidentModel.findById(req.params.id).select(
      "status aiStatus isPublic forceApproved approvedByMDRRMO"
    );

    const updatedIncident = await IncidentModel.findByIdAndUpdate(
      req.params.id,
      {
        forceApproved: true,
        approvedByMDRRMO: true,
        isPublic: true,
        status: "approved",
      },
      { new: true }
    );

    if (!updatedIncident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    console.log("[incident approval]", {
      id: String(updatedIncident._id),
      status: updatedIncident.status,
      forceApproved: updatedIncident.forceApproved,
      isPublic: updatedIncident.isPublic,
      approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
    });
    console.log("[verification update]", {
      incidentId: String(updatedIncident._id),
      status: updatedIncident.status,
      isPublic: updatedIncident.isPublic,
      approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
      forceApproved: updatedIncident.forceApproved,
      reporterUserId: updatedIncident.reporterUserId || null,
      userId: updatedIncident.userId || null,
      ...getNotificationStorageDebugInfo(),
    });
    console.log("[public status]", {
      id: String(updatedIncident._id),
      isPublic: updatedIncident.isPublic,
      aiStatus: updatedIncident.aiStatus,
      forceApproved: updatedIncident.forceApproved,
      approvedByMDRRMO: updatedIncident.approvedByMDRRMO,
    });

    await HistoryModel.create({
      action: "MDRRMO_FORCE_APPROVE",
      placeName: updatedIncident.location,
      details: "Incident force approved by MDRRMO/Admin.",
    });

    if (isPublicIncident(updatedIncident) && !isPublicIncident(previousIncident)) {
      await publishIncidentIfPublic(updatedIncident, {
        excludeUsername: updatedIncident.usernames,
        excludePhone: updatedIncident.phone,
      });
    }

    if (isPublicIncident(updatedIncident)) {
      await notifyReporterIncidentApproved(req, updatedIncident);
    }

    res.json(updatedIncident);
  } catch (err) {
    console.error("Force approve incident error:", err);
    res.status(500).json({ error: "Failed to force approve incident" });
  }
};


// ✅ Delete incident
const deleteIncident = async (req, res) => {
  try {
    const deleted = await IncidentModel.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const publicIds = [
      deleted?.image?.public_id,
      ...((deleted?.images || []).map((item) => item?.public_id)),
    ].filter(Boolean);

    await Promise.all(
      [...new Set(publicIds)].map(async (publicId) => {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryErr) {
          console.error("Cloudinary incident image delete failed:", cloudinaryErr);
        }
      })
    );

    await HistoryModel.create({
      action: "DELETE",
      placeName: deleted.location,
      details: deleted.description,
      metadata: buildIncidentHistoryMetadata(req, deleted, {
        eventType: "deleted",
      }),
    });

    await notifyIncidentEvent({
      req,
      incident: deleted,
      eventType: "deleted",
    });

    res.json({ message: "Incident deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete incident" });
  }
};

// ✅ Analytics (STATUS COUNTS)

const getIncidentHistory = async (req, res) => {
  try {
    const filter = safeLower(req.query.filter || "all");
    const search = sanitizeText(req.query.search, 120);

    // Build delete history query
    const historyQuery = {};

    if (search) {
      historyQuery.$or = [
        { placeName: { $regex: new RegExp(escapeRegex(search), "i") } },
        { details: { $regex: new RegExp(escapeRegex(search), "i") } },
        { action: { $regex: new RegExp(escapeRegex(search), "i") } },
        { "metadata.actorName": { $regex: new RegExp(escapeRegex(search), "i") } },
        { "metadata.incidentType": { $regex: new RegExp(escapeRegex(search), "i") } },
        { "metadata.incidentLevel": { $regex: new RegExp(escapeRegex(search), "i") } },
      ];
    }

    // Only fetch deleted records if needed
    if (filter !== "resolved") {
      historyQuery.action = "DELETE";
    }

    // Build resolved incidents query
    const incidentQuery = {
      status: "resolved",
    };

    if (search) {
      incidentQuery.$or = [
        { type: { $regex: new RegExp(escapeRegex(search), "i") } },
        { level: { $regex: new RegExp(escapeRegex(search), "i") } },
        { location: { $regex: new RegExp(escapeRegex(search), "i") } },
        { description: { $regex: new RegExp(escapeRegex(search), "i") } },
        {
          "verification.metadata.reviewedBy": {
            $regex: new RegExp(escapeRegex(search), "i"),
          },
        },
      ];
    }

    const [resolvedIncidents, deletedHistory] = await Promise.all([
      filter === "deleted"
        ? Promise.resolve([])
        : IncidentModel.find(incidentQuery)
            .sort({ updatedAt: -1 })
            .limit(300)
            .lean(),

      filter === "resolved"
        ? Promise.resolve([])
        : HistoryModel.find(historyQuery)
            .sort({ createdAt: -1 })
            .limit(300)
            .lean(),
    ]);

    let items = [
      ...resolvedIncidents.map((incident) => ({
        _id: `resolved-${incident._id}`,
        eventType: "resolved",
        incidentId: incident._id || null,

        type: normalizeString(incident.type) || "Incident",
        level: normalizeString(incident.level) || "-",
        location:
          normalizeString(incident.location) || "Unknown location",
        description:
          normalizeString(incident.description) ||
          "No description provided.",

        status: "resolved",

        actorName:
          normalizeString(
            incident?.verification?.metadata?.reviewedBy
          ) || "DRRMO",

        actorRole: "drrmo",

        createdAt:
          incident.updatedAt || incident.createdAt || null,

        updatedAt: incident.updatedAt || null,

        source: "incident",
      })),

      ...deletedHistory.map((entry) => ({
        _id: `deleted-${entry._id}`,
        eventType: "deleted",

        incidentId:
          entry?.metadata?.incidentId || null,

        type:
          normalizeString(
            entry?.metadata?.incidentType
          ) || "Incident",

        level:
          normalizeString(
            entry?.metadata?.incidentLevel
          ) || "-",

        location:
          normalizeString(entry.placeName) ||
          "Unknown location",

        description:
          normalizeString(entry.details) ||
          "Deleted incident record.",

        status: "deleted",

        actorName:
          normalizeString(
            entry?.metadata?.actorName
          ) || "System",

        actorRole:
          normalizeRole(
            entry?.metadata?.actorRole
          ) || "system",

        createdAt: entry.createdAt || null,

        updatedAt: entry.updatedAt || null,

        action: entry.action || "DELETE",

        source: "history",
      })),
    ];

    // Optional extra filtering safety
    if (filter === "resolved") {
      items = items.filter(
        (item) => item.eventType === "resolved"
      );
    }

    if (filter === "deleted") {
      items = items.filter(
        (item) => item.eventType === "deleted"
      );
    }

    // Final sorting
    items.sort((a, b) => {
      const aTime = a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;

      const bTime = b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;

      return bTime - aTime;
    });

    // Prevent oversized response
    items = items.slice(0, 300);

    res.json({
      items,
      summary: {
        total: items.length,

        resolved: items.filter(
          (item) => item.eventType === "resolved"
        ).length,

        deleted: items.filter(
          (item) => item.eventType === "deleted"
        ).length,
      },
    });
  } catch (err) {
    console.error("Get incident history error:", err);

    res.status(500).json({
      message: "Failed to load incident history.",
    });
  }
};

const updateVerification = async (req, res) => {
  try {
    const verificationStatus = String(
      req.body.status || req.body.aiStatus || ""
    )
      .trim()
      .toLowerCase();

    if (!["approved", "pending", "rejected"].includes(verificationStatus)) {
      return res.status(400).json({
        message:
          "Verification status must be approved, pending, or rejected.",
      });
    }

    const previousIncident = await IncidentModel.findById(
      req.params.id
    ).select(
      `
        status
        aiStatus
        isPublic
        forceApproved
        approvedByMDRRMO
        verification
        usernames
        phone
      `
    );

    if (!previousIncident) {
      return res.status(404).json({
        message: "Incident not found",
      });
    }

    // Ensure verification object exists
    const verificationData = previousIncident.verification || {
      status: "pending",
      confidence: 0,
      labels: [],
      matchedLabels: [],
      isMatch: false,
      score: 0,
      reasoning: "Manual verification update",
      metadata: {
        hasGPS: false,
        isRecent: false,
        isWithinArea: false,
        device: null,
        width: null,
        height: null,
        timestamp: null,
      },
    };

    verificationData.status = verificationStatus;

    const isApproved = verificationStatus === "approved";
    const isRejected = verificationStatus === "rejected";

    // Build update payload
    const updatePayload = {
      aiStatus: verificationStatus,
      verification: verificationData,

      "aiReview.status": verificationStatus,

      "aiReview.reason": isApproved
        ? "Approved by MDRRMO verification override."
        : isRejected
        ? "Rejected by MDRRMO verification override."
        : "Verification set to pending.",

      "aiReview.reviewedAt": new Date(),
    };

    // Approved logic
    if (isApproved) {
      updatePayload.status = "approved";
      updatePayload.isPublic = true;
      updatePayload.approvedByMDRRMO = true;
      updatePayload.forceApproved = true;
    }

    // Rejected logic
    if (isRejected) {
      updatePayload.status = "rejected";
      updatePayload.isPublic = false;
      updatePayload.approvedByMDRRMO = false;
      updatePayload.forceApproved = false;
    }

    // Pending logic
    if (verificationStatus === "pending") {
      updatePayload.status =
        previousIncident.status === "approved"
          ? "reported"
          : previousIncident.status;

      updatePayload.isPublic = false;
      updatePayload.approvedByMDRRMO = false;
      updatePayload.forceApproved = false;
    }

    const incident = await IncidentModel.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      {
        new: true,
      }
    );

    console.log("[verification update]", {
      id: String(incident._id),
      verificationStatus,
      status: incident.status,
      isPublic: incident.isPublic,
      approvedByMDRRMO: incident.approvedByMDRRMO,
      forceApproved: incident.forceApproved,
    });

    // History log
    await HistoryModel.create({
      action: isApproved
        ? "MDRRMO_APPROVAL"
        : "VERIFICATION_UPDATE",

      placeName:
        incident.location ||
        incident.barangay ||
        "Incident report",

      details: isApproved
        ? "AI approved and incident approved for public mobile map."
        : `Verification set to ${verificationStatus}`,

      metadata: buildIncidentHistoryMetadata(req, incident, {
        eventType: "verification_update",
        verificationStatus,
      }),
    });

    // Event notifications
    await notifyIncidentEvent({
      req,
      incident,
      eventType: "verification",
      status: verificationStatus,
    });

    // Publish only if becoming public
    if (
      isApproved &&
      isPublicIncident(incident) &&
      !isPublicIncident(previousIncident)
    ) {
      await publishIncidentIfPublic(incident, {
        excludeUsername: incident.usernames,
        excludePhone: incident.phone,
      });

      // Notify original reporter once
      await notifyReporterIncidentApprovedOnce({
        req,
        incident,
      });
    }

    res.json({
      message: isApproved
        ? "Incident approved and now visible on mobile map."
        : verificationStatus === "rejected"
        ? "Incident verification rejected."
        : "Verification updated.",

      incident,
    });
  } catch (err) {
    console.error("UPDATE VERIFICATION ERROR:", err);

    res.status(500).json({
      error: "Failed to update verification",
      message: err.message,
    });
  }
};


const getIncidentStats = async (req, res) => {
  try {
    const stats = await IncidentModel.aggregate([
      {
        $match: PUBLIC_INCIDENT_QUERY,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      reported: 0,
      onProcess: 0,
      resolved: 0,
      total: 0,
    };

    stats.forEach((item) => {
      const normalizedStatus = normalizeStatus(item._id);
      if (normalizedStatus === "reported" || normalizedStatus === "") {
        result.reported += item.count;
      } else if (normalizedStatus === "on process") {
        result.onProcess += item.count;
      } else if (normalizedStatus === "resolved") {
        result.resolved += item.count;
      }
    });

    result.total = result.reported + result.onProcess + result.resolved;

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// Get count of incidents per type
const getIncidentTypeStats = async (req, res) => {
  try {
    const stats = await IncidentModel.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    stats.forEach((item) => {
      result[item._id || "Unknown"] = item.count;
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch type stats" });
  }
};

const getTrend = async (req, res) => {
  try {
    const data = await IncidentModel.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const notifyReporterIncidentApprovedOnce = async ({ req, incident }) => {
  try {
    const reporterUserId =
      incident?.reporterUserId ||
      incident?.userId ||
      incident?.reportedBy ||
      null;

    if (!reporterUserId) {
      console.log("[reporter approval notification skipped no reporter]", {
        incidentId: String(incident?._id || ""),
        reporterUserId: incident?.reporterUserId || null,
        userId: incident?.userId || null,
      });
      return null;
    }

    const existing = await Notification.findOne({
      recipientUser: reporterUserId,
      module: "incident",
      type: "incident_approved",
      referenceId: incident._id,
    }).lean();

    if (existing) {
      console.log("[reporter approval notification skipped duplicate]", {
        incidentId: String(incident._id),
        reporterUserId: String(reporterUserId),
      });
      return existing;
    }

 const notification = await createNotification({
  recipientRole: "all",
  recipientUser: reporterUserId,
  recipientUserModel: null,

  senderUser: req.session?.userId || null,
  senderRole: normalizeRole(req.session?.role) || "drrmo",
  senderName:
    normalizeString(req.session?.username) ||
    normalizeString(req.session?.name) ||
    "MDRRMO",

  module: "incident",
  type: "incident_approved",
  priority: "normal",

  title: "Incident Report Verified",
  message:
    "Your reported incident has been reviewed and verified by the MDRRMO. It has been approved as a valid incident and is now visible on the public map for community awareness.",
  link: "/notifications",

  referenceId: incident._id,
  referenceModel: "Incident",

  metadata: {
    incidentId: incident._id,
    incidentType: incident.type || "",
    location: incident.location || "",
    approvalStatus: "approved",
    sendSms: true,
    deliveryChannels: ["sms", "email"],
  },
});

    if (!notification) {
  console.log("[reporter approval notification failed createNotification returned null]", {
    incidentId: String(incident._id),
    reporterUserId: String(reporterUserId),
  });
  return null;
}

console.log("[reporter approval notification created]", {
  notificationId: String(notification._id),
  incidentId: String(incident._id),
  reporterUserId: String(reporterUserId),
});

const reporterUser = await UserModel.findById(reporterUserId).select(
  "_id email phone phoneNumber notificationTokens fname lname barangay district address street streetAddress"
);

if (reporterUser) {
  await dispatchMultiChannelNotification({
    users: [reporterUser],
    title: "Incident Report Verified",
    message:
      "Your reported incident has been reviewed and verified by the MDRRMO. It has been approved as a valid incident and is now visible on the public map for community awareness.",
    type: "incident_approved",
    referenceId: incident._id,
    notificationId: notification._id,
    urgent: true,
    sendSms: true,
    sendEmail: true,
    barangay: incident.barangay || reporterUser.barangay || "",
    incidentType: formatIncidentTypeLabel(incident.type),
    incident,
  });

  await sendExpoPushNotifications([reporterUser], {
    title: "Incident Report Verified",
    body:
      "Your reported incident has been reviewed and verified by the MDRRMO.",
    priority: "high",
    soundType: "danger",
    data: {
      type: "incident_approved",
      soundType: "danger",
      incidentId: String(incident._id),
      referenceId: String(incident._id),
      screen: "Map",
    },
  });
}

return notification;


  } catch (err) {
    console.error("Reporter Incident Approval Notification Error:", err);
    return null;
  }
};


const reverifyIncident = async (req, res) => {
  try {
    const incident = await IncidentModel.findById(req.params.id);

    if (!incident || !incident.image?.fileUrl) {
      return res.status(404).json({ message: "Incident or image not found" });
    }

    const verification = await verifyIncidentFromImageUrl(incident);

    console.log("=== AI VERIFICATION RESULT ===");
    console.log("Status:", verification?.status);
    console.log("Confidence:", verification?.confidence);
    console.log("Labels:", verification?.labels);
    console.log("Matched Labels:", verification?.matchedLabels);
    console.log("Is Match:", verification?.isMatch);
    console.log("---- METADATA ----");
    console.log("Raw Metadata:", verification?.metadata);
    console.log("Metadata Flags:", verification?.metadataFlags);
    console.log("GPS:", verification?.metadata?.gps);
    console.log("Device:", verification?.metadata?.device);
    console.log(
      "Dimensions:",
      verification?.metadata?.width,
      "x",
      verification?.metadata?.height
    );
    console.log("==============================");

    applyVerificationOutcome(incident, verification);

    await incident.save();

    try {
      await HistoryModel.create({
        action: "VERIFICATION_UPDATE",
        placeName: incident.location || "unknown",
        details: `Verification set to ${incident.verification.status}`,
        metadata: buildIncidentHistoryMetadata(req, incident, {
          eventType: "verification_update",
          verificationStatus: incident.verification.status,
        }),
      });
    } catch (e) {
      console.error("History save failed:", e.message);
    }

    await notifyIncidentEvent({
      req,
      incident,
      eventType: "reverified",
      status: incident.verification.status,
    });

    if (normalizeString(incident.verification?.status).toLowerCase() === "approved") {
      await notifyReporterIncidentApprovedOnce({ req, incident });
    }

    res.json({
      message: "Reverification complete",
      incident,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reverify incident" });
  }
};

/* EXPORT SINGLE INCIDENT PDF */
const exportIncidentPdf = async (req, res) => {
  try {
    const incident = await IncidentModel.findById(req.params.id).lean();

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const safeName = normalizeString(
      `${incident.type || "incident"}-${incident._id}`
    ).replace(/[^\w\-]+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
    });

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).text("Incident Report", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).text(
      "Generated from Disaster Relief Management System",
      { align: "center" }
    );

    drawPdfSectionTitle(doc, "Incident Information");
    drawPdfLabelValue(doc, "Incident Type", formatLabel(incident.type));
    drawPdfLabelValue(doc, "Level", formatLabel(incident.level));
    drawPdfLabelValue(doc, "Location", normalizeString(incident.location) || "-");
    drawPdfLabelValue(doc, "Status", formatLabel(incident.status));
    drawPdfLabelValue(doc, "Latitude", incident.latitude ?? "-");
    drawPdfLabelValue(doc, "Longitude", incident.longitude ?? "-");
    drawPdfLabelValue(doc, "Reported At", formatDateValue(incident.createdAt));
    drawPdfLabelValue(doc, "Last Updated", formatDateValue(incident.updatedAt));
    drawPdfLabelValue(doc, "Expires At", formatDateValue(incident.expiresAt));

    drawPdfSectionTitle(doc, "Reporter Information");
    drawPdfLabelValue(doc, "Username", normalizeString(incident.usernames) || "-");
    drawPdfLabelValue(doc, "Phone", normalizeString(incident.phone) || "-");

    drawPdfSectionTitle(doc, "Description");
    doc.font("Helvetica").text(
      normalizeString(incident.description) || "No description provided."
    );

    drawPdfSectionTitle(doc, "Image Information");
    drawPdfLabelValue(
      doc,
      "Image File Name",
      normalizeString(incident.image?.fileName) || "No image uploaded"
    );
    drawPdfLabelValue(
      doc,
      "Image URL",
      normalizeString(incident.image?.fileUrl) || "No image uploaded"
    );

    drawPdfSectionTitle(doc, "Verification");
    drawPdfLabelValue(
      doc,
      "Verification Status",
      formatLabel(incident.verification?.status)
    );
    drawPdfLabelValue(
      doc,
      "Confidence",
      incident.verification?.confidence !== undefined &&
        incident.verification?.confidence !== null
        ? `${incident.verification.confidence}%`
        : "-"
    );
    drawPdfLabelValue(
      doc,
      "Is Match",
      incident.verification?.isMatch === undefined
        ? "-"
        : incident.verification.isMatch
          ? "Yes"
          : "No"
    );
    drawPdfLabelValue(doc, "Score", incident.verification?.score ?? "-");

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text("Reasoning:");
    doc.font("Helvetica").text(
      normalizeString(incident.verification?.reasoning) ||
        "No reasoning available."
    );

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text("Detected Labels:");
    doc.font("Helvetica").text(
      Array.isArray(incident.verification?.labels) &&
        incident.verification.labels.length
        ? incident.verification.labels.join(", ")
        : "None"
    );

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text("Matched Labels:");
    doc.font("Helvetica").text(
      Array.isArray(incident.verification?.matchedLabels) &&
        incident.verification.matchedLabels.length
        ? incident.verification.matchedLabels.join(", ")
        : "None"
    );

    drawPdfSectionTitle(doc, "Verification Metadata");
    drawPdfLabelValue(
      doc,
      "Has GPS",
      incident.verification?.metadata?.hasGPS === undefined
        ? "-"
        : incident.verification.metadata.hasGPS
          ? "Yes"
          : "No"
    );
    drawPdfLabelValue(
      doc,
      "Is Recent",
      incident.verification?.metadata?.isRecent === undefined
        ? "-"
        : incident.verification.metadata.isRecent
          ? "Yes"
          : "No"
    );
    drawPdfLabelValue(
      doc,
      "Within Area",
      incident.verification?.metadata?.isWithinArea === undefined
        ? "-"
        : incident.verification.metadata.isWithinArea
          ? "Yes"
          : "No"
    );
    drawPdfLabelValue(
      doc,
      "Device",
      normalizeString(incident.verification?.metadata?.device) || "-"
    );
    drawPdfLabelValue(doc, "Width", incident.verification?.metadata?.width ?? "-");
    drawPdfLabelValue(doc, "Height", incident.verification?.metadata?.height ?? "-");
    drawPdfLabelValue(
      doc,
      "Timestamp",
      incident.verification?.metadata?.timestamp ?? "-"
    );

    ensurePdfPageSpace(doc, 60);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).text(
      `Document generated on ${formatDateValue(new Date())}`,
      { align: "right" }
    );

    doc.end();
  } catch (err) {
    console.error("Export Incident PDF Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = {
  getIncidents,
  getIncidentHistory,
  registerIncident,
  updateStatus,
  deleteIncident,
  getIncidentStats,
  getIncidentTypeStats,
  getTrend,
  updateVerification,
  reverifyIncident,
  exportIncidentPdf,
  updateAIStatus,
  forceApproveIncident,
};
