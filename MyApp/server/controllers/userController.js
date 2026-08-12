const UserModel = require("../models/User");
const SafetyDebugLocation = require("../models/SafetyDebugLocation");
const PostingGuideline = require("../models/Guidelines");
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const crypto = require("crypto");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const sendEmailNotification = require("../utils/sendEmailNotification");
const { sendUniSms } = require("../utils/sendUniSms");
const cloudinary = require("../config/cloudinary");
const bcrypt = require("bcryptjs");

const GUIDELINE_NOTIFICATION_LOOKBACK_DAYS = 30;
const ANNOUNCEMENT_NOTIFICATION_LOOKBACK_DAYS = 30;
const DANGER_NOTIFICATION_TYPES = [
  "nearby_incident",
  "nearby_repeated_incident",
  "barangay_incident_danger",
];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeText(value, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeUsername(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 30);
}

function sanitizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^63/, "")
    .replace(/^0+/, "")
    .slice(0, 10);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getPasswordPolicyError(value) {
  const password = String(value || "").trim();

  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 64) {
    return "Password must not exceed 64 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must include at least one special character.";
  }

  return "";
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 5) return digits ? `${digits.slice(0, 2)}***` : "";
  return `${digits.slice(0, 2)}******${digits.slice(-3)}`;
}

function maskEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const [local, domain] = cleanEmail.split("@");
  if (!local || !domain) return "";
  return `${local.charAt(0)}*****@${domain}`;
}

function safeUserPayload(user) {
  const object = typeof user?.toObject === "function" ? user.toObject() : user || {};
  const {
    password,
    otp,
    otpExpires,
    phoneOtp,
    phoneOtpExpires,
    emailOtp,
    emailOtpExpires,
    otpCodeHash,
    otpPurpose,
    otpChannel,
    otpAttempts,
    lastOtpSentAt,
    verificationToken,
    verificationTokenExpires,
    passwordResetTokenHash,
    passwordResetTokenExpires,
    ...safeUser
  } = object;

  return safeUser;
}

function getDisplayName(user) {
  return sanitizeText(user?.fname || user?.name || user?.username || "Resident", 80);
}

function getOtpEmailMessage(user, otp) {
  return [
    `Dear ${getDisplayName(user)},`,
    "",
    "Your SagipBayan verification code is:",
    "",
    otp,
    "",
    "This code will expire in 5 minutes.",
    "",
    "If you did not request this code, please ignore this message.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");
}

function getOtpSmsMessage(otp) {
  return `This is a sample message: ${otp}`;
}

function generateVerificationToken(user) {
  user.verificationToken = crypto.randomBytes(32).toString("hex");
  user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  console.log("[email verification token generated]", {
    userId: user?._id ? String(user._id) : "pending",
    expiresAt: user.verificationTokenExpires,
  });

  return user.verificationToken;
}

function getRequestBaseUrl(req) {
  if (!req) return "";

  const host = req.get?.("host");
  if (!host) return "";

  const forwardedProto = String(req.get?.("x-forwarded-proto") || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";

  return `${protocol}://${host}`;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function isLocalBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("10.0.2.2")
  );
}

function getVerificationBaseUrl(req) {
  const configuredBase =
    normalizeBaseUrl(process.env.VERIFICATION_BASE_URL) ||
    normalizeBaseUrl(process.env.BASE_URL);

  if (configuredBase) return configuredBase;

  const requestBase = normalizeBaseUrl(getRequestBaseUrl(req));
  if (requestBase && !isLocalBaseUrl(requestBase)) return requestBase;

  return "https://gaganadapat.onrender.com";
}

async function sendRegistrationVerificationEmail(user, req) {
  const token = user.verificationToken;
  const baseUrl = getVerificationBaseUrl(req);
  const verificationLink = `${baseUrl}/user/verify/${token}`;

  if (!token || !user.verificationTokenExpires) {
    const error = new Error("Missing email verification token.");
    error.status = 500;
    throw error;
  }

  await sendVerificationEmail(user.email, verificationLink, user.fname);

  console.log("[registration verification email sent]", {
    userId: String(user._id),
    to: maskEmail(user.email),
  });
}

async function setOtpFields(user, { purpose, channel, skipCooldown = false }) {
  const now = Date.now();
  const lastSentAt = user.lastOtpSentAt ? new Date(user.lastOtpSentAt).getTime() : 0;

  if (!skipCooldown && lastSentAt && now - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
    const error = new Error(`Please wait ${waitSeconds} seconds before requesting another OTP.`);
    error.status = 429;
    throw error;
  }

  const otp = generateOTP();
  const hash = await bcrypt.hash(otp, 10);
  const expires = new Date(now + OTP_TTL_MS);

  user.otpCodeHash = hash;
  user.otp = hash;
  user.otpExpires = expires;
  user.otpPurpose = purpose;
  user.otpChannel = channel;
  user.otpAttempts = 0;
  user.lastOtpSentAt = new Date(now);

  if (purpose === "registration_phone") {
    user.phoneOtp = hash;
    user.phoneOtpExpires = expires;
  }

  if (purpose === "registration_email") {
    user.emailOtp = hash;
    user.emailOtpExpires = expires;
  }

  return { otp, expires };
}

function clearOtpFields(user, purpose) {
  user.otp = "";
  user.otpExpires = null;
  user.otpCodeHash = "";
  user.otpPurpose = "";
  user.otpChannel = "";
  user.otpAttempts = 0;

  if (!purpose || purpose === "registration_phone") {
    user.phoneOtp = "";
    user.phoneOtpExpires = null;
  }

  if (!purpose || purpose === "registration_email") {
    user.emailOtp = "";
    user.emailOtpExpires = null;
  }
}

async function deliverOtp(user, { channel, otp, purpose = "" }) {
  if (channel === "sms") {
    const destination = user.phoneNumber || user.phone;
    console.log("[otp sms sending]", {
      userId: String(user._id),
      channel,
      to: maskPhone(destination),
    });
    const result = await sendUniSms({
      to: destination,
      message: getOtpSmsMessage(otp),
    });

    if (!result?.ok) {
      const error = new Error("Unable to send SMS OTP. Please try again.");
      error.status = 502;
      throw error;
    }

    return result;
  }

  console.log("[otp email sending]", {
    userId: String(user._id),
    channel,
    to: maskEmail(user.email),
  });

  const result = await sendEmailNotification({
    to: user.email,
    subject:
      purpose === "registration_email"
        ? "SagipBayan Email Verification Code"
        : "SagipBayan Verification Code",
    message: getOtpEmailMessage(user, otp),
  });

  if (!result?.ok) {
    const error = new Error("Unable to send email OTP. Please try again.");
    error.status = 502;
    throw error;
  }

  return result;
}

