const moduleLabels = {
  relief: "Relief",
  inventory: "Inventory",
  donation: "Donation",
  announcement: "Announcement",
  incident: "Incident",
  evacuation: "Evacuation",
  guidelines: "Guidelines",
  account: "Account",
  analytics: "Analytics",
  system: "System",
};

const roleLabels = {
  admin: "Admin",
  drrmo: "DRRMO",
  accountant: "Accountant",
  barangay: "Barangay",
  system: "System",
  all: "System",
};

const VALID_MODULES = new Set(Object.keys(moduleLabels));
const VALID_ACTOR_ROLES = new Set(["admin", "drrmo", "accountant", "barangay", "system"]);
const VALID_PRIORITIES = new Set(["low", "normal", "medium", "high", "critical"]);

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => normalizeString(value).toLowerCase();

const normalizeModuleValue = (value) => {
  const normalized = normalizeLower(value);
  return VALID_MODULES.has(normalized) ? normalized : "system";
};

const normalizeActorRoleValue = (value) => {
  const normalized = normalizeLower(value);
  if (normalized === "all") return "system";
  if (normalized === "brgy") return "barangay";
  if (normalized === "accounting") return "accountant";
  return VALID_ACTOR_ROLES.has(normalized) ? normalized : "system";
};

const normalizePriorityValue = (value) => {
  const normalized = normalizeLower(value);
  if (normalized === "medium") return "normal";
  return VALID_PRIORITIES.has(normalized) ? normalized : "normal";
};

const inferModuleFromLegacyFields = (input = {}) => {
  const category = normalizeLower(input.category);
  const referenceModel = normalizeLower(input.referenceModel);
  const type = normalizeLower(input.type);

  if (category.includes("relief") || referenceModel.includes("relief") || type.includes("relief")) {
    return "relief";
  }
  if (category.includes("donation") || referenceModel.includes("donation") || type.includes("donation")) {
    return "donation";
  }
  if (category.includes("inventory") || referenceModel.includes("inventory")) {
    return "inventory";
  }
  if (category.includes("guideline") || referenceModel.includes("guideline")) {
    return "guidelines";
  }
  if (category.includes("announcement") || referenceModel.includes("announcement")) {
    return "announcement";
  }
  if (category.includes("evac") || referenceModel.includes("evac")) {
    return "evacuation";
  }
  if (category.includes("incident") || referenceModel.includes("incident")) {
    return "incident";
  }
  return "system";
};

const formatModuleLabel = (moduleName) =>
  moduleLabels[normalizeModuleValue(moduleName)] || "System";

const formatRoleLabel = (roleName) =>
  roleLabels[normalizeActorRoleValue(roleName)] || "System";

const buildTargetLabel = (input = {}) => {
  return (
    normalizeString(input.targetLabel) ||
    normalizeString(input.barangayName) ||
    normalizeString(input.requestNo) ||
    normalizeString(input.releaseNo) ||
    normalizeString(input.referenceModel) ||
    ""
  );
};

const buildAuditEventPayload = (input = {}) => {
  const metadata =
    input && typeof input.metadata === "object" && input.metadata !== null
      ? input.metadata
      : {};

  const actorRole = normalizeActorRoleValue(
    input.actorRole || input.actionBy || metadata.actorRole || "system"
  );
  const moduleName = normalizeModuleValue(
    input.module || metadata.module || inferModuleFromLegacyFields(input)
  );
  const requestNo =
    normalizeString(input.requestNo) ||
    normalizeString(metadata.requestNo) ||
    normalizeString(metadata.referenceNo);
  const releaseNo = normalizeString(input.releaseNo) || normalizeString(metadata.releaseNo);
  const barangayName =
    normalizeString(input.barangayName) ||
    normalizeString(metadata.barangayName) ||
    normalizeString(metadata.recipientBarangayName);
  const disaster =
    normalizeString(input.disaster) ||
    normalizeString(metadata.disaster) ||
    normalizeString(metadata.hazard);
  const title = normalizeString(input.title) || "System activity";
  const message =
    normalizeString(input.message) ||
    normalizeString(input.peopleRange) ||
    "No details recorded.";

  return {
    module: moduleName,
    type: normalizeLower(input.type || input.category || metadata.type || "general") || "general",
    priority: normalizePriorityValue(input.priority || metadata.priority || "normal"),
    title,
    message,
    actorId: input.actorId ?? input.senderUser ?? metadata.actorId ?? null,
    actorName:
      normalizeString(input.actorName) ||
      normalizeString(metadata.actorName) ||
      normalizeString(input.actionBy === "barangay" ? input.barangayName : "") ||
      "System",
    actorRole,
    recipientRole: normalizeLower(input.recipientRole || metadata.recipientRole || ""),
    barangayId: input.barangayId || metadata.barangayId || null,
    barangayName,
    requestNo,
    releaseNo,
    disaster,
    status: normalizeLower(input.status || metadata.status || metadata.requestStatus || ""),
    referenceId: input.referenceId ?? metadata.referenceId ?? null,
    referenceModel:
      normalizeString(input.referenceModel) || normalizeString(metadata.referenceModel),
    targetLabel: buildTargetLabel({
      targetLabel: input.targetLabel || metadata.targetLabel,
      barangayName,
      requestNo,
      releaseNo,
      referenceModel: input.referenceModel || metadata.referenceModel,
    }),
    metadata,
    category: normalizeString(input.category || metadata.category),
    peopleRange: normalizeString(input.peopleRange || metadata.peopleRange),
    actionBy: actorRole,
    actionAt: input.actionAt || input.createdAt || new Date(),
  };
};

