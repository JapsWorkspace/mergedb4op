const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const ReliefRequest = require("../models/ReliefRequest");
const ReliefRelease = require("../models/ReliefRelease");
const InventoryItem = require("../models/InventoryItem");
const InventoryLog = require("../models/InventoryLog");
const FoodPackTemplate = require("../models/FoodPackTemplate");
const createNotification = require("../utils/createNotification");
const createAuditEvent = require("../utils/createAuditEvent");
const {
  createPdfDocument,
  drawPdfEmptyState,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfImageGrid,
  drawPdfLabelValue,
  drawPdfParagraphBlock,
  drawPdfSectionTitle,
  drawPdfTable,
  formatPdfDateValue,
} = require("../utils/pdfTheme");
const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  normalizeSupportTypes,
  deriveLegacyRequestType,
  getSupportTypesFromRequest,
  getRequestedMonetaryAmountFromRequest,
  hasSupportType,
} = require("../utils/reliefSupportTypes");
const { normalizeRole } = require("../utils/roleAccessUtils");

const RELIEF_PROOF_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "proofs");

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
};

const normalizeRequestType = (value, supportTypes = []) =>
  deriveLegacyRequestType(normalizeSupportTypes(supportTypes, value));

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getInventoryExpiryStatus = (expirationDate) => {
  if (!expirationDate) return "no_expiry";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expirationDate);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) return "expired";
  if (daysUntilExpiration <= 30) return "soon";
  return "ok";
};

const parseIncomingReleaseBody = (body = {}) => {
  if (body?.payload && typeof body.payload === "string") {
    const parsed = JSON.parse(body.payload);
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  return body && typeof body === "object" ? body : {};
};

const escapeRegExp = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const removeUploadedProofFiles = async (files = []) => {
  const uploadedFiles = Array.isArray(files) ? files : [];
  if (!uploadedFiles.length) return;

  await Promise.allSettled(
    uploadedFiles
      .map((file) => file?.path)
      .filter(Boolean)
      .map((filePath) => fs.unlink(filePath))
  );
};

const buildStoredProofPath = (fileName = "") => {
  const normalized = normalizeString(fileName).replace(/^\/+/, "");
  if (!normalized) return "";
  return `uploads/proofs/${normalized}`;
};

const resolveProofLocalPath = (proofFile = "") => {
  const normalized = normalizeString(proofFile).replace(/\\/g, "/");
  if (!normalized) return null;

  if (normalized.startsWith("uploads/proofs/")) {
    return path.join(__dirname, "..", normalized);
  }

  if (normalized.startsWith("proofs/")) {
    return path.join(__dirname, "..", "uploads", normalized);
  }

  if (normalized.includes("/")) {
    return path.join(__dirname, "..", normalized);
  }

  return path.join(RELIEF_PROOF_UPLOAD_DIR, normalized);
};

const isImageProofPath = (proofFile = "") =>
  /\.(png|jpe?g|webp|gif)$/i.test(normalizeString(proofFile));

const collectProofImagesForPdf = (proofFiles = [], options = {}) => {
  const { maxImages = 3, labelPrefix = "Proof" } = options;
  const safeFiles = (Array.isArray(proofFiles) ? proofFiles : [])
    .map((file) => normalizeString(file))
    .filter(Boolean)
    .filter(isImageProofPath);

  const resolved = [];

  for (let index = 0; index < safeFiles.length && resolved.length < maxImages; index += 1) {
    const localPath = resolveProofLocalPath(safeFiles[index]);
    if (!localPath) continue;
    resolved.push({
      path: localPath,
      caption: `${labelPrefix} ${resolved.length + 1}`,
    });
  }

  return {
    images: resolved,
    remainingCount: Math.max(0, safeFiles.length - resolved.length),
  };
};

const formatMonetaryAmount = (value) =>
  toNumber(value).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const requiresFoodPackFulfillment = (request = {}) =>
  hasSupportType(getSupportTypesFromRequest(request), SUPPORT_TYPE_FOODPACKS);

const requiresMonetaryFulfillment = (request = {}) =>
  hasSupportType(getSupportTypesFromRequest(request), SUPPORT_TYPE_MONETARY);

const requiresApplianceFulfillment = (request = {}) =>
  hasSupportType(getSupportTypesFromRequest(request), SUPPORT_TYPE_APPLIANCE);

const getRequestDemandProfile = (request = {}) => {
  const supportTypes = getSupportTypesFromRequest(request);
  const requestType = normalizeRequestType(request.requestType, supportTypes);
  const totals = request.totals || {};

  return {
    requestType,
    supportTypes,
    requiresFoodPacks: requiresFoodPackFulfillment({ supportTypes, requestType }),
    requiresMonetary: requiresMonetaryFulfillment({ supportTypes, requestType }),
    requiresAppliance: requiresApplianceFulfillment({ supportTypes, requestType }),
    requestedFoodPacks: requiresFoodPackFulfillment({ supportTypes, requestType })
      ? toNumber(totals.requestedFoodPacks)
      : 0,
    requestedMonetaryAmount: requiresMonetaryFulfillment({ supportTypes, requestType })
      ? getRequestedMonetaryAmountFromRequest(request)
      : 0,
    requestedAppliances: Array.isArray(request.requestedAppliances)
      ? request.requestedAppliances
          .map((item) => ({
            itemName: normalizeString(item.itemName),
            category: normalizeLower(item.category),
            quantityRequested: toNumber(item.quantityRequested),
            remarks: normalizeString(item.remarks),
          }))
          .filter((item) => item.itemName && item.category && item.quantityRequested > 0)
      : [],
    requestedApplianceQuantity: Array.isArray(request.requestedAppliances)
      ? request.requestedAppliances.reduce(
          (sum, item) => sum + toNumber(item.quantityRequested),
          0
        )
      : 0,
  };
};

const canRoleManageReleaseRequest = (role = "", request = {}) => {
  const normalizedRole = normalizeRole(role);
  const supportTypes = getSupportTypesFromRequest(request);

  if (normalizedRole === "admin" || normalizedRole === "accountant") {
    return hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY);
  }

  if (normalizedRole === "drrmo") {
    return (
      hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS) ||
      hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)
    );
  }

  return false;
};

const isMonetaryOnlyReliefRequest = (request = {}) => {
  const supportTypes = getSupportTypesFromRequest(request);

  return (
    hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)
  );
};

const getRequestOwnerRole = (request = {}) =>
  isMonetaryOnlyReliefRequest(request) ? "admin" : "drrmo";

const getRequestOwnerLabel = (request = {}) =>
  getRequestOwnerRole(request) === "admin" ? "Admin" : "DRRMO";

const formatDateValue = formatPdfDateValue;