async function verifyUserOtp(user, { otp, purpose, channel }) {
  const expectedPurpose = purpose || user.otpPurpose || "";
  const now = Date.now();
  let hash = user.otpCodeHash || user.otp || "";
  let expires = user.otpExpires;

  if (expectedPurpose === "registration_phone") {
    hash = user.phoneOtp || hash;
    expires = user.phoneOtpExpires || expires;
  }

  if (expectedPurpose === "registration_email") {
    hash = user.emailOtp || hash;
    expires = user.emailOtpExpires || expires;
  }

  if (!hash || !expires || new Date(expires).getTime() < now) {
    const error = new Error("Your session has expired. Please request a new OTP.");
    error.status = 400;
    throw error;
  }

  if (user.otpPurpose && expectedPurpose && user.otpPurpose !== expectedPurpose) {
    const error = new Error("Invalid OTP purpose.");
    error.status = 400;
    throw error;
  }

  if (channel && user.otpChannel && user.otpChannel !== channel) {
    const error = new Error("Invalid OTP channel.");
    error.status = 400;
    throw error;
  }

  if ((user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    const error = new Error("Too many OTP attempts. Please request a new OTP.");
    error.status = 429;
    throw error;
  }

  const valid = await bcrypt.compare(String(otp || ""), hash);

  if (!valid) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();
    const error = new Error("Invalid OTP.");
    error.status = 400;
    throw error;
  }

  return expectedPurpose;
}

function isForgotPasswordPurpose(purpose) {
  return ["forgot_password_sms", "forgot_password_email", "passwordReset"].includes(
    String(purpose || "")
  );
}

async function createPasswordResetToken(user, channel) {
  const token = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = await bcrypt.hash(token, 10);
  user.passwordResetTokenExpires = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  user.passwordResetVerifiedAt = new Date();
  user.lastPasswordResetChannel = channel || user.otpChannel || "";
  user.lastPasswordResetOtpVerified = true;
  return token;
}

async function validatePasswordResetToken(user, token) {
  if (
    !user?.passwordResetTokenHash ||
    !user?.passwordResetTokenExpires ||
    new Date(user.passwordResetTokenExpires).getTime() < Date.now()
  ) {
    const error = new Error("Your session has expired. Please request a new OTP.");
    error.status = 401;
    throw error;
  }

  const valid = await bcrypt.compare(String(token || ""), user.passwordResetTokenHash);
  if (!valid) {
    const error = new Error("Your session has expired. Please request a new OTP.");
    error.status = 401;
    throw error;
  }
}

function buildFullAddress({ district, barangay, street }) {
  return [street, barangay, district, "Jaen, Nueva Ecija"].filter(Boolean).join(", ");
}

function buildGuidelineNotification(guideline) {
  const title = sanitizeText(guideline?.title, 120) || "Untitled guideline";
  const dedupeKey = `guideline:${guideline._id}:published`;
  const priority = String(guideline?.priorityLevel || guideline?.priority || "")
    .trim()
    .toLowerCase();
  const dangerAlert = ["high", "critical", "emergency"].includes(priority);
  const sendSms = dangerAlert;

  return {
    type: "guideline",
    title: "New Guideline Posted",
    message: `MDRRMO posted a new guideline: ${title}`,
    target: "all",
    source: "mdrrmo",
    notificationType: dangerAlert ? "danger" : "normal",
    priority: dangerAlert ? (priority === "critical" ? "critical" : "high") : "normal",
    soundType: dangerAlert ? "danger" : "notification",
    guidelineId: guideline._id,
    sourceLabel: "MDRRMO",
    official: true,
    dedupeKey,
    actionable: false,
    metadata: {
      sendSms,
      deliveryChannels: sendSms ? ["sms"] : [],
    },
    read: false,
    isRead: false,
    createdAt: guideline.publishedNotificationSentAt || guideline.updatedAt || new Date(),
  };
}

function buildAnnouncementNotification(announcement) {
  const title = sanitizeText(announcement?.title, 120) || "Untitled announcement";
  const dedupeKey = `announcement:${announcement._id}:published`;
  const priority = String(announcement?.priorityLevel || announcement?.priority || "")
    .trim()
    .toLowerCase();
  const category = String(announcement?.category || "").trim().toLowerCase();
  const dangerAlert = ["high", "critical", "emergency"].includes(priority) || category === "emergency";
  const sendSms = true;

  return {
    type: "announcement",
    title: "New MDRRMO Announcement",
    message: `MDRRMO posted a new announcement: ${title}`,
    target: "all",
    source: "mdrrmo",
    notificationType: dangerAlert ? "danger" : "normal",
    priority: dangerAlert ? (priority === "critical" || category === "emergency" ? "critical" : "high") : "normal",
    soundType: dangerAlert ? "danger" : "notification",
    announcementId: announcement._id,
    sourceLabel: "MDRRMO",
    official: true,
    dedupeKey,
    actionable: false,
    metadata: {
      sendSms,
      deliveryChannels: ["sms"],
    },
    read: false,
    isRead: false,
    createdAt: announcement.publishedNotificationSentAt || announcement.updatedAt || new Date(),
  };
}

function toPlainNotification(item) {
  return typeof item?.toObject === "function" ? item.toObject() : item;
}

function getActionUserId(item) {
  const value = item?.user ?? item;
  if (value?._id) return String(value._id);
  return value == null ? "" : String(value);
}

function hasUserAction(items, userId) {
  const userIdText = String(userId || "");
  return Array.isArray(items) && items.some((item) => getActionUserId(item) === userIdText);
}

function normalizeCollectionNotification(notification, userId) {
  const type = notification?.type || "system";
  const read = hasUserAction(notification?.readBy, userId);

  return {
    _id: String(notification._id),
    id: String(notification._id),
    type,
    title: notification.title || "System update",
    message: notification.message || "There is a new update.",
    module: notification.module || null,
    priority: notification.priority || "normal",
    notificationType: notification.notificationType || "normal",
    referenceId: notification.referenceId || notification.metadata?.incidentId || null,
    referenceModel: notification.referenceModel || null,
    incidentId: notification.incidentId || notification.metadata?.incidentId || null,
    recipientUser: notification.recipientUser || null,
    recipientUserModel: notification.recipientUserModel || null,
    metadata: notification.metadata || {},
    dedupeKey: notification.dedupeKey || "",
    read,
    isRead: read,
    createdAt: notification.createdAt || new Date(),
    sourceLabel:
      notification.module === "incident"
        ? "Incident Alert"
        : notification.senderName || "System",
    official: true,
    soundType:
      String(notification?.soundType || "").toLowerCase() === "danger" ||
      notification?.notificationType === "danger" ||
      notification?.priority === "critical" ||
      notification?.priority === "high" ||
      DANGER_NOTIFICATION_TYPES.includes(String(type).toLowerCase())
        ? "danger"
        : "notification",
  };
}

