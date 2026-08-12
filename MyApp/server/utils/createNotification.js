const Notification = require("../models/Notification");
const createAuditEvent = require("./createAuditEvent");
const { buildAuditEventFromNotification } = require("./auditEventUtils");

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeRole = (value) => {
  const role = normalizeString(value).toLowerCase();

  if (role === "drrmo") return "drrmo";
  if (role === "admin") return "admin";
  if (role === "accountant") return "accountant";
  if (role === "barangay") return "barangay";
  if (role === "all") return "all";

  return "all";
};

const createNotification = async ({
  recipientRole = "all",
  recipientUser = null,
  recipientUserModel = null,
  recipientBarangay = null,
  recipientBarangayName = "",

  senderUser = null,
  senderRole = "",
  senderName = "",

  module = "system",
  type = "general",
  priority = "normal",

  title,
  message,
  link = "",

  referenceId = null,
  referenceModel = "",
  metadata = {},
  expiresAt = null,
  audit = true,
  auditPayload = null,
} = {}) => {
  try {
    const cleanTitle = normalizeString(title);
    const cleanMessage = normalizeString(message);

    if (!cleanTitle || !cleanMessage) {
      return null;
    }

    const notification = await Notification.create({
      recipientRole: normalizeRole(recipientRole),
      recipientUser,
      recipientUserModel,
      recipientBarangay,
      recipientBarangayName: normalizeString(recipientBarangayName),

      senderUser,
      senderRole: normalizeRole(senderRole || "all"),
      senderName: normalizeString(senderName),

      module: normalizeString(module).toLowerCase() || "system",
      type: normalizeString(type).toLowerCase() || "general",
      priority: normalizeString(priority).toLowerCase() || "normal",

      title: cleanTitle,
      message: cleanMessage,
      link: normalizeString(link),

      referenceId,
      referenceModel: normalizeString(referenceModel),
      metadata: metadata || {},
      expiresAt,
    });

    if (audit) {
      await createAuditEvent(
        auditPayload ||
          buildAuditEventFromNotification({
            recipientRole,
            recipientUser,
            recipientUserModel,
            recipientBarangay,
            recipientBarangayName,
            senderUser,
            senderRole,
            senderName,
            module,
            type,
            priority,
            title: cleanTitle,
            message: cleanMessage,
            referenceId,
            referenceModel,
            metadata,
            createdAt: notification.createdAt,
          })
      );
    }

    return notification;
  } catch (err) {
    console.error("Create Notification Error:", err);
    return null;
  }
};

module.exports = createNotification;