const formatStatusLabel = (status) => {
  const normalized = normalizeString(status).toLowerCase();
  if (!normalized) return "-";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const computePrioritySnapshotFromRequest = (request) => {
  const totals = request?.totals || {};

  const totalAffected =
    toNumber(totals.male) +
    toNumber(totals.female) +
    toNumber(totals.lgbtq) +
    toNumber(totals.pwd) +
    toNumber(totals.pregnant) +
    toNumber(totals.senior);

  const vulnerableCount =
    toNumber(totals.pwd) +
    toNumber(totals.pregnant) +
    toNumber(totals.senior);

  const requestedFoodPacks = toNumber(totals.requestedFoodPacks);

  const requestDate = request?.requestDate ? new Date(request.requestDate) : null;
  const now = new Date();
  const waitingMs = requestDate ? now.getTime() - requestDate.getTime() : 0;
  const waitingDays = Math.max(0, Math.floor(waitingMs / (1000 * 60 * 60 * 24)));

  const priorityScore =
    waitingDays * 5 +
    requestedFoodPacks * 0.2 +
    toNumber(totals.pwd) * 3 +
    toNumber(totals.pregnant) * 3 +
    toNumber(totals.senior) * 2 +
    toNumber(totals.families);

  return {
    totalAffected,
    vulnerableCount,
    priorityScore,
  };
};

const generateReleaseNo = async (session = null) => {
  const year = new Date().getFullYear();
  const prefix = `RL-${year}`;

  const latest = await ReliefRelease.findOne({
    releaseNo: { $regex: `^${prefix}-` },
  })
    .sort({ createdAt: -1 })
    .session(session);

  let nextNumber = 1;

  if (latest?.releaseNo) {
    const parts = latest.releaseNo.split("-");
    const lastSeq = Number(parts[2]);
    if (!Number.isNaN(lastSeq)) {
      nextNumber = lastSeq + 1;
    }
  }

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};

const validateReleaseItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one release item is required.";
  }

  for (const item of items) {
    const itemName = normalizeString(item.itemName);
    const itemType =
      normalizeLower(item.itemType) === "appliance" ? "appliance" : "goods";
    const category = normalizeLower(item.category);
    const quantityReleased = toNumber(item.quantityReleased);
    const unit = normalizeString(item.unit);

    if (!itemName) {
      return "Each release item must have an item name.";
    }

    if (!category) {
      return `Category is required for item "${itemName}".`;
    }

    if (quantityReleased <= 0) {
      return `Quantity released must be greater than 0 for item "${itemName}".`;
    }

    if (itemType !== "appliance" && !unit) {
      return `Unit is required for item "${itemName}".`;
    }
  }

  return null;
};

const buildInventorySignature = (item = {}) => ({
  itemType: normalizeLower(item.itemType || "goods"),
  name: normalizeLower(item.itemName || item.name),
  category: normalizeLower(item.category),
  unit: normalizeLower(item.unit),
});

const sortInventoryDocsForAllocation = (docs = []) => {
  return docs.slice().sort((a, b) => {
    const aExpiry = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
    const bExpiry = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;

    if (aExpiry !== bExpiry) return aExpiry - bExpiry;

    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aCreated - bCreated;
  });
};

const allocateInventoryForReleaseItem = async (item, session) => {
  const normalizedSignature = buildInventorySignature(item);
  const uniqueCandidates = new Map();

  const addCandidate = (doc) => {
    if (!doc || !doc._id) return;
    uniqueCandidates.set(String(doc._id), doc);
  };

  if (item.inventoryItemId && mongoose.Types.ObjectId.isValid(item.inventoryItemId)) {
    const byIdDoc = await InventoryItem.findOne({
      _id: item.inventoryItemId,
      isArchive: false,
      type: normalizedSignature.itemType === "appliance" ? "appliance" : "goods",
    }).session(session);

    addCandidate(byIdDoc);
  }

  if (
    normalizedSignature.name &&
    normalizedSignature.category &&
    normalizedSignature.unit
  ) {
    const signatureMatches = await InventoryItem.find({
      isArchive: false,
      type: normalizedSignature.itemType === "appliance" ? "appliance" : "goods",
      name: new RegExp(`^${escapeRegExp(normalizedSignature.name)}$`, "i"),
      category: normalizedSignature.category,
      ...(normalizedSignature.itemType === "appliance"
        ? {}
        : {
            unit: new RegExp(
              `^${escapeRegExp(normalizedSignature.unit)}$`,
              "i"
            ),
          }),
    }).session(session);

    signatureMatches.forEach(addCandidate);
  }

  const candidates = sortInventoryDocsForAllocation(
    Array.from(uniqueCandidates.values()).filter(
      (doc) =>
        Number(doc.quantity || 0) > 0 &&
        (normalizedSignature.itemType === "appliance" ||
          getInventoryExpiryStatus(doc.expirationDate) !== "expired")
    )
  );

  const requestedQty = Number(item.quantityReleased || 0);
  const totalAvailable = candidates.reduce(
    (sum, doc) => sum + Number(doc.quantity || 0),
    0
  );

  let remainingQty = requestedQty;
  const allocations = [];

  for (const candidate of candidates) {
    if (remainingQty <= 0) break;

    const availableQty = Number(candidate.quantity || 0);
    if (availableQty <= 0) continue;

    const quantityToUse = Math.min(remainingQty, availableQty);
    remainingQty -= quantityToUse;

    allocations.push({
      inventoryDoc: candidate,
      quantity: quantityToUse,
    });
  }

  return {
    requestedQty,
    totalAvailable,
    allocations,
    primaryInventoryDoc: allocations[0]?.inventoryDoc || candidates[0] || null,
  };
};

const allocateMonetaryInventory = async (requestedAmount, session) => {
  const normalizedAmount = toNumber(requestedAmount);

  const candidates = await InventoryItem.find({
    isArchive: false,
    type: "monetary",
    amount: { $gt: 0 },
  })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);

  const totalAvailable = candidates.reduce(
    (sum, doc) => sum + toNumber(doc.amount),
    0
  );

  let remainingAmount = normalizedAmount;
  const allocations = [];

  for (const candidate of candidates) {
    if (remainingAmount <= 0) break;

    const availableAmount = toNumber(candidate.amount);
    if (availableAmount <= 0) continue;

    const amountToUse = Math.min(remainingAmount, availableAmount);
    remainingAmount -= amountToUse;

    allocations.push({
      inventoryDoc: candidate,
      amount: amountToUse,
    });
  }

  return {
    requestedAmount: normalizedAmount,
    totalAvailable,
    allocations,
    primaryInventoryDoc: allocations[0]?.inventoryDoc || candidates[0] || null,
  };
};