function getNotificationDedupeKeys(notification) {
  const keys = [];
  const id = notification?._id || notification?.id;
  const dedupeKey = notification?.dedupeKey;
  const referenceId = notification?.referenceId || notification?.incidentId;

  if (id) keys.push(`id:${String(id)}`);
  if (dedupeKey) keys.push(`dedupe:${String(dedupeKey)}`);
  if (notification?.type && referenceId) {
    keys.push(`ref:${String(notification.type)}:${String(referenceId)}`);
  }

  if (!keys.length) {
    keys.push(
      `fallback:${String(notification?.type || "system")}:${String(
        notification?.createdAt || ""
      )}:${String(notification?.message || "")}`
    );
  }

  return keys;
}

function getNotificationGuidelineId(notification) {
  const metadata = notification?.metadata || {};
  return (
    notification?.guidelineId ||
    metadata.guidelineId ||
    (String(notification?.type || "").toLowerCase().includes("guideline")
      ? notification?.referenceId
      : null)
  );
}

function getNotificationAnnouncementId(notification) {
  const metadata = notification?.metadata || {};
  return (
    notification?.announcementId ||
    metadata.announcementId ||
    (String(notification?.type || "").toLowerCase().includes("announcement")
      ? notification?.referenceId
      : null)
  );
}

function getNotificationClearKeys(notification) {
  const keys = [];
  const dedupeKey = notification?.dedupeKey;
  const guidelineId = getNotificationGuidelineId(notification);
  const announcementId = getNotificationAnnouncementId(notification);

  if (dedupeKey) keys.push(String(dedupeKey));
  if (guidelineId) keys.push(`guideline:${String(guidelineId)}:published`);
  if (announcementId) keys.push(`announcement:${String(announcementId)}:published`);

  return keys.filter(Boolean);
}

function hasDedupeKey(keySet, dedupeKey) {
  const key = String(dedupeKey || "");
  return Boolean(key && (keySet.has(key) || keySet.has(`dedupe:${key}`)));
}