const buildAuditEventFromNotification = (input = {}) => {
  const metadata =
    input && typeof input.metadata === "object" && input.metadata !== null
      ? input.metadata
      : {};

  return buildAuditEventPayload({
    module: input.module,
    type: input.type,
    priority: input.priority,
    title: input.title,
    message: input.message,
    actorId: input.senderUser,
    actorName: input.senderName,
    actorRole: input.senderRole,
    recipientRole: input.recipientRole,
    barangayId: input.recipientBarangay || metadata.barangayId || null,
    barangayName:
      metadata.barangayName || input.recipientBarangayName || metadata.recipientBarangayName,
    requestNo: metadata.requestNo || metadata.referenceNo,
    releaseNo: metadata.releaseNo,
    disaster: metadata.disaster || metadata.hazard,
    status: metadata.status || metadata.requestStatus || "",
    referenceId: input.referenceId,
    referenceModel: input.referenceModel,
    targetLabel:
      metadata.targetLabel ||
      metadata.barangayName ||
      metadata.requestNo ||
      metadata.releaseNo ||
      input.referenceModel,
    metadata,
    category: input.type,
    peopleRange: normalizeString(metadata.auditSummary),
    actionAt: input.createdAt || new Date(),
  });
};

const mapAuditDocToEvent = (auditDoc) => {
  const doc = auditDoc?.toObject ? auditDoc.toObject() : { ...(auditDoc || {}) };
  const payload = buildAuditEventPayload(doc);
  const createdAt = doc.createdAt || doc.actionAt || null;

  return {
    _id: String(doc._id || `${payload.module}-${createdAt || Date.now()}`),
    source: "audit",
    module: payload.module,
    moduleLabel: formatModuleLabel(payload.module),
    type: payload.type,
    priority: payload.priority,
    title: payload.title,
    message: payload.message,
    actorName: payload.actorName || "System",
    actorRole: payload.actorRole,
    actorRoleLabel: formatRoleLabel(payload.actorRole),
    recipientRole: payload.recipientRole,
    recipientRoleLabel: payload.recipientRole ? formatRoleLabel(payload.recipientRole) : "",
    barangayName: payload.barangayName,
    requestNo: payload.requestNo,
    releaseNo: payload.releaseNo,
    disaster: payload.disaster,
    referenceId: payload.referenceId || null,
    referenceModel: payload.referenceModel,
    targetLabel: payload.targetLabel,
    createdAt,
    metadata: payload.metadata || {},
    legacyCategory: normalizeString(doc.category),
    legacyStatus: normalizeString(doc.status),
  };
};

const buildAuditSearchText = (event) =>
  [
    event.title,
    event.message,
    event.module,
    event.moduleLabel,
    event.type,
    event.actorName,
    event.actorRole,
    event.actorRoleLabel,
    event.barangayName,
    event.requestNo,
    event.releaseNo,
    event.disaster,
    event.referenceModel,
    event.targetLabel,
  ]
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

module.exports = {
  VALID_ACTOR_ROLES,
  VALID_MODULES,
  buildAuditEventFromNotification,
  buildAuditEventPayload,
  buildAuditSearchText,
  formatModuleLabel,
  formatRoleLabel,
  mapAuditDocToEvent,
  normalizeActorRoleValue,
  normalizeModuleValue,
  normalizePriorityValue,
  normalizeString,
};