const buildTemplateReleaseItems = async (
  foodPackTemplateId,
  foodPacksToRelease,
  session
) => {
  const template = await FoodPackTemplate.findById(foodPackTemplateId).session(
    session
  );

  if (!template || template.isArchived) {
    return {
      error: "Food pack template not found.",
    };
  }

  if (!template.isActive) {
    return {
      error: "Selected food pack template is inactive.",
    };
  }

  const packCount = toNumber(foodPacksToRelease);

  if (packCount <= 0) {
    return {
      error: "Food packs to release must be greater than 0.",
    };
  }

  const generatedItems = [];

  for (const item of template.items || []) {
    const matchingInventoryDocs = sortInventoryDocsForAllocation(
      await InventoryItem.find({
        isArchive: false,
        type: "goods",
        name: item.itemName,
        category: item.category,
        unit: item.unit,
      }).session(session)
    );
    const inventoryDoc =
      matchingInventoryDocs.find((doc) => Number(doc.quantity || 0) > 0) || null;

    if (!inventoryDoc) {
      return {
        error: `Inventory item not available for template item "${item.itemName}".`,
      };
    }

    if (getInventoryExpiryStatus(inventoryDoc.expirationDate) === "expired") {
      return {
        error: `Template item "${item.itemName}" is expired and must be updated before release.`,
      };
    }

    generatedItems.push({
      inventoryItemId: inventoryDoc._id,
      itemName: normalizeString(item.itemName || inventoryDoc.name),
      category: normalizeLower(item.category || inventoryDoc.category),
      quantityReleased: Number(item.quantityPerPack || 0) * packCount,
      unit: normalizeString(item.unit || inventoryDoc.unit),
      remarks: normalizeString(
        item.remarks || `Generated from template: ${template.name}`
      ),
    });
  }

  const validationError = validateReleaseItems(generatedItems);
  if (validationError) {
    return { error: validationError };
  }

  return {
    template,
    items: generatedItems,
    foodPacksReleased: packCount,
  };
};

const inferManualFoodPacksReleased = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const directPackItems = items.filter((item) => {
    const itemName = normalizeLower(item.itemName);
    const category = normalizeLower(item.category);
    const unit = normalizeLower(item.unit);

    const looksLikeFoodPackName =
      itemName.includes("food pack") ||
      itemName.includes("foodpack") ||
      itemName.includes("relief pack") ||
      itemName.includes("pack");

    const looksLikeFoodPackCategory =
      category.includes("food pack") ||
      category.includes("foodpack");

    const looksLikePackUnit = unit === "pack" || unit === "packs";

    return looksLikeFoodPackName || looksLikeFoodPackCategory || looksLikePackUnit;
  });

  if (directPackItems.length === 0) return 0;

  return directPackItems.reduce(
    (sum, item) => sum + toNumber(item.quantityReleased),
    0
  );
};

const buildFulfillmentFromReleases = (releases = []) => {
  const totalReleases = releases.length;

  const releasedFoodPacks = releases.reduce(
    (sum, release) => sum + toNumber(release.foodPacksReleased),
    0
  );

  const receivedFoodPacks = releases
    .filter((release) => release.releaseStatus === "received")
    .reduce((sum, release) => sum + toNumber(release.foodPacksReleased), 0);

  const releasedMonetaryAmount = releases.reduce(
    (sum, release) => sum + toNumber(release.releasedMonetaryAmount),
    0
  );

  const receivedMonetaryAmount = releases
    .filter((release) => release.releaseStatus === "received")
    .reduce((sum, release) => sum + toNumber(release.receivedMonetaryAmount), 0);

  const releasedApplianceQuantity = releases.reduce(
    (sum, release) =>
      sum +
      (Array.isArray(release.items)
        ? release.items
            .filter((item) => normalizeLower(item.itemType) === "appliance")
            .reduce(
              (innerSum, item) => innerSum + toNumber(item.quantityReleased),
              0
            )
        : 0),
    0
  );

  const receivedApplianceQuantity = releases
    .filter((release) => release.releaseStatus === "received")
    .reduce(
      (sum, release) =>
        sum +
        (Array.isArray(release.items)
          ? release.items
              .filter((item) => normalizeLower(item.itemType) === "appliance")
              .reduce(
                (innerSum, item) => innerSum + toNumber(item.quantityReleased),
                0
              )
          : 0),
      0
    );

  const receivedReleases = releases.filter(
    (release) => release.releaseStatus === "received"
  ).length;

  const pendingReleases = releases.filter(
    (release) => release.releaseStatus === "released"
  ).length;

  const lastRelease = releases
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  return {
    totalReleases,
    releasedFoodPacks,
    receivedFoodPacks,
    releasedMonetaryAmount,
    receivedMonetaryAmount,
    releasedApplianceQuantity,
    receivedApplianceQuantity,
    receivedReleases,
    pendingReleases,
    lastReleaseAt: lastRelease?.releasedAt || lastRelease?.createdAt || null,
  };
};

const deriveCurrentStage = (request) => {
  if (!request) return "preparation";
  if (normalizeString(request.currentStage).toLowerCase() === "accomplished") {
    return "accomplished";
  }

  if (request.status === "pending") return "pending_review";
  if (request.status === "rejected") return "rejected";
  if (request.status === "approved") return "approved_waiting_release";
  if (request.status === "partially_released") return "partially_released";
  if (request.status === "released") return "released_waiting_receipt";
  if (request.status === "received") return "completed";
  if (request.status === "cancelled") return "completed";

  return "pending_review";
};

const refreshRequestProgress = async (requestId, session = null) => {
  const request = await ReliefRequest.findById(requestId).session(session);
  if (!request || request.isArchived) return null;

  const releases = await ReliefRelease.find({
    reliefRequestId: request._id,
    isArchived: false,
  })
    .sort({ createdAt: -1 })
    .session(session);

  const fulfillment = buildFulfillmentFromReleases(releases);
  const demand = getRequestDemandProfile(request);
  const releasedFoodPacks = toNumber(fulfillment.releasedFoodPacks);
  const receivedFoodPacks = toNumber(fulfillment.receivedFoodPacks);
  const releasedMonetaryAmount = toNumber(fulfillment.releasedMonetaryAmount);
  const receivedMonetaryAmount = toNumber(fulfillment.receivedMonetaryAmount);
  const releasedApplianceQuantity = toNumber(
    fulfillment.releasedApplianceQuantity
  );
  const receivedApplianceQuantity = toNumber(
    fulfillment.receivedApplianceQuantity
  );

  const hasAnyRelease = releases.length > 0;

  request.fulfillment = {
    totalReleases: fulfillment.totalReleases,
    releasedFoodPacks: fulfillment.releasedFoodPacks,
    releasedMonetaryAmount: fulfillment.releasedMonetaryAmount,
    releasedApplianceQuantity: fulfillment.releasedApplianceQuantity,
    receivedFoodPacks: fulfillment.receivedFoodPacks,
    receivedMonetaryAmount: fulfillment.receivedMonetaryAmount,
    receivedApplianceQuantity: fulfillment.receivedApplianceQuantity,
    receivedReleases: fulfillment.receivedReleases,
    pendingReleases: fulfillment.pendingReleases,
    lastReleaseAt: fulfillment.lastReleaseAt,
  };

  request.prioritySnapshot = computePrioritySnapshotFromRequest(request);

  if (!hasAnyRelease) {
    if (!["pending", "rejected", "cancelled", "received"].includes(request.status)) {
      request.status = "approved";
      request.currentStage = "approved_waiting_release";
    }
  } else if (
    demand.requestedFoodPacks > 0 ||
    demand.requestedMonetaryAmount > 0 ||
    demand.requestedApplianceQuantity > 0
  ) {
    const fullyReleased =
      (!demand.requiresFoodPacks ||
        releasedFoodPacks >= demand.requestedFoodPacks) &&
      (!demand.requiresMonetary ||
        releasedMonetaryAmount >= demand.requestedMonetaryAmount) &&
      (!demand.requiresAppliance ||
        releasedApplianceQuantity >= demand.requestedApplianceQuantity);

    const fullyReceived =
      (!demand.requiresFoodPacks ||
        receivedFoodPacks >= demand.requestedFoodPacks) &&
      (!demand.requiresMonetary ||
        receivedMonetaryAmount >= demand.requestedMonetaryAmount) &&
      (!demand.requiresAppliance ||
        receivedApplianceQuantity >= demand.requestedApplianceQuantity);

    if (fullyReceived) {
      request.status = "received";
      request.currentStage =
        normalizeString(request.currentStage).toLowerCase() === "accomplished"
          ? "accomplished"
          : "completed";
      if (!request.receivedAt) {
        request.receivedAt = new Date();
      }
    } else if (fullyReleased) {
      request.status = "released";
      request.currentStage = "released_waiting_receipt";
      request.receivedAt = null;
    } else {
      request.status = "partially_released";
      request.currentStage = "partially_released";
      request.receivedAt = null;
    }
  } else {
    const hasOutstandingReleased = releases.some(
      (release) => release.releaseStatus === "released"
    );
    const hasReceivedRelease = releases.some(
      (release) => release.releaseStatus === "received"
    );

    if (hasOutstandingReleased && hasReceivedRelease) {
      request.status = "partially_released";
      request.currentStage = "partially_released";
      request.receivedAt = null;
    } else if (hasOutstandingReleased) {
      request.status = "released";
      request.currentStage = "released_waiting_receipt";
      request.receivedAt = null;
    } else if (hasReceivedRelease) {
      request.status = "received";
      request.currentStage =
        normalizeString(request.currentStage).toLowerCase() === "accomplished"
          ? "accomplished"
          : "completed";
      if (!request.receivedAt) {
        request.receivedAt = new Date();
      }
    }
  }

  if (!request.currentStage) {
    request.currentStage = deriveCurrentStage(request);
  }

  await request.save({ session });
  return request;
};