function getPublishedNotificationTime(item) {
  const value =
    item?.publishedNotificationSentAt ||
    item?.updatedAt ||
    item?.createdAt ||
    null;
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getUserNotificationStartDate(user) {
  const dates = [user?.createdAt, user?.notificationClearedAt]
    .map((value) => (value ? new Date(value) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));

  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}

function getUserActionArchiveFilter(userObjectId, userIdText) {
  return {
    $or: [
      { archivedBy: { $exists: false } },
      {
        archivedBy: {
          $not: {
            $elemMatch: {
              user: { $in: [userObjectId, userIdText] },
            },
          },
        },
      },
    ],
  };
}

function mergeNotifications(notifications) {
  const seen = new Set();
  const merged = [];

  notifications.forEach((notification) => {
      const keys = getNotificationDedupeKeys(notification);
      if (keys.some((key) => seen.has(key))) return;

      keys.forEach((key) => seen.add(key));
      merged.push(notification);
    });

  return merged.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
}

async function syncRecentGuidelineNotificationsForUser(user) {
  const visibleFrom = getUserNotificationStartDate(user);

  const existingDedupeKeys = new Set([
    ...(user.notifications || [])
      .flatMap(getNotificationClearKeys)
      .filter(Boolean),

    ...(user.clearedNotificationDedupeKeys || [])
      .map((key) => String(key || ""))
      .filter(Boolean),
  ]);

  const cutoff = new Date(
    Date.now() - GUIDELINE_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const publishedGuidelines = await PostingGuideline.find({
    status: "published",
    $or: [
      { publishedNotificationSentAt: { $gte: cutoff } },
      { updatedAt: { $gte: cutoff } },
      { createdAt: { $gte: cutoff } },
      { publishedNotificationSent: { $ne: true } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(20);

  let skippedExistingOrCleared = 0;
  let skippedBeforeClear = 0;

  const missingNotifications = publishedGuidelines
    .filter((guideline) => {
      const dedupeKey = `guideline:${guideline._id}:published`;

      if (hasDedupeKey(existingDedupeKeys, dedupeKey)) {
        skippedExistingOrCleared += 1;
        return false;
      }

      if (visibleFrom) {
        const publishedTime = getPublishedNotificationTime(guideline);

        if (publishedTime && publishedTime < visibleFrom) {
          skippedBeforeClear += 1;
          return false;
        }
      }

      return true;
    })
    .map(buildGuidelineNotification);

  console.log("[notifications] guideline sync check", {
    userId: String(user._id),
    publishedGuidelines: publishedGuidelines.length,
    missingGuidelineNotifications: missingNotifications.length,
    notificationClearedAt: user.notificationClearedAt || null,
    clearedKeys: user.clearedNotificationDedupeKeys?.length || 0,
    skippedExistingOrCleared,
    skippedBeforeClear,
  });

  if (!missingNotifications.length) {
    return user;
  }

  user.notifications.push(...missingNotifications);
  await user.save();

  console.log("[notifications] guideline notification created:", {
    userId: String(user._id),
    count: missingNotifications.length,
  });

  return user;
}
async function syncRecentAnnouncementNotificationsForUser(user) {
  const visibleFrom = getUserNotificationStartDate(user);

  const existingDedupeKeys = new Set([
    ...(user.notifications || [])
      .flatMap(getNotificationClearKeys)
      .filter(Boolean),

    ...(user.clearedNotificationDedupeKeys || [])
      .map((key) => String(key || ""))
      .filter(Boolean),
  ]);

  const cutoff = new Date(
    Date.now() - ANNOUNCEMENT_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const publishedAnnouncements = await Announcement.find({
    status: "published",
    $or: [
      { publishedNotificationSentAt: { $gte: cutoff } },
      { updatedAt: { $gte: cutoff } },
      { createdAt: { $gte: cutoff } },
      { publishedNotificationSent: { $ne: true } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(20);

  let skippedExistingOrCleared = 0;
  let skippedBeforeClear = 0;

  const missingNotifications = publishedAnnouncements
    .filter((announcement) => {
      const dedupeKey = `announcement:${announcement._id}:published`;

      if (hasDedupeKey(existingDedupeKeys, dedupeKey)) {
        skippedExistingOrCleared += 1;
        return false;
      }

      if (visibleFrom) {
        const publishedTime = getPublishedNotificationTime(announcement);

        if (publishedTime && publishedTime < visibleFrom) {
          skippedBeforeClear += 1;
          return false;
        }
      }

      return true;
    })
    .map(buildAnnouncementNotification);

  console.log("[notifications] announcement sync check", {
    userId: String(user._id),
    publishedAnnouncements: publishedAnnouncements.length,
    missingAnnouncementNotifications: missingNotifications.length,
    notificationClearedAt: user.notificationClearedAt || null,
    clearedKeys: user.clearedNotificationDedupeKeys?.length || 0,
    skippedExistingOrCleared,
    skippedBeforeClear,
  });

  if (!missingNotifications.length) {
    return user;
  }

  user.notifications.push(...missingNotifications);
  await user.save();

  console.log("[notifications] announcement notification created:", {
    userId: String(user._id),
    count: missingNotifications.length,
  });

  return user;
}

/* =========================
   REGISTER
========================= */
const registerUser = async (req, res) => {
  try {
    const {
      fname,
      lname,
      username,
      password,
      email,
      phone,
      barangay,
      street,
      streetAddress,
      address,
    } = req.body || {};

    if (!fname || !lname || !username || !password || !email || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanUsername = sanitizeUsername(username);
    const cleanPhone = sanitizePhone(phone);
    const cleanBarangay = sanitizeText(barangay, 80);
    const cleanStreet = sanitizeText(street || streetAddress, 160);
    const cleanAddress =
      buildFullAddress({
        district: "",
        barangay: cleanBarangay,
        street: cleanStreet,
      }) || sanitizeText(address, 220);

    const existingEmailUser = await UserModel.findOne({ email: cleanEmail });
    if (existingEmailUser) {
      return res.status(400).json({
        error: "EMAIL_EXISTS",
        message: "Email already exists",
      });
    }

    const existingUsernameUser = await UserModel.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(cleanUsername)}$`, "i") },
    });

    if (existingUsernameUser) {
      return res.status(400).json({
        error: "USERNAME_EXISTS",
        message: "Username already exists",
      });
    }

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      return res.status(400).json({
        error: passwordError,
        message: passwordError,
      });
    }

    if (cleanPhone.length !== 10) {
      return res.status(400).json({
        error: "Phone number must contain exactly 10 digits",
      });
    }

    if (!cleanBarangay) {
      return res.status(400).json({
        error: "Barangay is required",
      });
    }

    if (!cleanStreet) {
      return res.status(400).json({
        error: "Street / address details are required",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserModel({
      ...req.body,
      fname: sanitizeText(fname, 60),
      lname: sanitizeText(lname, 60),
      username: cleanUsername,
      email: cleanEmail,
      phone: cleanPhone,
      phoneNumber: cleanPhone,
      barangay: cleanBarangay,
      street: cleanStreet,
      streetAddress: cleanStreet,
      address: cleanAddress,
      password: hashedPassword,
      isVerified: false,
      isPhoneVerified: false,
      isEmailVerified: false,
    });

    generateVerificationToken(newUser);

    const user = await newUser.save();

    return res.status(201).json({
      message: "Registration successful. Choose where you want to receive your OTP.",
      nextStep: "choose_otp_channel",
      userId: user._id,
      phoneMasked: maskPhone(user.phoneNumber || user.phone),
      emailMasked: maskEmail(user.email),
    });
  } catch (err) {
    console.error("REGISTER USER ERROR:", err);

    if (err?.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern || {})[0];

      if (duplicateField === "email") {
        return res.status(400).json({
          error: "EMAIL_EXISTS",
          message: "Email already exists",
        });
      }

      if (duplicateField === "username") {
        return res.status(400).json({
          error: "USERNAME_EXISTS",
          message: "Username already exists",
        });
      }

      return res.status(400).json({
        error: "DUPLICATE_FIELD",
        message: "A unique field already exists",
      });
    }

    return res.status(500).json({ error: "Registration failed" });
  }
};

/* =========================
   VERIFY EMAIL
========================= */
const verifyEmail = async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).send("Invalid verification link.");
    }

    const user = await UserModel.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      console.log("[email verification failed]", {
        reason: "invalid_or_expired",
        tokenLength: token.length,
      });

      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align:center; padding:40px; color:#10251B;">
            <h2>Invalid or Expired Verification Link</h2>
            <p>Your verification link may have expired or has already been used.</p>
            <p>Please return to the SagipBayan app and request a new verification email.</p>
          </body>
        </html>
      `);
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    if (user.isPhoneVerified === true) {
      user.isVerified = true;
    }

    await user.save();

    console.log("[email verification link verified]", {
      userId: String(user._id),
      isPhoneVerified: user.isPhoneVerified === true,
      isEmailVerified: user.isEmailVerified === true,
      isVerified: user.isVerified === true,
    });

    if (user.isVerified === true) {
      console.log("[account fully verified]", { userId: String(user._id) });
    }

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align:center; padding:40px; color:#10251B;">
          <h2>Email Verified Successfully</h2>
          <p>Your SagipBayan email has been verified.</p>
          <p>You may now return to the app.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Email verification error:", err);
    return res.status(500).send("Email verification failed.");
  }
};

/* =========================
   USERS
========================= */
const getUsers = (req, res) => {
  UserModel.find()
    .then((users) => res.json(users))
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Internal Server Error" });
    });
};

/* =========================
   LOGIN
========================= */
const loginUser = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const normalizedUsername = String(username).trim();
    const user =
      (await UserModel.findOne({ username: normalizedUsername })) ||
      (await UserModel.findOne({
        username: { $regex: new RegExp(`^${escapeRegex(normalizedUsername)}$`, "i") },
      }));

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (user.isArchived) {
      user.isArchived = false;
      user.archivedAt = null;
      user.deleteAfter = null;
    }

    if (user.twoFactorEnabled) {
      await user.save();
      return res.json({
        twoFactor: true,
        userId: user._id,
        email: user.email,
        restored: true,
      });
    }

    await user.save();

    res.json({
      twoFactor: false,
      user,
      restored: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   UPDATE USER
========================= */
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const body = req.body || {};

    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updateData = {};

    if (body.fname !== undefined) {
      updateData.fname = sanitizeText(body.fname, 60);
    }

    if (body.lname !== undefined) {
      updateData.lname = sanitizeText(body.lname, 60);
    }

    if (body.username !== undefined) {
      const cleanUsername = sanitizeUsername(body.username);
      if (!cleanUsername) {
        return res.status(400).json({ message: "Invalid username." });
      }

      const usernameOwner = await UserModel.findOne({
        _id: { $ne: userId },
        username: { $regex: new RegExp(`^${escapeRegex(cleanUsername)}$`, "i") },
      });

      if (usernameOwner) {
        return res.status(400).json({ message: "Username is already taken." });
      }

      updateData.username = cleanUsername;
    }

    if (body.email !== undefined) {
      const cleanEmail = normalizeEmail(body.email);
      if (!cleanEmail) {
        return res.status(400).json({ message: "Invalid email." });
      }

      const emailOwner = await UserModel.findOne({
        _id: { $ne: userId },
        email: cleanEmail,
      });

      if (emailOwner) {
        return res.status(400).json({ message: "Email is already in use." });
      }

      updateData.email = cleanEmail;
    }

    if (body.phone !== undefined || body.phoneNumber !== undefined) {
      const rawPhone = body.phoneNumber ?? body.phone;
      const cleanPhone = sanitizePhone(rawPhone);

      if (rawPhone && cleanPhone.length !== 10) {
        return res.status(400).json({
          message: "Phone number must contain exactly 10 digits.",
        });
      }

      updateData.phone = cleanPhone;
      updateData.phoneNumber = cleanPhone;
    }

    const district =
      body.district !== undefined
        ? sanitizeText(body.district, 80)
        : existingUser.district || "";

    const barangay =
      body.barangay !== undefined
        ? sanitizeText(body.barangay, 80)
        : existingUser.barangay || "";

    const street =
      body.street !== undefined
        ? sanitizeText(body.street, 160)
        : body.streetAddress !== undefined
          ? sanitizeText(body.streetAddress, 160)
          : existingUser.street || existingUser.streetAddress || "";

    if (body.district !== undefined) updateData.district = district;
    if (body.barangay !== undefined) updateData.barangay = barangay;
    if (body.street !== undefined || body.streetAddress !== undefined) {
      updateData.street = street;
      updateData.streetAddress = street;
    }

    if (
      body.address !== undefined ||
      body.district !== undefined ||
      body.barangay !== undefined ||
      body.street !== undefined ||
      body.streetAddress !== undefined
    ) {
      updateData.address = buildFullAddress({
        district,
        barangay,
        street,
      });
    }

    if (body.password) {
      const cleanCurrentPassword = String(body.currentPassword || "").trim();

      if (!cleanCurrentPassword) {
        return res.status(400).json({
          message: "Missing Field",
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        cleanCurrentPassword,
        existingUser.password
      );

      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          message: "Password is incorrect",
        });
      }

      const passwordError = getPasswordPolicyError(body.password);
      if (passwordError) {
        return res.status(400).json({
          message: passwordError,
        });
      }
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    const user = await UserModel.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });

    const {
      password,
      otp,
      otpExpires,
      phoneOtp,
      phoneOtpExpires,
      emailOtp,
      emailOtpExpires,
      otpCodeHash,
      passwordResetTokenHash,
      passwordResetTokenExpires,
      verificationToken,
      verificationTokenExpires,
      ...safeUser
    } = user.toObject();

    return res.json(safeUser);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/* =========================
   UPDATE LOCATION
========================= */
const updateLocation = async (req, res) => {
  try {
    const userId = req.params.id;
    const { lat, lng } = req.body;
    console.log("📍 Location update:", userId, lat, lng);

    if (!userId) {
      return res.status(400).json({ message: "Missing user id" });
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({
        message: "Latitude and longitude must be numbers",
      });
    }

    const existingUser = await UserModel.findById(userId).select("location");

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await UserModel.findByIdAndUpdate(
      userId,
      {
        location: {
          lat,
          lng,
          updatedAt: new Date(),
          share: existingUser.location?.share === true,
        },
      },
      { new: true }
    );

    res.json({ message: "Location updated successfully" });
  } catch (err) {
    console.error("Update location error:", err);
    res.status(500).json({ message: "Failed to update location" });
  }
};

/* =========================
   SAFETY LOCATION PRIVACY
========================= */
const updateShareSafetyLocation = async (req, res) => {
  try {
    const userId = req.params.id;
    const { shareSafetyLocation } = req.body || {};

    if (typeof shareSafetyLocation !== "boolean") {
      return res.status(400).json({
        message: "shareSafetyLocation must be true or false",
      });
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          shareSafetyLocation,
          "location.share": shareSafetyLocation,
        },
      },
      { new: true, runValidators: true }
    ).select("-password -otp -otpExpires -verificationToken -verificationTokenExpires");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!shareSafetyLocation) {
      await SafetyDebugLocation.findOneAndUpdate(
        { userId: String(userId) },
        {
          $set: {
            debugMode: false,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );
    }

    return res.json({
      message: shareSafetyLocation
        ? "Safety Marking location sharing enabled."
        : "Safety Marking location sharing disabled.",
      user,
      shareSafetyLocation: user.shareSafetyLocation === true,
    });
  } catch (err) {
    console.error("Update safety location sharing error:", err);
    return res.status(500).json({
      message: "Failed to update Safety Marking location sharing.",
    });
  }
};

/* =========================
   OTP
========================= */
const sendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const userId = req.body?.userId;
    const channel = String(req.body?.channel || "email").toLowerCase();
    const requestedPurpose = req.body?.purpose;

    if (!["sms", "email"].includes(channel)) {
      return res.status(400).json({ message: "OTP channel must be sms or email." });
    }

    const user = userId
      ? await UserModel.findById(userId)
      : await UserModel.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: userId ? "User not found" : "Email not found" });
    }

    if (channel === "email" && !user.email) {
      return res.status(400).json({ message: "This account has no email address." });
    }

    if (channel === "sms" && !(user.phoneNumber || user.phone)) {
      return res.status(400).json({ message: "This account has no phone number." });
    }

    const purpose =
      requestedPurpose ||
      (channel === "sms" ? "forgot_password_sms" : "forgot_password_email");

    const { otp } = await setOtpFields(user, { purpose, channel });
    await user.save();
    await deliverOtp(user, { channel, otp, purpose });

    console.log("[otp channel selected]", {
      userId: String(user._id),
      channel,
      purpose,
    });

    return res.json({
      message: "OTP sent successfully",
      userId: user._id,
      channel,
      purpose,
      expiresInSeconds: OTP_TTL_MS / 1000,
    });
  } catch (err) {
    console.error("[otp send failed]", {
      message: err?.message || String(err),
      status: err?.status || 500,
    });
    return res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const userId = req.body?.userId;
    const otp = String(req.body?.otp || "").trim();
    const channel = req.body?.channel ? String(req.body.channel).toLowerCase() : "";
    const requestedPurpose = req.body?.purpose;

    if ((!email && !userId) || !otp) {
      return res.status(400).json({ message: "Account and OTP are required." });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Please enter a valid 6-digit OTP." });
    }

    const user = userId
      ? await UserModel.findById(userId)
      : await UserModel.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const purpose = await verifyUserOtp(user, {
      otp,
      purpose: requestedPurpose,
      channel,
    });

    let response = {
      message: "OTP verified",
      userId: user._id,
      purpose,
    };

    if (purpose === "registration_phone") {
      user.isPhoneVerified = true;
      user.phoneOtp = "";
      user.phoneOtpExpires = null;
      user.isVerified = true;
      clearOtpFields(user, "registration_phone");
      await user.save();

      console.log("[registration sms otp verified]", { userId: String(user._id) });
      console.log("[account verified by selected channel]", {
        userId: String(user._id),
        channel: "sms",
      });

      response = {
        ...response,
        message: "Phone verified. Account verified successfully.",
        nextStep: "complete",
        isPhoneVerified: true,
        isEmailVerified: user.isEmailVerified === true,
        isVerified: true,
        user: safeUserPayload(user),
      };
    } else if (purpose === "registration_email") {
      user.isEmailVerified = true;
      user.emailOtp = "";
      user.emailOtpExpires = null;
      user.isVerified = true;
      clearOtpFields(user, "registration_email");
      await user.save();

      console.log("[registration email verified]", { userId: String(user._id) });
      console.log("[account verified by selected channel]", {
        userId: String(user._id),
        channel: "email",
      });

      response = {
        ...response,
        message: "Email verified. Account verified successfully.",
        nextStep: "complete",
        isPhoneVerified: user.isPhoneVerified === true,
        isEmailVerified: true,
        isVerified: true,
        user: safeUserPayload(user),
      };
    } else if (isForgotPasswordPurpose(purpose)) {
      const resetToken = await createPasswordResetToken(user, channel || user.otpChannel);
      clearOtpFields(user);
      console.log("[otp verified]", {
        userId: String(user._id),
        channel: user.lastPasswordResetChannel,
        purpose,
      });
      response = {
        ...response,
        message: "OTP verified. You may now change your password.",
        resetToken,
        channel: user.lastPasswordResetChannel,
      };
    } else {
      clearOtpFields(user);
      console.log("[otp verified]", {
        userId: String(user._id),
        channel: channel || user.otpChannel,
        purpose,
      });
    }

    await user.save();
    return res.json(response);
  } catch (error) {
    console.error("[otp verify failed]", {
      message: error?.message || String(error),
      status: error?.status || 500,
    });
    return res.status(error.status || 500).json({
      message: error.message || "Server error",
    });
  }
};

const verifyEmailForReset = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await UserModel.findOne({ email }).select(
      "_id email fname lname username"
    );

    if (!user) {
      return res.status(404).json({ exists: false, message: "Email not found" });
    }

    return res.json({
      exists: true,
      user,
    });
  } catch (err) {
    console.error("Verify reset email error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const forgotPasswordLookup = async (req, res) => {
  try {
    const identifier = String(
      req.body?.identifier || req.body?.email || req.body?.username || req.body?.phone || ""
    ).trim();

    if (!identifier) {
      return res.status(400).json({ message: "Enter your email, username, or phone number." });
    }

    const identifierEmail = normalizeEmail(identifier);
    const identifierPhone = sanitizePhone(identifier);
    const username = sanitizeUsername(identifier);

    const lookupCriteria = [
      ...(identifierEmail ? [{ email: identifierEmail }] : []),
      ...(username ? [{ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } }] : []),
      ...(identifierPhone
        ? [{ phone: identifierPhone }, { phoneNumber: identifierPhone }]
        : []),
    ];

    if (!lookupCriteria.length) {
      return res.status(400).json({ message: "Enter a valid email, username, or phone number." });
    }

    const query = { $or: lookupCriteria };

    const user = await UserModel.findOne(query);

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    console.log("[otp lookup user found]", {
      userId: String(user._id),
      hasEmail: Boolean(user.email),
      hasPhone: Boolean(user.phone || user.phoneNumber),
      hasEmailFlag: user.isEmailVerified !== undefined,
      hasPhoneFlag: user.isPhoneVerified !== undefined,
    });

    const options = [];

    if (user.phone || user.phoneNumber) {
      if (user.isPhoneVerified === undefined) {
        console.log("[otp lookup verification flag missing]", {
          userId: String(user._id),
          channel: "sms",
        });
      }
      options.push({
        channel: "sms",
        label: `Send code via SMS to ${maskPhone(user.phoneNumber || user.phone)}`,
        masked: maskPhone(user.phoneNumber || user.phone),
        verified: user.isPhoneVerified === true,
      });
    }

    if (user.email) {
      if (user.isEmailVerified === undefined) {
        console.log("[otp lookup verification flag missing]", {
          userId: String(user._id),
          channel: "email",
        });
      }
      options.push({
        channel: "email",
        label: `Send code via Email to ${maskEmail(user.email)}`,
        masked: maskEmail(user.email),
        verified: user.isEmailVerified === true,
      });
    }

    return res.json({
      userId: user._id,
      displayName: getDisplayName(user),
      options,
    });
  } catch (err) {
    console.error("[otp lookup failed]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const forgotPasswordSendOtp = async (req, res) => {
  try {
    const userId = req.body?.userId;
    const channel = String(req.body?.channel || "").toLowerCase();

    if (!["sms", "email"].includes(channel)) {
      return res.status(400).json({ message: "OTP channel must be sms or email." });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (channel === "sms" && !(user.phone || user.phoneNumber)) {
      return res.status(400).json({ message: "This account has no phone number." });
    }

    if (channel === "email" && !user.email) {
      return res.status(400).json({ message: "This account has no email address." });
    }

    const purpose = channel === "sms" ? "forgot_password_sms" : "forgot_password_email";
    const { otp } = await setOtpFields(user, { purpose, channel });
    user.lastPasswordResetChannel = channel;
    user.lastPasswordResetOtpVerified = false;
    await user.save();
    await deliverOtp(user, { channel, otp, purpose });

    console.log("[otp channel selected]", {
      userId: String(user._id),
      channel,
      purpose,
    });

    return res.json({
      message: "OTP sent successfully",
      userId: user._id,
      channel,
      purpose,
      expiresInSeconds: OTP_TTL_MS / 1000,
    });
  } catch (err) {
    console.error("[otp send failed]", {
      message: err?.message || String(err),
      status: err?.status || 500,
    });
    return res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  }
};

const forgotPasswordVerifyOtp = async (req, res) => {
  try {
    const userId = req.body?.userId;
    const channel = String(req.body?.channel || "").toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!userId || !["sms", "email"].includes(channel) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "User, channel, and 6-digit OTP are required." });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const purpose = channel === "sms" ? "forgot_password_sms" : "forgot_password_email";
    await verifyUserOtp(user, { otp, purpose, channel });
    const resetToken = await createPasswordResetToken(user, channel);
    clearOtpFields(user);
    await user.save();

    console.log("[otp verified]", {
      userId: String(user._id),
      channel,
      purpose,
    });

    return res.json({
      message: "OTP verified. You may now change your password.",
      userId: user._id,
      channel,
      resetToken,
    });
  } catch (err) {
    console.error("[otp verify failed]", {
      message: err?.message || String(err),
      status: err?.status || 500,
    });
    return res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  }
};

const forgotPasswordResetPassword = async (req, res) => {
  try {
    const userId = req.body?.userId;
    const resetToken = req.body?.resetToken;
    const newPassword = String(req.body?.newPassword || req.body?.password || "");

    if (!userId || !resetToken) {
      return res.status(400).json({ message: "Your session has expired. Please request a new OTP." });
    }

    const passwordError = getPasswordPolicyError(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await validatePasswordResetToken(user, resetToken);

    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).json({ message: "New password must be different from the current password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = "";
    user.passwordResetTokenExpires = null;
    await user.save();

    console.log("[password reset completed]", {
      userId: String(user._id),
      channel: user.lastPasswordResetChannel,
    });

    return res.json({
      message: "Password changed successfully.",
      user: safeUserPayload(user),
    });
  } catch (err) {
    console.error("[password reset failed]", {
      message: err?.message || String(err),
      status: err?.status || 500,
    });
    return res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  }
};

const forgotPasswordSkipReset = async (req, res) => {
  try {
    const userId = req.body?.userId;
    const resetToken = req.body?.resetToken;

    if (!userId || !resetToken) {
      return res.status(400).json({ message: "OTP verification is required before skipping." });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await validatePasswordResetToken(user, resetToken);

    user.passwordResetSkippedAt = new Date();
    user.passwordResetSkipCount = (user.passwordResetSkipCount || 0) + 1;
    user.passwordResetTokenHash = "";
    user.passwordResetTokenExpires = null;
    await user.save();

    console.log("[password reset skipped]", {
      userId: String(user._id),
      channel: user.lastPasswordResetChannel,
      skipCount: user.passwordResetSkipCount,
    });

    return res.json({
      message: "Password reset skipped.",
      user: safeUserPayload(user),
    });
  } catch (err) {
    console.error("[password reset skip failed]", {
      message: err?.message || String(err),
      status: err?.status || 500,
    });
    return res.status(err.status || 500).json({
      message: err.message || "Server error",
    });
  }
};

const getVerificationStatus = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select(
      "isPhoneVerified isEmailVerified isVerified"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({
      isPhoneVerified: user.isPhoneVerified === true,
      isEmailVerified: user.isEmailVerified === true,
      isVerified: user.isVerified === true,
    });
  } catch (err) {
    console.error("[verification status failed]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const resendVerificationEmail = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.email) {
      return res.status(400).json({ message: "This account has no email address." });
    }

    if (user.isEmailVerified === true && user.isVerified === true) {
      return res.json({ message: "Your account is already verified." });
    }

    generateVerificationToken(user);
    await user.save();
    await sendRegistrationVerificationEmail(user, req);

    console.log("[verification email resent]", {
      userId: String(user._id),
      to: maskEmail(user.email),
    });

    return res.json({ message: "Verification email sent." });
  } catch (err) {
    console.error("[verification email resend failed]", {
      message: err?.message || String(err),
    });
    return res.status(500).json({ message: "Unable to send verification email." });
  }
};

/* =========================
   ARCHIVE / RESTORE / TWO FACTOR
========================= */
const archiveUser = (req, res) => {
  const userId = req.params.id;
  const deleteAfter = new Date();
  deleteAfter.setMonth(deleteAfter.getMonth() + 6);

  UserModel.findByIdAndUpdate(
    userId,
    {
      isArchived: true,
      archivedAt: new Date(),
      deleteAfter,
    },
    { new: true }
  )
    .then((user) => {
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        message:
          "Your account has been archived. It will be permanently deleted after 6 months.",
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    });
};

const restoreUser = (req, res) => {
  const userId = req.params.id;

  UserModel.findByIdAndUpdate(
    userId,
    {
      isArchived: false,
      archivedAt: null,
      deleteAfter: null,
    },
    { new: true }
  )
    .then((user) => {
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ message: "Account restored successfully" });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    });
};

const toggleTwoFactor = (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ message: "enabled must be true or false" });
  }

  UserModel.findByIdAndUpdate(
    id,
    { twoFactorEnabled: enabled },
    { new: true }
  )
    .then((user) => {
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        message: `Two-Factor Authentication ${enabled ? "enabled" : "disabled"}`,
        twoFactorEnabled: user.twoFactorEnabled,
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    });
};

