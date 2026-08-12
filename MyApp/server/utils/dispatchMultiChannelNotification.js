const NotificationDeliveryLog = require("../models/NotificationDeliveryLog");
const sendEmailNotification = require("./sendEmailNotification");
const {
  sendUniSms,
  trimSmsMessage,
  normalizePhilippinePhoneNumber,
} = require("./sendUniSms");
const {
  buildAnnouncementSms,
  buildGuidelineSms,
  buildAnnouncementEmail,
  buildGuidelineEmail,
  buildIncidentSmsMessage,
  buildIncidentEmail,
  buildClusterSmsMessage,
  buildClusterEmail,
} = require("./notificationMessageBuilders");

function sanitizeText(value, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeType(value) {
  return String(value || "notification")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "notification";
}

function getUserId(user) {
  return user?._id || user?.id || user?.userId || null;
}

function getUserPhone(user) {
  return user?.phone || user?.phoneNumber || user?.mobile || user?.contactNumber || "";
}

function getUserEmail(user) {
  return String(user?.email || "").trim().toLowerCase();
}

function getNormalizedUserPhone(user) {
  return normalizePhilippinePhoneNumber(getUserPhone(user));
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function buildDedupeKey(channel, { type, referenceId, notificationId, userId }) {
  const normalizedType = normalizeType(type);
  const reference = String(referenceId || notificationId || "general").trim();
  return `${channel}:${normalizedType}:${reference}:${String(userId || "").trim()}`;
}

function isUpdateType(type) {
  return ["announcement", "guideline"].includes(normalizeType(type));
}

function isEvacuationType(type) {
  return normalizeType(type).includes("evacuation");
}

function isIncidentApprovalType(type) {
  return normalizeType(type) === "incident_approved";
}

function isIncidentBarangayAlertType(type) {
  return normalizeType(type) === "incident_barangay_alert";
}

function isClusteredIncidentType(type) {
  const normalizedType = normalizeType(type);
  return [
    "clustered_incident",
    "nearby_repeated_incident",
    "barangay_incident_danger",
  ].includes(normalizedType);
}

function buildPostSmsMessage({ title, message, fallback }) {
  const cleanTitle = sanitizeText(title, 80).replace(/[.]+$/g, "");
  const cleanMessage = sanitizeText(message, 220);
  const suffix = " Open app for more info.";
  const prefix = "This is a sample message: ";
  const maxLength = Number(process.env.SMS_MAX_LENGTH || 150);
  let detail = cleanMessage;

  if (
    cleanTitle &&
    detail.toLowerCase().startsWith(cleanTitle.toLowerCase())
  ) {
    detail = detail
      .slice(cleanTitle.length)
      .replace(/^[\s:.-]+/, "")
      .trim();
  }

  const content = [cleanTitle, detail].filter(Boolean).join(". ");
  const baseContent = sanitizeText(content || fallback, 500);
  const maxContentLength = Math.max(0, maxLength - prefix.length - suffix.length);
  const shortContent = trimSmsMessage(baseContent, maxContentLength);
  return `${prefix}${shortContent}${suffix}`;
}

function buildSmsMessage(context) {
  const {
    type,
    title,
    message,
    barangay,
    incidentType,
    category,
    incident,
    smsMessage,
    clusterLandmark,
  } = context;

  if (smsMessage) return smsMessage;

  const normalizedType = normalizeType(type);
  const cleanBarangay = sanitizeText(barangay, 80);
  const cleanIncidentType = sanitizeText(incidentType || title, 40);

  if (isIncidentBarangayAlertType(normalizedType)) {
    if (incident) return buildIncidentSmsMessage(incident);
    const area = cleanBarangay ? ` in Brgy. ${cleanBarangay}` : "";
    const label = cleanIncidentType || "Incident";
    return trimSmsMessage(`This is a sample message: ${label} alert${area}. Stay alert.`, 150);
  }

  if (isClusteredIncidentType(normalizedType)) {
    return buildClusterSmsMessage({
      type: incidentType || title,
      barangay,
      landmark: clusterLandmark || context.incidentLocation,
    });
  }

  if (isEvacuationType(normalizedType)) {
    return trimSmsMessage(
      `This is a sample message: Evacuation advisory${cleanBarangay ? ` in Brgy. ${cleanBarangay}` : ""}. ${sanitizeText(message || "Check assigned center and follow MDRRMO instructions.", 90)}`,
      150
    );
  }

  if (normalizedType === "announcement") {
    return buildAnnouncementSms({
      title,
      description: message,
      category,
    });
  }

  if (normalizedType === "guideline") {
    return buildGuidelineSms({
      title,
      description: message,
      category,
    });
  }

  if (normalizedType.includes("incident") || cleanIncidentType) {
    const area = cleanBarangay ? ` in Brgy. ${cleanBarangay}` : "";
    const label = cleanIncidentType || "Danger";
    return trimSmsMessage(`This is a sample message: ${label} reported${area}. Avoid the area.`, 150);
  }

  return trimSmsMessage(`This is a sample message: ${sanitizeText(message || title, 130)}`, 150);
}

function buildEmailSubject({ type, title, urgent, barangay }) {
  const cleanTitle = sanitizeText(title, 120) || "SagipBayan Notification";
  if (isIncidentBarangayAlertType(type)) {
    return `SagipBayan Alert: Incident in Barangay ${sanitizeText(barangay, 80) || "your barangay"}`;
  }
  if (isUpdateType(type) && !urgent) return `SagipBayan Update: ${cleanTitle}`;
  if (isUpdateType(type)) return `SagipBayan Update: ${cleanTitle}`;
  return `SagipBayan Alert: ${cleanTitle}`;
}

function buildEmailMessage({ type, message, title, barangay, incidentType, incidentLocation }) {
  const cleanMessage = String(message || title || "Please open the SagipBayan app for details.").trim();

  if (isIncidentBarangayAlertType(type)) {
    const cleanBarangay = sanitizeText(barangay, 80) || "your barangay";
    const cleanIncidentType = sanitizeText(incidentType, 80) || "Incident";
    const cleanLocation = sanitizeText(incidentLocation, 180) || "Not specified";

    return [
      "Dear Resident,",
      "",
      `A verified incident has been reported in Barangay ${cleanBarangay}.`,
      "",
      `Incident Type: ${cleanIncidentType}`,
      `Location: ${cleanLocation}`,
      "Status: Verified by MDRRMO",
      "",
      "Please stay alert and follow official MDRRMO instructions.",
      "",
      "This is an automated notification from SagipBayan.",
    ].join("\n");
  }

  if (isUpdateType(type)) {
    return [
      "Dear Resident,",
      "",
      "The MDRRMO has posted a new update:",
      "",
      cleanMessage,
      "",
      "Please open the SagipBayan app for full details.",
      "",
      "This is an automated notification from SagipBayan.",
    ].join("\n");
  }

  if (isIncidentApprovalType(type)) {
    return [
      "Dear Resident,",
      "",
      cleanMessage,
      "",
      "Please open the SagipBayan app for full details.",
      "",
      "This is an automated notification from SagipBayan.",
    ].join("\n");
  }

  return [
    "Dear Resident,",
    "",
    cleanMessage,
    "",
    "Please stay alert and follow official MDRRMO instructions.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");
}

function buildEmailPayload(context) {
  const normalizedType = normalizeType(context.type);

  if (normalizedType === "announcement") {
    const payload = buildAnnouncementEmail(
      context.notification || {
        title: context.title,
        description: context.message,
        category: context.category,
        createdAt: context.createdAt,
        updatedAt: context.updatedAt,
        publishedNotificationSentAt: context.publishedNotificationSentAt,
      }
    );
    return {
      subject: context.emailSubject || payload.subject,
      message: context.emailMessage || payload.message,
      html: context.emailHtml || context.html || payload.html,
    };
  }

  if (normalizedType === "guideline") {
    const payload = buildGuidelineEmail(
      context.notification || {
        title: context.title,
        description: context.message,
        category: context.category,
        createdAt: context.createdAt,
        updatedAt: context.updatedAt,
        publishedNotificationSentAt: context.publishedNotificationSentAt,
      }
    );
    return {
      subject: context.emailSubject || payload.subject,
      message: context.emailMessage || payload.message,
      html: context.emailHtml || context.html || payload.html,
    };
  }

  if (isIncidentBarangayAlertType(normalizedType)) {
    const payload = buildIncidentEmail(
      context.incident || {
        type: context.incidentType,
        barangay: context.barangay,
        location: context.incidentLocation,
        description: context.message,
      }
    );
    return {
      subject: context.emailSubject || payload.subject,
      message: context.emailMessage || payload.message,
      html: context.emailHtml || context.html || payload.html,
    };
  }

  if (isClusteredIncidentType(normalizedType)) {
    const payload = buildClusterEmail({
      type: context.incidentType || context.title,
      barangay: context.barangay,
      barangays: context.clusterBarangays,
      locations: context.clusterLocations,
      landmark: context.clusterLandmark || context.incidentLocation,
      count: context.clusterCount,
    });
    return {
      subject: context.emailSubject || payload.subject,
      message: context.emailMessage || payload.message,
      html: context.emailHtml || context.html || payload.html,
    };
  }

  return {
    subject: context.emailSubject || buildEmailSubject(context),
    message: context.emailMessage || buildEmailMessage(context),
    html: context.emailHtml || context.html || "",
  };
}

async function createDeliveryLog({
  userId,
  notificationId,
  referenceId,
  channel,
  provider,
  status,
  phone = "",
  email = "",
  message = "",
  subject = "",
  dedupeKey,
  errorMessage = "",
  sentAt = null,
}) {
  try {
    await NotificationDeliveryLog.findOneAndUpdate(
      { dedupeKey },
      {
        $set: {
          userId,
          notificationId,
          referenceId,
          channel,
          provider,
          status,
          phone,
          email,
          message,
          subject,
          errorMessage: sanitizeText(errorMessage, 500),
          sentAt,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) return;
    console.log("[notification delivery log failed]", {
      channel,
      dedupeKey,
      message: err?.message || String(err),
    });
  }
}

async function dispatchSms({ user, context, summary }) {
  const userId = getUserId(user);
  const phone = getUserPhone(user);
  const normalizedPhone = getNormalizedUserPhone(user);
  const dedupeKey = buildDedupeKey("sms", { ...context, userId });

  if (await NotificationDeliveryLog.exists({ dedupeKey })) {
    console.log("[sms skipped duplicate]", { dedupeKey });
    summary.sms.skipped += 1;
    return;
  }

  const maxLength = Number(process.env.SMS_MAX_LENGTH || 150);
  const finalMessage = trimSmsMessage(
    buildSmsMessage(context),
    Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 150
  );
  const result = await sendUniSms({ to: normalizedPhone || phone, message: finalMessage });
  const status = result.ok ? "sent" : result.skipped ? "skipped" : "failed";

  await createDeliveryLog({
    userId,
    notificationId: context.notificationId,
    referenceId: context.referenceId,
    channel: "sms",
    provider: result.provider || process.env.SMS_PROVIDER || "unisms",
    status,
    phone: normalizedPhone,
    message: finalMessage,
    dedupeKey,
    errorMessage: result.errorMessage || result.reason || "",
    sentAt: result.ok ? new Date() : null,
  });

  summary.sms[status] += 1;
}

async function dispatchEmail({ user, context, summary }) {
  const userId = getUserId(user);
  const email = getUserEmail(user);
  const dedupeKey = buildDedupeKey("email", { ...context, userId });

  if (await NotificationDeliveryLog.exists({ dedupeKey })) {
    console.log("[email skipped duplicate]", { dedupeKey });
    summary.email.skipped += 1;
    return;
  }

  const { subject, message: emailMessage, html } = buildEmailPayload(context);
  const result = await sendEmailNotification({
    to: email,
    subject,
    message: emailMessage,
    html,
  });
  const status = result.ok ? "sent" : result.skipped ? "skipped" : "failed";

  await createDeliveryLog({
    userId,
    notificationId: context.notificationId,
    referenceId: context.referenceId,
    channel: "email",
    provider: "smtp",
    status,
    email,
    message: emailMessage,
    subject,
    dedupeKey,
    errorMessage: result.errorMessage || result.reason || "",
    sentAt: result.ok ? new Date() : null,
  });

  summary.email[status] += 1;
}

async function dispatchMultiChannelNotification({
  users,
  title,
  message,
  html,
  type,
  referenceId,
  notificationId,
  urgent = false,
  sendSms = false,
  sendEmail = false,
  smsMessage = "",
  emailSubject = "",
  emailMessage = "",
  emailHtml = "",
  category = "",
  notification = null,
  barangay = "",
  incidentType = "",
  incidentLocation = "",
  incident = null,
  clusterBarangays = [],
  clusterLocations = [],
  clusterCount = null,
  clusterLandmark = "",
}) {
  const recipients = Array.isArray(users) ? users.filter(Boolean) : [];
  const smsRecipients = sendSms
    ? recipients.filter((user) => Boolean(getNormalizedUserPhone(user)))
    : [];
  const emailRecipients = sendEmail
    ? recipients.filter((user) => Boolean(getUserEmail(user)))
    : [];
  const summary = {
    users: recipients.length,
    sms: { sent: 0, failed: 0, skipped: 0 },
    email: { sent: 0, failed: 0, skipped: 0 },
  };

  if (!recipients.length || (!sendSms && !sendEmail)) return summary;

  console.log("[notification dispatch start]", {
    type: normalizeType(type),
    referenceId: String(referenceId || ""),
    users: recipients.length,
    urgent: Boolean(urgent),
    sendSms: Boolean(sendSms),
    sendEmail: Boolean(sendEmail),
  });

  if (sendEmail) {
    console.log("[email recipients resolved]", {
      totalUsers: recipients.length,
      validEmailCount: recipients.filter((u) => Boolean(getUserEmail(u))).length,
      sampleEmails: recipients.slice(0, 5).map((u) => getUserEmail(u)),
    });
  }

  if (sendSms) {
    console.log("[sms recipients resolved]", {
      totalUsers: recipients.length,
      validPhoneCount: smsRecipients.length,
      invalidPhoneCount: Math.max(0, recipients.length - smsRecipients.length),
      samplePhones: recipients.slice(0, 5).map((u) => maskPhone(getUserPhone(u))),
    });
  }

  const context = {
    title,
    message,
    html,
    type,
    referenceId,
    notificationId,
    urgent: Boolean(urgent),
    smsMessage,
    emailSubject,
    emailMessage,
    emailHtml,
    category,
    notification,
    barangay,
    incidentType,
    incidentLocation,
    incident,
    clusterBarangays,
    clusterLocations,
    clusterCount,
    clusterLandmark,
  };

  for (const user of recipients) {
    try {
      if (sendSms && smsRecipients.includes(user)) {
        await dispatchSms({ user, context, summary });
      }

      if (sendEmail && emailRecipients.includes(user)) {
        await dispatchEmail({ user, context, summary });
      }
    } catch (err) {
      console.log("[notification dispatch failed]", {
        userId: String(getUserId(user) || ""),
        type: normalizeType(type),
        message: err?.message || String(err),
      });
    }
  }

  console.log("[notification dispatch complete]", {
    type: normalizeType(type),
    referenceId: String(referenceId || ""),
    users: summary.users,
    sms: summary.sms,
    email: summary.email,
  });

  return summary;
}

module.exports = dispatchMultiChannelNotification;