/* GET REQUESTS READY FOR RELEASE */
const getApprovedRequestsForRelease = async (req, res) => {
  try {
    const sessionRole = normalizeRole(req.session?.role);
    const requests = await ReliefRequest.find({
      status: { $in: ["approved", "partially_released"] },
      isArchived: false,
    }).sort({ createdAt: -1 });

    res.json(
      requests.filter((request) => canRoleManageReleaseRequest(sessionRole, request)).map((request) => ({
        ...(request.toObject?.() || request),
        supportTypes: getSupportTypesFromRequest(request),
        requestType: normalizeRequestType(
          request.requestType,
          getSupportTypesFromRequest(request)
        ),
        requestedAppliances: Array.isArray(request?.requestedAppliances)
          ? request.requestedAppliances.map((item) => ({
              itemName: normalizeString(item.itemName),
              category: normalizeLower(item.category),
              quantityRequested: toNumber(item.quantityRequested),
              remarks: normalizeString(item.remarks),
            }))
          : [],
        totals: {
          ...(request.totals?.toObject?.() || request.totals || {}),
          requestedFoodPacks: toNumber(request?.totals?.requestedFoodPacks),
          requestedMonetaryAmount: getRequestedMonetaryAmountFromRequest(request),
          requestedApplianceQuantity:
            Array.isArray(request?.requestedAppliances) &&
            request.requestedAppliances.length > 0
              ? request.requestedAppliances.reduce(
                  (sum, item) => sum + toNumber(item.quantityRequested),
                  0
                )
              : toNumber(request?.totals?.requestedApplianceQuantity),
        },
        fulfillment: {
          ...(request.fulfillment?.toObject?.() || request.fulfillment || {}),
          releasedFoodPacks: toNumber(request?.fulfillment?.releasedFoodPacks),
          releasedMonetaryAmount: toNumber(
            request?.fulfillment?.releasedMonetaryAmount
          ),
          releasedApplianceQuantity: toNumber(
            request?.fulfillment?.releasedApplianceQuantity
          ),
          receivedFoodPacks: toNumber(request?.fulfillment?.receivedFoodPacks),
          receivedMonetaryAmount: toNumber(
            request?.fulfillment?.receivedMonetaryAmount
          ),
          receivedApplianceQuantity: toNumber(
            request?.fulfillment?.receivedApplianceQuantity
          ),
        },
      }))
    );
  } catch (err) {
    console.error("Get Approved Requests For Release Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* CREATE RELEASE AND DEDUCT INVENTORY */
const createReliefRelease = async (req, res) => {
  const session = await mongoose.startSession();
  const uploadedProofFiles = Array.isArray(req.files) ? req.files : [];
  let shouldCleanupUploadedProofFiles = uploadedProofFiles.length > 0;
  let transactionStarted = false;

  try {
    const username = String(req.session?.username || req.session?.userId || "");
    const sessionRole = normalizeRole(req.session?.role);
    const body = parseIncomingReleaseBody(req.body);
    const {
      reliefRequestId,
      items,
      remarks,
      foodPackTemplateId,
      releaseMode,
      isFinalRelease,
    } = body;

    const incomingFoodPackCount = toNumber(
      body.foodPacksToRelease ??
        body.foodPacksReleased ??
        body.foodPacks ??
        0
    );
    const incomingMonetaryAmount = toNumber(
      body.releasedMonetaryAmount ??
        body.monetaryAmountToRelease ??
        body.monetaryAmount ??
        0
    );

    if (!reliefRequestId) {
      return res.status(400).json({ message: "Relief request ID is required." });
    }

    if (uploadedProofFiles.length === 0) {
      return res.status(400).json({
        message: "Attach at least one release proof image before submitting.",
      });
    }

    session.startTransaction();
    transactionStarted = true;

    const reliefRequest = await ReliefRequest.findById(reliefRequestId).session(
      session
    );

    if (!reliefRequest || reliefRequest.isArchived) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Relief request not found." });
    }

    if (!canRoleManageReleaseRequest(sessionRole, reliefRequest)) {
      await session.abortTransaction();
      return res.status(403).json({
        message:
          sessionRole === "admin" || sessionRole === "accountant"
            ? `${sessionRole === "accountant" ? "Accountant" : "Admin"} can only release requests with monetary assistance.`
            : "DRRMO can only release food pack or appliance requests.",
      });
    }

    if (!["approved", "partially_released"].includes(reliefRequest.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Only approved or partially released requests can be released.",
      });
    }

    const requestType = normalizeRequestType(reliefRequest.requestType);
    const demand = getRequestDemandProfile(reliefRequest);
    const currentReleasedFoodPacks = toNumber(
      reliefRequest?.fulfillment?.releasedFoodPacks
    );
    const currentReleasedMonetaryAmount = toNumber(
      reliefRequest?.fulfillment?.releasedMonetaryAmount
    );
    const currentReleasedApplianceQuantity = toNumber(
      reliefRequest?.fulfillment?.releasedApplianceQuantity
    );
    const remainingFoodPacks = Math.max(
      0,
      demand.requestedFoodPacks - currentReleasedFoodPacks
    );
    const remainingMonetaryAmount = Math.max(
      0,
      demand.requestedMonetaryAmount - currentReleasedMonetaryAmount
    );
    const remainingApplianceQuantity = Math.max(
      0,
      demand.requestedApplianceQuantity - currentReleasedApplianceQuantity
    );

    const requestedMode = normalizeLower(releaseMode);
    const isTemplateMode =
      demand.requiresFoodPacks &&
      (requestedMode === "template" || !!normalizeString(foodPackTemplateId));
    const normalizedIncomingItems = Array.isArray(items)
      ? items.map((item) => ({
          inventoryItemId: item.inventoryItemId || null,
          itemType:
            normalizeLower(item.itemType) === "appliance" ? "appliance" : "goods",
          itemName: normalizeString(item.itemName),
          category: normalizeLower(item.category),
          quantityReleased: toNumber(item.quantityReleased),
          unit: normalizeString(item.unit),
          remarks: normalizeString(item.remarks),
        }))
      : [];
    const applianceReleaseItems = normalizedIncomingItems.filter(
      (item) => item.itemType === "appliance"
    );
    const isReleasingFoodPacks =
      demand.requiresFoodPacks && (isTemplateMode || incomingFoodPackCount > 0);
    const isReleasingMonetary =
      demand.requiresMonetary && incomingMonetaryAmount > 0;
    const isReleasingAppliances =
      demand.requiresAppliance && applianceReleaseItems.length > 0;

    let finalReleaseMode = "manual";
    let releaseItems = [];
    let foodPackTemplate = null;
    let releasedFoodPackCount = 0;
    let releasedMonetaryAmount = 0;
    let releasedApplianceQuantity = 0;

    if (!isReleasingFoodPacks && !isReleasingMonetary && !isReleasingAppliances) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Add at least one support item or amount to release.",
      });
    }

    if (
      (sessionRole === "admin" || sessionRole === "accountant") &&
      (isReleasingFoodPacks || isReleasingAppliances)
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `${sessionRole === "accountant" ? "Accountant" : "Admin"} release planning only supports monetary assistance.`,
      });
    }

    if (sessionRole === "drrmo" && isReleasingMonetary) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "DRRMO can no longer release monetary assistance requests.",
      });
    }

    if (isReleasingFoodPacks) {
      if (isTemplateMode) {
        finalReleaseMode = "template";

        const built = await buildTemplateReleaseItems(
          foodPackTemplateId,
          incomingFoodPackCount,
          session
        );

        if (built.error) {
          await session.abortTransaction();
          return res.status(400).json({ message: built.error });
        }

        foodPackTemplate = built.template;
        releaseItems = built.items;
        releasedFoodPackCount = built.foodPacksReleased;
      } else {
        finalReleaseMode = "manual";

        releaseItems = normalizedIncomingItems.filter(
          (item) => item.itemType !== "appliance"
        );

        const validationError = validateReleaseItems(releaseItems);
        if (validationError) {
          await session.abortTransaction();
          return res.status(400).json({ message: validationError });
        }

        releasedFoodPackCount =
          incomingFoodPackCount > 0
            ? incomingFoodPackCount
            : inferManualFoodPacksReleased(releaseItems);
      }

      if (releasedFoodPackCount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "Food pack release quantity is required for this request type.",
        });
      }

      if (remainingFoodPacks <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "This request no longer has pending food packs to release.",
        });
      }

      if (releasedFoodPackCount !== remainingFoodPacks) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Release must fulfill the exact remaining approved food packs (${remainingFoodPacks}).`,
        });
      }
    }

    if (isReleasingMonetary) {
      releasedMonetaryAmount = incomingMonetaryAmount;

      if (releasedMonetaryAmount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "Released monetary amount is required for this request type.",
        });
      }

      if (remainingMonetaryAmount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "This request no longer has a pending monetary amount to release.",
        });
      }

      if (releasedMonetaryAmount !== remainingMonetaryAmount) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Monetary release must match the full remaining approved amount of PHP ${formatMonetaryAmount(
            remainingMonetaryAmount
          )}.`,
        });
      }
    }

    if (isReleasingAppliances) {
      const validationError = validateReleaseItems(applianceReleaseItems);
      if (validationError) {
        await session.abortTransaction();
        return res.status(400).json({ message: validationError });
      }

      releasedApplianceQuantity = applianceReleaseItems.reduce(
        (sum, item) => sum + toNumber(item.quantityReleased),
        0
      );

      if (remainingApplianceQuantity <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "This request no longer has pending appliance items to release.",
        });
      }

      if (releasedApplianceQuantity > remainingApplianceQuantity) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Appliance release cannot exceed the remaining approved appliance quantity (${remainingApplianceQuantity}).`,
        });
      }
    }

    const preparedItems = [];

    if (isReleasingFoodPacks) {
      for (const item of releaseItems) {
        const allocation = await allocateInventoryForReleaseItem(item, session);

        if (!allocation.primaryInventoryDoc) {
          await session.abortTransaction();
          return res.status(404).json({
            message: `Inventory item not found for "${item.itemName}".`,
          });
        }

        if (allocation.totalAvailable < allocation.requestedQty) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Insufficient stock for "${item.itemName}". Available: ${allocation.totalAvailable}, requested release: ${allocation.requestedQty}.`,
          });
        }

        for (const split of allocation.allocations) {
          split.inventoryDoc.quantity =
            Number(split.inventoryDoc.quantity || 0) - split.quantity;

          await split.inventoryDoc.save({ session });

          await InventoryLog.create(
            [
              {
                inventoryItem: split.inventoryDoc._id,
                itemName: split.inventoryDoc.name,
                itemType: split.inventoryDoc.type,
                action: "release",
                quantity: split.quantity,
                amount: undefined,
                performedBy: username,
                remarks: `Released for relief request ${reliefRequest.requestNo}`,
              },
            ],
            { session }
          );
        }

        preparedItems.push({
          inventoryItemId:
            item.inventoryItemId || allocation.primaryInventoryDoc._id,
          itemType: "goods",
          itemName: normalizeString(
            item.itemName || allocation.primaryInventoryDoc.name
          ),
          category: normalizeLower(
            item.category || allocation.primaryInventoryDoc.category
          ),
          quantityReleased: allocation.requestedQty,
          unit: normalizeString(item.unit || allocation.primaryInventoryDoc.unit),
          remarks: item.remarks,
        });
      }
    }

    if (isReleasingAppliances) {
      for (const item of applianceReleaseItems) {
        const allocation = await allocateInventoryForReleaseItem(item, session);

        if (!allocation.primaryInventoryDoc) {
          await session.abortTransaction();
          return res.status(404).json({
            message: `Inventory item not found for "${item.itemName}".`,
          });
        }

        if (allocation.totalAvailable < allocation.requestedQty) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Insufficient stock for "${item.itemName}". Available: ${allocation.totalAvailable}, requested release: ${allocation.requestedQty}.`,
          });
        }

        for (const split of allocation.allocations) {
          split.inventoryDoc.quantity =
            Number(split.inventoryDoc.quantity || 0) - split.quantity;

          await split.inventoryDoc.save({ session });

          await InventoryLog.create(
            [
              {
                inventoryItem: split.inventoryDoc._id,
                itemName: split.inventoryDoc.name,
                itemType: split.inventoryDoc.type,
                action: "release",
                quantity: split.quantity,
                amount: undefined,
                performedBy: username,
                remarks: `Released appliance support for relief request ${reliefRequest.requestNo}`,
              },
            ],
            { session }
          );
        }

        preparedItems.push({
          inventoryItemId:
            item.inventoryItemId || allocation.primaryInventoryDoc._id,
          itemType: "appliance",
          itemName: normalizeString(
            item.itemName || allocation.primaryInventoryDoc.name
          ),
          category: normalizeLower(
            item.category || allocation.primaryInventoryDoc.category
          ),
          quantityReleased: allocation.requestedQty,
          unit: normalizeString(item.unit || allocation.primaryInventoryDoc.unit),
          remarks: item.remarks,
        });
      }
    }

    if (isReleasingMonetary) {
      const monetaryAllocation = await allocateMonetaryInventory(
        releasedMonetaryAmount,
        session
      );

      if (!monetaryAllocation.primaryInventoryDoc) {
        await session.abortTransaction();
        return res.status(404).json({
          message: "No monetary inventory is available for release.",
        });
      }

      if (monetaryAllocation.totalAvailable < monetaryAllocation.requestedAmount) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Insufficient monetary inventory. Available: PHP ${formatMonetaryAmount(
            monetaryAllocation.totalAvailable
          )}, requested release: PHP ${formatMonetaryAmount(
            monetaryAllocation.requestedAmount
          )}.`,
        });
      }

      for (const split of monetaryAllocation.allocations) {
        split.inventoryDoc.amount =
          toNumber(split.inventoryDoc.amount) - split.amount;

        await split.inventoryDoc.save({ session });

        await InventoryLog.create(
          [
            {
              inventoryItem: split.inventoryDoc._id,
              itemName: split.inventoryDoc.name,
              itemType: split.inventoryDoc.type,
              action: "release",
              quantity: undefined,
              amount: split.amount,
              performedBy: username,
              remarks: `Released monetary support for relief request ${reliefRequest.requestNo}`,
            },
          ],
          { session }
        );
      }
    }

    const releaseNo = await generateReleaseNo(session);
    const releaseIsFinal = Boolean(isFinalRelease);
    const proofPaths = uploadedProofFiles.map((file) =>
      buildStoredProofPath(file.filename)
    );

    const [reliefRelease] = await ReliefRelease.create(
      [
        {
          reliefRequestId: reliefRequest._id,
          barangayId: reliefRequest.barangayId,
          barangayName: reliefRequest.barangayName,
          releaseNo,
          requestType,
          releaseMode: finalReleaseMode,
          foodPackTemplateId: isTemplateMode ? foodPackTemplate._id : null,
          foodPackTemplateName: isTemplateMode ? foodPackTemplate.name : "",
          foodPacksReleased: releasedFoodPackCount,
          releasedMonetaryAmount,
          receivedMonetaryAmount: 0,
          items: preparedItems.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            itemType: item.itemType || "goods",
            itemName: item.itemName,
            category: item.category,
            quantityReleased: item.quantityReleased,
            unit: item.unit,
            remarks: item.remarks,
          })),
          totalItemsReleased: preparedItems.reduce(
            (sum, item) => sum + Number(item.quantityReleased || 0),
            0
          ),
          releaseStatus: "released",
          releasedBy: username,
          releasedAt: new Date(),
          receivedAt: null,
          receivedBy: "",
          remarks: normalizeString(remarks),
          proofFiles: proofPaths,
          isFinalRelease: releaseIsFinal,
          releaseSummary: {
            totalLineItems: preparedItems.length,
            totalQuantityReleased: preparedItems.reduce(
              (sum, item) => sum + Number(item.quantityReleased || 0),
              0
            ),
            totalMonetaryReleased: releasedMonetaryAmount,
          },
        },
      ],
      { session }
    );

    reliefRequest.releasedBy = username;
    reliefRequest.releasedAt = new Date();
    reliefRequest.releaseNotes = normalizeString(remarks);

    await reliefRequest.save({ session });

    const refreshedRequest = await refreshRequestProgress(reliefRequest._id, session);

    await createAuditEvent(
      {
        module: "relief",
        type: "relief_goods_released",
        priority: "high",
        title: "Relief release prepared",
        message: `${username} released support for request ${reliefRequest.requestNo}.`,
        actorId: req.session?.userId || null,
        actorName: username,
        actorRole: sessionRole || "drrmo",
        barangayId: reliefRequest.barangayId,
        barangayName: reliefRequest.barangayName,
        requestNo: reliefRequest.requestNo,
        releaseNo,
        disaster: reliefRequest.disaster,
        status: refreshedRequest?.status || "partially_released",
        referenceId: reliefRelease._id,
        referenceModel: "ReliefRelease",
        targetLabel: releaseNo,
        metadata: {
          requestType,
          releaseMode: finalReleaseMode,
          foodPacksReleased: releasedFoodPackCount,
          releasedMonetaryAmount,
          releasedApplianceQuantity,
          totalItemsReleased: preparedItems.reduce(
            (sum, item) => sum + Number(item.quantityReleased || 0),
            0
          ),
          isFinalRelease: releaseIsFinal,
          proofCount: proofPaths.length,
        },
      },
      { session }
    );

    await session.commitTransaction();
    transactionStarted = false;
    shouldCleanupUploadedProofFiles = false;