const getUserById = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id)
      .select("-password -otp -otpExpires -phoneOtp -phoneOtpExpires -emailOtp -emailOtpExpires -otpCodeHash -passwordResetTokenHash -passwordResetTokenExpires -verificationToken -verificationTokenExpires");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const getUserNotifications = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select(
      "notifications notificationClearedAt clearedNotificationDedupeKeys createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await syncRecentGuidelineNotificationsForUser(user);
    await syncRecentAnnouncementNotificationsForUser(user);

    const embeddedNotifications = Array.isArray(user.notifications)
      ? user.notifications.map(toPlainNotification)
      : [];
    const now = new Date();
    const userObjectId = new mongoose.Types.ObjectId(String(user._id));
    const userIdText = String(userObjectId);

    const visibleFrom = getUserNotificationStartDate(user);
    const broadcastNotificationQuery = {
      recipientRole: "all",
      recipientUser: null,
      recipientBarangay: null,
      recipientBarangayName: "",
      ...(visibleFrom ? { createdAt: { $gte: visibleFrom } } : {}),
    };

    const collectionNotifications = await Notification.find({
      $and: [
        {
          $or: [
            { recipientUser: userObjectId },
            { recipientUser: req.params.id },
            broadcastNotificationQuery,
          ],
        },
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: now } },
          ],
        },
        getUserActionArchiveFilter(userObjectId, userIdText),
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const normalizedCollectionNotifications = collectionNotifications.map((item) =>
      normalizeCollectionNotification(item, userIdText)
    );
    const mergedNotifications = mergeNotifications([
      ...normalizedCollectionNotifications,
      ...embeddedNotifications,
    ]);
    const types = mergedNotifications.map((item) => item.type);

    console.log("[notifications] merged fetch", {
      userId: String(user._id),
      dbName: UserModel.db?.name || "",
      embeddedCount: embeddedNotifications.length,
      collectionCount: collectionNotifications.length,
      mergedCount: mergedNotifications.length,
      notificationClearedAt: user.notificationClearedAt || null,
      clearedKeys: user.clearedNotificationDedupeKeys?.length || 0,
      clearedKeysCount: user.clearedNotificationDedupeKeys?.length || 0,
      incidentApprovedCount: mergedNotifications.filter(
        (item) => String(item?.type || "").toLowerCase() === "incident_approved"
      ).length,
      types,
    });

    return res.json(mergedNotifications);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

const markNotificationsRead = async (req, res) => {
  try {
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          "notifications.$[].read": true,
          "notifications.$[].isRead": true,
        },
      },
      { new: true }
    ).select("notifications");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(String(user._id));

    await Notification.updateMany(
      {
        $and: [
          {
            $or: [
              { recipientUser: userObjectId },
              { recipientUser: req.params.id },
              {
                recipientRole: "all",
                recipientUser: null,
                recipientBarangay: null,
                recipientBarangayName: "",
              },
            ],
          },
          {
            readBy: {
              $not: {
                $elemMatch: {
                  user: userObjectId,
                },
              },
            },
          },
        ],
      },
      {
        $push: {
          readBy: {
            user: userObjectId,
            role: "user",
            readAt: new Date(),
          },
        },
      }
    );

    return res.json({ message: "Notifications marked as read." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
const clearNotifications = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select(
      "notifications clearedNotificationDedupeKeys notificationClearedAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(String(user._id));

    const embeddedNotifications = Array.isArray(user.notifications)
      ? user.notifications
      : [];
    const existingDedupeKeys = embeddedNotifications.flatMap(
      getNotificationClearKeys
    );
    const clearTime = new Date();

    const mergedClearedKeys = Array.from(
      new Set([
        ...(user.clearedNotificationDedupeKeys || []),
        ...existingDedupeKeys,
      ])
    );

    user.notifications = [];
    user.clearedNotificationDedupeKeys = mergedClearedKeys;
    user.notificationClearedAt = clearTime;

    await user.save();

    const archiveResult = await Notification.updateMany(
      {
        $and: [
          {
            $or: [
              { recipientUser: userObjectId },
              { recipientUser: req.params.id },
              {
                recipientRole: "all",
                recipientUser: null,
                recipientBarangay: null,
                recipientBarangayName: "",
              },
            ],
          },
          getUserActionArchiveFilter(userObjectId, String(userObjectId)),
        ],
      },
      {
        $push: {
          archivedBy: {
            user: userObjectId,
            role: "user",
            archivedAt: new Date(),
          },
        },
      }
    );

    console.log("[notifications] clear state", {
      userId: String(user._id),
      notificationClearedAt: user.notificationClearedAt,
      clearedKeys: mergedClearedKeys.length,
      clearedKeysCount: mergedClearedKeys.length,
      embeddedCount: embeddedNotifications.length,
      types: embeddedNotifications.map((item) => item?.type),
    });
    console.log("[notifications] cleared", {
      userId: String(user._id),
      clearedEmbeddedKeys: existingDedupeKeys.length,
      totalClearedKeys: mergedClearedKeys.length,
      notificationClearedAt: user.notificationClearedAt,
      archivedCollectionCount:
        archiveResult?.modifiedCount ?? archiveResult?.nModified ?? 0,
    });

    return res.json({ message: "Notifications cleared." });
  } catch (err) {
    console.error("Clear notifications error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const existingUser = await UserModel.findById(req.params.id);

    if (existingUser?.avatarPublicId) {
      await cloudinary.uploader.destroy(existingUser.avatarPublicId);
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "evacuation_app/avatars" },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      ).end(req.file.buffer);
    });

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      {
        avatar: result.secure_url,
        avatarPublicId: result.public_id,
      },
      { new: true }
    );

    res.json({
      avatar: result.secure_url,
      user,
    });
  } catch (err) {
    console.error("AVATAR UPLOAD ERROR:", err);
    res.status(500).json({ message: "Avatar upload failed" });
  }
};