const updatedRequest = await ReliefRequest.findById(reliefRequest._id);
const updatedRelease = await ReliefRelease.findById(reliefRelease._id);

await createNotification({
  recipientRole: "barangay",
  recipientUser: reliefRequest.barangayId,
  recipientUserModel: "Barangay",
  recipientBarangay: reliefRequest.barangayId,
  recipientBarangayName: reliefRequest.barangayName,

  senderUser: req.session?.userId || null,
  senderRole: sessionRole || "drrmo",
  senderName: username,

  module: "relief",
  type: "relief_goods_released",
  priority: "high",

  title: "Relief release prepared",
  message: `${getRequestOwnerLabel(reliefRequest)} released support for your request ${
    reliefRequest.requestNo
  }. ${[
    demand.requiresFoodPacks
      ? `${releasedFoodPackCount} food pack(s) released`
      : null,
    demand.requiresMonetary
      ? `PHP ${formatMonetaryAmount(releasedMonetaryAmount)} released`
      : null,
    isReleasingAppliances
      ? `${releasedApplianceQuantity} appliance unit(s) released`
      : null,
  ]
    .filter(Boolean)
    .join(" and ")}.`,
  link: "/barangay/relief-request",

  referenceId: reliefRelease._id,
  referenceModel: "ReliefRelease",
  audit: false,
  metadata: {
    releaseNo,
    requestNo: reliefRequest.requestNo,
    barangayName: reliefRequest.barangayName,
    disaster: reliefRequest.disaster,
    requestType,
    releaseMode: finalReleaseMode,
    foodPacksReleased: releasedFoodPackCount,
    releasedMonetaryAmount,
    releasedApplianceQuantity,
    totalItemsReleased: preparedItems.reduce(
      (sum, item) => sum + Number(item.quantityReleased || 0),
      0
    ),
    isFinalRelease: releaseIsFinal,
  },
});

    res.status(201).json({
      message: "Relief release created successfully.",
      release: updatedRelease,
      request: updatedRequest,
    });
  } catch (err) {
    if (transactionStarted) {
      await session.abortTransaction();
    }
    console.error("Create Relief Release Error:", err);
    const isPayloadParseError =
      err instanceof SyntaxError && typeof req.body?.payload === "string";

    res
      .status(isPayloadParseError ? 400 : 500)
      .json({ message: isPayloadParseError ? "Invalid release payload." : err.message });
  } finally {
    if (shouldCleanupUploadedProofFiles) {
      await removeUploadedProofFiles(uploadedProofFiles);
    }
    session.endSession();
  }
};