const registerNotificationToken = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();

    console.log("[push-token] current user", req.params.id);
    console.log("[push-token] token received", {
      hasToken: Boolean(token),
      platform,
      deviceId,
    });

    if (!token) {
      return res.status(400).json({ message: "Notification token is required." });
    }

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $pull: { notificationTokens: { token } } },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    user.notificationTokens.push({
      token,
      platform,
      deviceId,
      updatedAt: new Date(),
    });
    await user.save();

    console.log("[push-token] saved to backend", {
      userId: String(user._id),
      tokenCount: user.notificationTokens.length,
    });

    return res.json({
      ok: true,
      message: "Notification token registered",
      tokenCount: user.notificationTokens.length,
      tokenExists: user.notificationTokens.some((item) => item.token === token),
    });
  } catch (err) {
    console.error("Register notification token error:", err);
    return res.status(500).json({ message: "Failed to register notification token." });
  }
};

const logNotificationTokenDebug = async (req, res) => {
  try {
    const userId = String(req.params.id || "");
    const stage = String(req.body?.stage || "unknown").slice(0, 80);
    const platform = String(req.body?.platform || "").slice(0, 40);
    const status = String(req.body?.status || "").slice(0, 80);
    const projectId = String(req.body?.projectId || "").slice(0, 120);
    const message = String(req.body?.message || "").slice(0, 500);

    console.log("[push-token-debug]", {
      userId,
      stage,
      platform,
      status,
      hasProjectId: Boolean(projectId),
      projectId,
      message,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[push-token-debug] failed", {
      message: err?.message || String(err),
    });
    return res.status(500).json({ message: "Failed to log push token debug." });
  }
};

module.exports = {
  registerUser,
  verifyEmail,
  getUsers,
  updateUser,
  verifyEmailForReset,
  forgotPasswordLookup,
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordResetPassword,
  forgotPasswordSkipReset,
  getVerificationStatus,
  resendVerificationEmail,
  sendOtp,
  verifyOtp,
  archiveUser,
  restoreUser,
  toggleTwoFactor,
  loginUser,
  updateLocation,
  updateShareSafetyLocation,
  getUserById,
  uploadAvatar,
  getUserNotifications,
  markNotificationsRead,
  clearNotifications,
  registerNotificationToken,
  logNotificationTokenDebug,
};