/* EXPORT SINGLE RELEASE RECEIPT PDF */
const exportReliefReleasePdf = async (req, res) => {
  try {
    const role = String(req.session?.role || "").toLowerCase();
    const userId = String(req.session?.userId || "");

    const reliefRelease = await ReliefRelease.findOne({
      _id: req.params.id,
      isArchived: false,
    }).lean();

    if (!reliefRelease) {
      return res.status(404).json({ message: "Relief release not found." });
    }

    if (role === "barangay" && String(reliefRelease.barangayId) !== userId) {
      return res.status(403).json({
        message: "You can only export releases assigned to your barangay.",
      });
    }

  const relatedRequest = await ReliefRequest.findById(
    reliefRelease.reliefRequestId
  ).lean();
  const relatedDemand = getRequestDemandProfile(relatedRequest || {});
  const releasedApplianceQuantity = Array.isArray(reliefRelease.items)
    ? reliefRelease.items
        .filter((item) => normalizeLower(item.itemType) === "appliance")
        .reduce((sum, item) => sum + toNumber(item.quantityReleased), 0)
    : 0;

    const safeReleaseNo = normalizeString(reliefRelease.releaseNo || "relief-release")
      .replace(/[^\w\-]+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeReleaseNo}.pdf"`
    );

    const doc = createPdfDocument({
      size: "A4",
      layout: "portrait",
      margin: 40,
    });

    doc.pipe(res);

    drawPdfHeader(doc, {
      title: "Relief Release Receipt",
      subtitle: reliefRelease.releaseNo || normalizeString(reliefRelease._id),
      generatedAt: new Date(),
    });

    drawPdfSectionTitle(doc, "Release Information");
    drawPdfLabelValue(doc, "Release No", reliefRelease.releaseNo || "-");
    drawPdfLabelValue(doc, "Request No", relatedRequest?.requestNo || "-");
    drawPdfLabelValue(doc, "Barangay", reliefRelease.barangayName || "-");
    drawPdfLabelValue(doc, "Request Type", formatStatusLabel(reliefRelease.requestType));
    drawPdfLabelValue(doc, "Release Status", formatStatusLabel(reliefRelease.releaseStatus));
    drawPdfLabelValue(doc, "Release Mode", formatStatusLabel(reliefRelease.releaseMode));
    drawPdfLabelValue(
      doc,
      "Template Name",
      normalizeString(reliefRelease.foodPackTemplateName) || "None"
    );
    drawPdfLabelValue(
      doc,
      "Food Packs Released",
      String(toNumber(reliefRelease.foodPacksReleased))
    );
    drawPdfLabelValue(
      doc,
      "Monetary Released",
      `PHP ${formatMonetaryAmount(reliefRelease.releasedMonetaryAmount)}`
    );
    drawPdfLabelValue(
      doc,
      "Appliance Units Released",
      String(releasedApplianceQuantity)
    );
    drawPdfLabelValue(
      doc,
      "Total Line Items",
      String(toNumber(reliefRelease.releaseSummary?.totalLineItems))
    );
    drawPdfLabelValue(
      doc,
      "Total Quantity Released",
      String(
        toNumber(
          reliefRelease.releaseSummary?.totalQuantityReleased ||
            reliefRelease.totalItemsReleased
        )
      )
    );
    drawPdfLabelValue(
      doc,
      "Is Final Release",
      reliefRelease.isFinalRelease ? "Yes" : "No"
    );

    drawPdfSectionTitle(doc, "Personnel and Dates");
    drawPdfLabelValue(doc, "Released By", reliefRelease.releasedBy || "-");
    drawPdfLabelValue(doc, "Released At", formatDateValue(reliefRelease.releasedAt));
    drawPdfLabelValue(
      doc,
      "Received By",
      normalizeString(reliefRelease.receivedBy) || "Not yet received"
    );
    drawPdfLabelValue(doc, "Received At", formatDateValue(reliefRelease.receivedAt));

    drawPdfSectionTitle(doc, "Remarks");
    drawPdfParagraphBlock(doc, "", normalizeString(reliefRelease.remarks) || "None");

    drawPdfSectionTitle(doc, "Release Proof");
    const releaseProof = collectProofImagesForPdf(reliefRelease.proofFiles, {
      maxImages: 3,
      labelPrefix: "Release Proof",
    });
    drawPdfImageGrid(doc, releaseProof.images, {
      columns: 2,
      imageHeight: 130,
      emptyMessage: "No release proof images attached.",
    });
    if (releaseProof.remainingCount > 0) {
      drawPdfParagraphBlock(
        doc,
        "",
        `+${releaseProof.remainingCount} more proof image(s) not shown in this export.`,
        { bodyFontSize: 9, spacingAfter: 0.35 }
      );
    }

    drawPdfSectionTitle(doc, "Released Item Breakdown");

    const columns = [
      { label: "Item", key: "itemName", width: 140 },
      { label: "Category", key: "category", width: 90 },
      { label: "Qty", key: "quantityReleased", width: 45, align: "right" },
      { label: "Unit", key: "unit", width: 45 },
      { label: "Remarks", key: "remarks", width: 170 },
    ];

    const items = Array.isArray(reliefRelease.items) ? reliefRelease.items : [];

    if (!items.length) {
      drawPdfEmptyState(doc, "No released items available.");
    } else {
      drawPdfTable(
        doc,
        columns,
        items.map((item) => ({
          itemName: normalizeString(item.itemName) || "-",
          category: normalizeString(item.category) || "-",
          quantityReleased: toNumber(item.quantityReleased),
          unit: normalizeString(item.unit) || "-",
          remarks: normalizeString(item.remarks) || "-",
        })),
        {
          rowHeight: 28,
          emptyMessage: "No released items available.",
        }
      );
    }

    if (relatedRequest) {
      drawPdfSectionTitle(doc, "Related Request Snapshot");
      drawPdfLabelValue(doc, "Disaster", relatedRequest.disaster || "-");
      drawPdfLabelValue(
        doc,
        "Request Type",
        formatStatusLabel(relatedRequest.requestType)
      );
      drawPdfLabelValue(doc, "Request Date", formatDateValue(relatedRequest.requestDate));
      drawPdfLabelValue(doc, "Request Status", formatStatusLabel(relatedRequest.status));
      drawPdfLabelValue(
        doc,
        "Requested Food Packs",
        String(toNumber(relatedRequest?.totals?.requestedFoodPacks))
      );
      drawPdfLabelValue(
        doc,
        "Requested Monetary Amount",
        `PHP ${formatMonetaryAmount(
          relatedRequest?.totals?.requestedMonetaryAmount
        )}`
      );
      drawPdfLabelValue(
        doc,
        "Requested Appliance Units",
        String(toNumber(relatedDemand.requestedApplianceQuantity))
      );

      if (relatedDemand.requestedAppliances.length) {
        drawPdfSectionTitle(doc, "Requested Appliance Details");
        drawPdfTable(
          doc,
          [
            { label: "Item", key: "itemName", width: 150 },
            { label: "Category", key: "category", width: 110 },
            { label: "Qty", key: "quantityRequested", width: 45, align: "right" },
            { label: "Remarks", key: "remarks", width: 180 },
          ],
          relatedDemand.requestedAppliances.map((item) => ({
            itemName: normalizeString(item.itemName) || "-",
            category: normalizeString(item.category) || "-",
            quantityRequested: toNumber(item.quantityRequested),
            remarks: normalizeString(item.remarks) || "-",
          })),
          {
            rowHeight: 24,
            emptyMessage: "No requested appliance items available.",
          }
        );
      }
    }

    drawPdfFooter(doc, { generatedAt: new Date() });

    doc.end();
  } catch (err) {
    console.error("Export Relief Release PDF Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

/* BARANGAY CONFIRMS RECEIPT OF A RELEASE */
const receiveReliefRelease = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const username = String(req.session?.username || req.session?.userId || "");
    const role = String(req.session?.role || "");
    const releaseId = req.params.id;

    if (!releaseId) {
      return res.status(400).json({ message: "Release ID is required." });
    }

    session.startTransaction();

    const reliefRelease = await ReliefRelease.findById(releaseId).session(session);

    if (!reliefRelease || reliefRelease.isArchived) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Relief release not found." });
    }

    if (reliefRelease.releaseStatus === "received") {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "This release has already been received." });
    }

    if (reliefRelease.releaseStatus !== "released") {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Only released items can be marked as received.",
      });
    }

    if (role === "barangay") {
      if (String(reliefRelease.barangayId) !== String(req.session.userId)) {
        await session.abortTransaction();
        return res.status(403).json({
          message: "You can only receive releases assigned to your barangay.",
        });
      }
    }

    reliefRelease.releaseStatus = "received";
    reliefRelease.receivedAt = new Date();
    reliefRelease.receivedBy = username;
    reliefRelease.receivedMonetaryAmount = toNumber(
      reliefRelease.releasedMonetaryAmount
    );

    await reliefRelease.save({ session });

    const relatedRequest = await ReliefRequest.findById(
      reliefRelease.reliefRequestId
    ).session(session);

    let refreshedRequest = null;

    if (relatedRequest && !relatedRequest.isArchived) {
      refreshedRequest = await refreshRequestProgress(relatedRequest._id, session);

      await createAuditEvent(
        {
          module: "relief",
          type: "relief_goods_received",
          priority: "normal",
          title: "Relief goods received",
          message: `${relatedRequest.barangayName} confirmed receipt of release ${reliefRelease.releaseNo} for request ${relatedRequest.requestNo}.`,
          actorId: req.session?.userId || null,
          actorName: relatedRequest.barangayName || username,
          actorRole: role || "barangay",
          barangayId: relatedRequest.barangayId,
          barangayName: relatedRequest.barangayName,
          requestNo: relatedRequest.requestNo,
          releaseNo: reliefRelease.releaseNo,
          disaster: relatedRequest.disaster,
          status: refreshedRequest?.status || "partially_released",
          referenceId: reliefRelease._id,
          referenceModel: "ReliefRelease",
          targetLabel: reliefRelease.releaseNo,
          metadata: {
            foodPacksReleased: reliefRelease.foodPacksReleased || 0,
            releasedMonetaryAmount: reliefRelease.releasedMonetaryAmount || 0,
            receivedBy: username,
          },
        },
        { session }
      );
    }

    await session.commitTransaction();

const updatedRelease = await ReliefRelease.findById(reliefRelease._id);
const updatedRequest = await ReliefRequest.findById(
  reliefRelease.reliefRequestId
);

await createNotification({
  recipientRole: getRequestOwnerRole(updatedRequest || {}),

  senderUser: req.session?.userId || null,
  senderRole: role || "barangay",
  senderName: updatedRelease?.barangayName || username,

  module: "relief",
  type: "relief_goods_received",
  priority: "normal",

  title: "Relief goods received",
  message: `${updatedRelease?.barangayName || "Barangay"} confirmed receipt of release ${
    updatedRelease?.releaseNo || ""
  } for request ${updatedRequest?.requestNo || ""}.`,
  link:
    getRequestOwnerRole(updatedRequest || {}) === "admin"
      ? "/admin/relief-lists"
      : "/drrmo/relief-lists",

  referenceId: updatedRelease?._id || reliefRelease._id,
  referenceModel: "ReliefRelease",
  audit: false,
  metadata: {
    releaseNo: updatedRelease?.releaseNo || reliefRelease.releaseNo,
    requestNo: updatedRequest?.requestNo || "",
    barangayName: updatedRelease?.barangayName || "",
    foodPacksReleased: updatedRelease?.foodPacksReleased || 0,
    releasedMonetaryAmount: updatedRelease?.releasedMonetaryAmount || 0,
    receivedBy: username,
    requestStatus: updatedRequest?.status || "",
  },
});

    res.json({
      message: "Relief release marked as received successfully.",
      release: updatedRelease,
      request: updatedRequest,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("Receive Relief Release Error:", err);
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

/* GET RELEASES FOR A REQUEST */
const getReleasesByRequest = async (req, res) => {
  try {
    const releases = await ReliefRelease.find({
      reliefRequestId: req.params.reliefRequestId,
      isArchived: false,
    }).sort({ createdAt: -1 });

    res.json(releases);
  } catch (err) {
    console.error("Get Releases By Request Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* GET ALL RELEASES */
const getAllReliefReleases = async (req, res) => {
  try {
    const releases = await ReliefRelease.find({
      isArchived: false,
    }).sort({ createdAt: -1 });

    res.json(releases);
  } catch (err) {
    console.error("Get All Relief Releases Error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getApprovedRequestsForRelease,
  createReliefRelease,
  exportReliefReleasePdf,
  receiveReliefRelease,
  getReleasesByRequest,
  getAllReliefReleases,
  refreshRequestProgress,
};
