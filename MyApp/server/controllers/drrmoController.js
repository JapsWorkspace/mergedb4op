const ReliefRequest = require("../models/ReliefRequest");
const ReliefRelease = require("../models/ReliefRelease");
const ReliefDistributionRecord = require("../models/ReliefDistributionRecord");
const FoodPackTemplate = require("../models/FoodPackTemplate");
const InventoryItem = require("../models/InventoryItem");
const createNotification = require("../utils/createNotification");
const createAuditEvent = require("../utils/createAuditEvent");
const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  deriveLegacyRequestType,
  getSupportTypesFromRequest,
  getSupportTypeLabel,
  hasSupportType,
  normalizeSupportTypes,
} = require("../utils/reliefSupportTypes");
const {
  canManageReliefRequest,
  getReviewerLabel,
  normalizeRole,
} = require("../utils/roleAccessUtils");

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const ACTIVE_QUEUE_STATUSES = [
  "pending",
  "approved",
  "partially_released",
  "released",
];

const COMPLETED_QUEUE_STATUSES = ["received", "cancelled"];
const HISTORY_QUEUE_STATUSES = ["rejected", "received", "cancelled"];

const normalizeRequestType = (value, supportTypes = []) =>
  deriveLegacyRequestType(normalizeSupportTypes(supportTypes, value));

const formatMonetaryAmount = (value) =>
  toNumber(value).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const normalizeStatus = (value) => normalizeString(value).toLowerCase();

const normalizeApplianceUnits = (record = {}) => {
  const directUnits = record?.distribution?.applianceUnitsReceived;
  if (directUnits !== undefined && directUnits !== null && directUnits !== "") {
    return toNumber(directUnits);
  }

  if (!Array.isArray(record?.distribution?.applianceItems)) {
    return 0;
  }

  return record.distribution.applianceItems.reduce(
    (sum, item) => sum + toNumber(item?.quantityReceived),
    0
  );
};

const buildFamilyHeadDisplayName = (record = {}) => {
  const surname = normalizeString(record?.headOfFamily?.surname);
  const firstName = normalizeString(record?.headOfFamily?.firstName);
  const middleName = normalizeString(record?.headOfFamily?.middleName);
  const givenNames = [firstName, middleName].filter(Boolean).join(" ");

  if (surname && givenNames) {
    return `${surname}, ${givenNames}`;
  }

  return (
    surname ||
    givenNames ||
    normalizeString(record?.signOff?.familyHeadPrintedName) ||
    "-"
  );
};

const buildDistributionReviewSummary = ({ records = [], supportTypes = [] }) => {
  const normalizedSupportTypes = normalizeSupportTypes(supportTypes);
  const completedRecords = (Array.isArray(records) ? records : []).filter(
    (record) => normalizeStatus(record?.distributionStatus) === "completed"
  );

  return {
    completedCount: completedRecords.length,
    perFamilyRows: completedRecords.map((record) => ({
      recordId: record?._id,
      serialNo: normalizeString(record?.serialNo) || "-",
      familyName: buildFamilyHeadDisplayName(record),
      distributionDate: record?.distributionDate || record?.createdAt || null,
      foodPacksReceived: toNumber(record?.distribution?.foodPacksReceived),
      monetaryAmountReceived: toNumber(record?.distribution?.monetaryAmountReceived),
      applianceUnitsReceived: normalizeApplianceUnits(record),
    })),
    visibility: {
      showsFoodPacks: normalizedSupportTypes.includes(SUPPORT_TYPE_FOODPACKS),
      showsMonetary: normalizedSupportTypes.includes(SUPPORT_TYPE_MONETARY),
      showsAppliances: normalizedSupportTypes.includes(SUPPORT_TYPE_APPLIANCE),
    },
  };
};

const buildDemandSummaryLabel = (request = {}) => {
  const supportTypes = getSupportTypesFromRequest(request);
  const totals = request.totals || {};
  const parts = [];

  if (hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS)) {
    parts.push(`${toNumber(totals.requestedFoodPacks)} food pack(s)`);
  }

  if (hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY)) {
    parts.push(`PHP ${formatMonetaryAmount(totals.requestedMonetaryAmount)}`);
  }

  if (hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)) {
    const requestedApplianceQuantity = Array.isArray(request.requestedAppliances)
      ? request.requestedAppliances.reduce(
          (sum, item) => sum + toNumber(item.quantityRequested),
          0
        )
      : toNumber(request?.totals?.requestedApplianceQuantity);
    parts.push(`${requestedApplianceQuantity} appliance unit(s)`);
  }

  return parts.join(" and ") || "No quantified support";
};

const computePrioritySnapshot = (request) => {
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

  const submittedAt = request?.createdAt ? new Date(request.createdAt) : null;
  const now = new Date();
  const waitingMs = submittedAt ? now.getTime() - submittedAt.getTime() : 0;
  const waitingHours = Math.max(0, Math.floor(waitingMs / (1000 * 60 * 60)));
  const waitingDays = Math.max(0, Math.floor(waitingHours / 24));

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
    waitingHours,
    waitingDays,
    requestedFoodPacks,
  };
};

const deriveStageFromStatus = (status) => {
  if (status === "pending") return "pending_review";
  if (status === "approved") return "approved_waiting_release";
  if (status === "rejected") return "rejected";
  if (status === "partially_released") return "partially_released";
  if (status === "released") return "released_waiting_receipt";
  if (status === "received") return "completed";
  if (status === "cancelled") return "completed";
  return "pending_review";
};

const getPriorityLevel = (prioritySnapshot = {}, totals = {}) => {
  const score = toNumber(prioritySnapshot.priorityScore);
  const vulnerableCount = toNumber(prioritySnapshot.vulnerableCount);
  const requestedFoodPacks = toNumber(
    prioritySnapshot.requestedFoodPacks || totals.requestedFoodPacks
  );
  const totalAffected = toNumber(prioritySnapshot.totalAffected);

  if (
    score >= 220 ||
    vulnerableCount >= 30 ||
    requestedFoodPacks >= 180 ||
    totalAffected >= 220
  ) {
    return "high";
  }

  if (
    score >= 110 ||
    vulnerableCount >= 15 ||
    requestedFoodPacks >= 90 ||
    totalAffected >= 120
  ) {
    return "medium";
  }

  return "normal";
};

const buildPriorityBadges = (request) => {
  const badges = [];
  const totals = request?.totals || {};
  const priority = request?.prioritySnapshot || computePrioritySnapshot(request);

  if (priority.vulnerableCount >= 20) badges.push("High vulnerable population");
  if (toNumber(totals.requestedFoodPacks) >= 100) badges.push("High volume");
  if (priority.totalAffected >= 150) badges.push("Large affected population");
  if (toNumber(priority.waitingDays) >= 2) badges.push("Oldest waiting");

  return badges;
};

const buildOperationalStatusLabel = (request = {}) => {
  const status = normalizeString(request.status).toLowerCase();
  const currentStage = normalizeString(request.currentStage).toLowerCase();

  if (status === "pending" || currentStage === "pending_review") {
    return "Pending Review";
  }

  if (status === "approved" || currentStage === "approved_waiting_release") {
    return "Awaiting Release";
  }

  if (status === "partially_released" || currentStage === "partially_released") {
    return "Partially Released";
  }

  if (
    status === "released" ||
    currentStage === "released_waiting_receipt"
  ) {
    return "Awaiting Receipt";
  }

  if (status === "rejected" || currentStage === "rejected") {
    return "Rejected";
  }

  if (
    status === "received" ||
    status === "cancelled" ||
    currentStage === "accomplished" ||
    currentStage === "completed"
  ) {
    return currentStage === "accomplished" ? "Accomplished" : "Completed";
  }

  return "Pending Review";
};

const enrichRequestForQueue = (request) => {
  const requestObj =
    typeof request?.toObject === "function" ? request.toObject() : request;

  const prioritySnapshot = requestObj.prioritySnapshot?.priorityScore
    ? {
        ...requestObj.prioritySnapshot,
        waitingHours: toNumber(requestObj.prioritySnapshot.waitingHours),
        waitingDays: toNumber(requestObj.prioritySnapshot.waitingDays),
        requestedFoodPacks: toNumber(
          requestObj.prioritySnapshot.requestedFoodPacks ||
            requestObj?.totals?.requestedFoodPacks
        ),
      }
    : computePrioritySnapshot(requestObj);

  const normalizedStage =
    normalizeString(requestObj.currentStage) ||
    deriveStageFromStatus(requestObj.status);

  return {
    ...requestObj,
    supportTypes: getSupportTypesFromRequest(requestObj),
    requestType: normalizeRequestType(
      requestObj.requestType,
      getSupportTypesFromRequest(requestObj)
    ),
    demandSummaryLabel: buildDemandSummaryLabel(requestObj),
    totals: {
      ...(requestObj.totals || {}),
      requestedFoodPacks: toNumber(requestObj?.totals?.requestedFoodPacks),
      requestedMonetaryAmount: toNumber(
        requestObj?.totals?.requestedMonetaryAmount
      ),
      requestedApplianceQuantity:
        Array.isArray(requestObj?.requestedAppliances) &&
        requestObj.requestedAppliances.length > 0
          ? requestObj.requestedAppliances.reduce(
              (sum, item) => sum + toNumber(item.quantityRequested),
              0
            )
          : toNumber(requestObj?.totals?.requestedApplianceQuantity),
    },
    fulfillment: {
      ...(requestObj.fulfillment || {}),
      releasedFoodPacks: toNumber(requestObj?.fulfillment?.releasedFoodPacks),
      releasedMonetaryAmount: toNumber(
        requestObj?.fulfillment?.releasedMonetaryAmount
      ),
      releasedApplianceQuantity: toNumber(
        requestObj?.fulfillment?.releasedApplianceQuantity
      ),
      receivedFoodPacks: toNumber(requestObj?.fulfillment?.receivedFoodPacks),
      receivedMonetaryAmount: toNumber(
        requestObj?.fulfillment?.receivedMonetaryAmount
      ),
      receivedApplianceQuantity: toNumber(
        requestObj?.fulfillment?.receivedApplianceQuantity
      ),
    },
    requestedAppliances: Array.isArray(requestObj?.requestedAppliances)
      ? requestObj.requestedAppliances.map((item) => ({
          itemName: normalizeString(item.itemName),
          category: normalizeString(item.category),
          quantityRequested: toNumber(item.quantityRequested),
          remarks: normalizeString(item.remarks),
        }))
      : [],
    currentStage: normalizedStage,
    prioritySnapshot,
    priorityLevel: getPriorityLevel(prioritySnapshot, requestObj.totals || {}),
    priorityBadges: buildPriorityBadges({
      ...requestObj,
      prioritySnapshot,
    }),
    operationalStatusLabel: buildOperationalStatusLabel({
      ...requestObj,
      currentStage: normalizedStage,
    }),
    submittedAt: requestObj.createdAt || requestObj.requestDate || null,
  };
};

const summarizeInventoryByCategory = async () => {
  const inventoryItems = await InventoryItem.find({
    isArchive: false,
  }).lean();

  const goodsItems = inventoryItems.filter(
    (item) => normalizeString(item.type).toLowerCase() === "goods"
  );
  const applianceItems = inventoryItems.filter(
    (item) => normalizeString(item.type).toLowerCase() === "appliance"
  );
  const monetaryItems = inventoryItems.filter(
    (item) => normalizeString(item.type).toLowerCase() === "monetary"
  );

  const byCategory = {};
  let totalStockUnits = 0;

  for (const item of goodsItems) {
    const category = normalizeString(item.category).toLowerCase() || "uncategorized";
    const quantity = toNumber(item.quantity);

    if (!byCategory[category]) {
      byCategory[category] = 0;
    }

    byCategory[category] += quantity;
    totalStockUnits += quantity;
  }

  return {
    totalGoodsEntries: goodsItems.length,
    totalApplianceEntries: applianceItems.length,
    totalMonetaryEntries: monetaryItems.length,
    totalStockUnits,
    totalApplianceUnits: applianceItems.reduce(
      (sum, item) => sum + toNumber(item.quantity),
      0
    ),
    totalMonetaryAmount: monetaryItems.reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    ),
    categories: byCategory,
  };
};

const summarizeTemplatesForRequest = async (requestedFoodPacks = 0) => {
  const templates = await FoodPackTemplate.find({
    isArchived: false,
    isActive: true,
  }).lean();

  return templates.map((template) => ({
    _id: template._id,
    name: template.name,
    description: template.description || "",
    itemCount: Array.isArray(template.items) ? template.items.length : 0,
    canServeRequestedFoodPacks: requestedFoodPacks > 0,
  }));
};

const sortMappedRequests = (requests, sort) => {
  const safeSort = normalizeString(sort).toLowerCase() || "priority";

  requests.sort((a, b) => {
    if (safeSort === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }

    if (safeSort === "newest") {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }

    if (safeSort === "foodpacks") {
      return (
        toNumber(b.totals?.requestedFoodPacks) -
        toNumber(a.totals?.requestedFoodPacks)
      );
    }

    if (safeSort === "affected") {
      return (
        toNumber(b.prioritySnapshot?.totalAffected) -
        toNumber(a.prioritySnapshot?.totalAffected)
      );
    }

    if (safeSort === "waiting") {
      return (
        toNumber(b.prioritySnapshot?.waitingHours) -
        toNumber(a.prioritySnapshot?.waitingHours)
      );
    }

    return (
      toNumber(b.prioritySnapshot?.priorityScore) -
        toNumber(a.prioritySnapshot?.priorityScore) ||
      new Date(a.createdAt) - new Date(b.createdAt)
    );
  });

  return requests;
};

/* GET PENDING RELIEF REQUESTS */
const getPendingRequests = async (req, res) => {
  try {
    const sessionRole = normalizeRole(req.session?.role);
    const requests = await ReliefRequest.find({
      status: "pending",
      isArchived: false,
    }).sort({ createdAt: -1 });

    const enriched = requests
      .filter((request) => canManageReliefRequest(sessionRole, request))
      .map(enrichRequestForQueue);

    res.json(enriched);
  } catch (err) {
    console.error("Get Pending Requests Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* GET DRRMO QUEUE */
const getRequestQueue = async (req, res) => {
  try {
    const sessionRole = normalizeRole(req.session?.role);
    const statusFilter = normalizeString(req.query.status).toLowerCase();
    const search = normalizeString(req.query.search).toLowerCase();
    const sort = normalizeString(req.query.sort).toLowerCase() || "priority";

    const query = {
      isArchived: false,
    };

    if (!statusFilter || statusFilter === "active") {
      query.status = { $in: ACTIVE_QUEUE_STATUSES };
    } else if (statusFilter === "pending") {
      query.status = "pending";
    } else if (statusFilter === "approved") {
      query.status = "approved";
    } else if (statusFilter === "partially_released") {
      query.status = "partially_released";
    } else if (statusFilter === "released") {
      query.status = "released";
    } else if (statusFilter === "completed") {
      query.status = { $in: COMPLETED_QUEUE_STATUSES };
    } else if (statusFilter === "history") {
      query.status = { $in: HISTORY_QUEUE_STATUSES };
    } else if (statusFilter === "all") {
      // keep all non-archived requests
    } else {
      query.status = { $in: ACTIVE_QUEUE_STATUSES };
    }

    let requests = await ReliefRequest.find(query).sort({ createdAt: -1 });
    requests = requests.filter((request) => canManageReliefRequest(sessionRole, request));

    if (search) {
      requests = requests.filter((request) => {
        const haystack = [
          request.requestNo,
          request.barangayName,
          request.disaster,
          request.status,
          request.currentStage,
        ]
          .map((value) => normalizeString(value).toLowerCase())
          .join(" ");

        return haystack.includes(search);
      });
    }

    const mapped = requests.map(enrichRequestForQueue);
    sortMappedRequests(mapped, sort);

    const summary = {
      totalInView: mapped.length,
      pendingReview: mapped.filter((item) => item.status === "pending").length,
      awaitingRelease: mapped.filter((item) => item.status === "approved").length,
      partiallyReleased: mapped.filter(
        (item) => item.status === "partially_released"
      ).length,
      awaitingReceipt: mapped.filter((item) => item.status === "released").length,
      rejected: mapped.filter((item) => item.status === "rejected").length,
      completed: mapped.filter((item) =>
        ["received", "cancelled"].includes(item.status)
      ).length,
      highPriority: mapped.filter((item) => item.priorityLevel === "high").length,
      mediumPriority: mapped.filter((item) => item.priorityLevel === "medium")
        .length,
      normalPriority: mapped.filter((item) => item.priorityLevel === "normal")
        .length,
    };

    res.json({
      statusScope:
        !statusFilter || statusFilter === "active" ? "active" : statusFilter,
      summary,
      requests: mapped,
    });
  } catch (err) {
    console.error("Get Request Queue Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* GET SINGLE REQUEST REVIEW DETAILS */
const getRequestReviewDetails = async (req, res) => {
  try {
    const sessionRole = normalizeRole(req.session?.role);
    const request = await ReliefRequest.findById(req.params.requestId);

    if (!request || request.isArchived) {
      return res.status(404).json({ message: "Relief request not found" });
    }

    if (!canManageReliefRequest(sessionRole, request)) {
      return res.status(403).json({
        message: "You are not allowed to review this request.",
      });
    }

    const releases = await ReliefRelease.find({
      reliefRequestId: request._id,
      isArchived: false,
    }).sort({ createdAt: -1 });
    const distributionRecords = await ReliefDistributionRecord.find({
      reliefRequestId: request._id,
      isArchived: false,
    }).sort({ createdAt: -1 });

    const inventorySummary = await summarizeInventoryByCategory();
    const templates = await summarizeTemplatesForRequest(
      toNumber(request.totals?.requestedFoodPacks)
    );

    const enrichedRequest = enrichRequestForQueue(request);
    const supportTypes = getSupportTypesFromRequest(request);

    res.json({
      request: enrichedRequest,
      releases,
      distributions: {
        records: distributionRecords,
        summary: buildDistributionReviewSummary({
          records: distributionRecords,
          supportTypes,
        }),
        supportTypes,
      },
      inventorySummary,
      templates,
    });
  } catch (err) {
    console.error("Get Request Review Details Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* GET REQUEST FEASIBILITY */
const getRequestFeasibility = async (req, res) => {
  try {
    const sessionRole = normalizeRole(req.session?.role);
    const request = await ReliefRequest.findById(req.params.requestId);

    if (!request || request.isArchived) {
      return res.status(404).json({ message: "Relief request not found" });
    }

    if (!canManageReliefRequest(sessionRole, request)) {
      return res.status(403).json({
        message: "You are not allowed to review this request.",
      });
    }

    const enrichedRequest = enrichRequestForQueue(request);
    const inventorySummary = await summarizeInventoryByCategory();
    const templates = await summarizeTemplatesForRequest(
      toNumber(request.totals?.requestedFoodPacks)
    );

    const lowStockWarnings = Object.entries(inventorySummary.categories || {})
      .filter(([, quantity]) => toNumber(quantity) <= 20)
      .map(([category, quantity]) => ({
        category,
        quantity,
      }));

    res.json({
      requestNo: enrichedRequest.requestNo,
      barangayName: enrichedRequest.barangayName,
      supportTypes: enrichedRequest.supportTypes,
      supportTypeLabel: getSupportTypeLabel(enrichedRequest.supportTypes),
      requestType: enrichedRequest.requestType,
      requestedFoodPacks: toNumber(enrichedRequest.totals?.requestedFoodPacks),
      requestedMonetaryAmount: toNumber(
        enrichedRequest.totals?.requestedMonetaryAmount
      ),
      requestedApplianceQuantity: toNumber(
        enrichedRequest.totals?.requestedApplianceQuantity
      ),
      requestedAppliances: enrichedRequest.requestedAppliances || [],
      totalAffected: toNumber(enrichedRequest.prioritySnapshot?.totalAffected),
      vulnerableCount: toNumber(
        enrichedRequest.prioritySnapshot?.vulnerableCount
      ),
      waitingHours: toNumber(enrichedRequest.prioritySnapshot?.waitingHours),
      priorityLevel: enrichedRequest.priorityLevel,
      submittedAt: enrichedRequest.submittedAt,
      inventorySummary,
      templates,
      lowStockWarnings,
    });
  } catch (err) {
    console.error("Get Request Feasibility Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* APPROVE OR REJECT REQUEST */
const updateReliefStatus = async (req, res) => {
  try {
    const username = req.session?.username || req.session?.userId || "";
    const sessionRole = normalizeRole(req.session?.role);
    const reviewerLabel = getReviewerLabel(sessionRole);
    const action = normalizeString(req.body.action).toLowerCase();
    const remarks = normalizeString(req.body.remarks);

    const request = await ReliefRequest.findById(req.params.requestId);
    if (!request || request.isArchived) {
      return res.status(404).json({ message: "Relief request not found" });
    }

    if (!canManageReliefRequest(sessionRole, request)) {
      return res.status(403).json({
        message: "You are not allowed to update this request.",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Only pending requests can be updated here.",
      });
    }

    if (action === "accept") {
      request.status = "approved";
      request.currentStage = "approved_waiting_release";
      request.approvedBy = String(username);
      request.approvedAt = new Date();
      request.approvalRemarks = remarks;
      request.rejectedBy = "";
      request.rejectedAt = null;
      request.rejectionReason = "";

      if (!request.prioritySnapshot?.priorityScore) {
        request.prioritySnapshot = computePrioritySnapshot(request);
      } else {
        request.prioritySnapshot = {
          ...request.prioritySnapshot.toObject?.(),
          ...computePrioritySnapshot(request),
        };
      }

      await request.save();

      await createAuditEvent({
        module: "relief",
        type: "relief_request_approved",
        priority: "high",
        title: "Relief request approved",
        message: `${username} approved relief request ${request.requestNo} for ${request.barangayName}.`,
        actorId: req.session?.userId || null,
        actorName: username,
        actorRole: sessionRole || "system",
        barangayId: request.barangayId,
        barangayName: request.barangayName,
        requestNo: request.requestNo,
        disaster: request.disaster,
        status: "approved",
        referenceId: request._id,
        referenceModel: "ReliefRequest",
        targetLabel: request.requestNo,
        metadata: {
          requestType: request.requestType,
          requestedFoodPacks: request.totals?.requestedFoodPacks || 0,
          requestedMonetaryAmount: request.totals?.requestedMonetaryAmount || 0,
          approvalRemarks: request.approvalRemarks || "",
        },
      });

      await createNotification({
        recipientRole: "barangay",
        recipientUser: request.barangayId,
        recipientUserModel: "Barangay",
        recipientBarangay: request.barangayId,
        recipientBarangayName: request.barangayName,

        senderUser: req.session?.userId || null,
        senderRole: sessionRole || "system",
        senderName: username,

        module: "relief",
        type: "relief_request_approved",
        priority: "high",

        title: "Relief request approved",
        message: `Your relief request ${request.requestNo} for ${request.disaster} was approved by ${reviewerLabel}.`,
        link: "/barangay/relief-request",

        referenceId: request._id,
        referenceModel: "ReliefRequest",
        audit: false,
        metadata: {
          requestNo: request.requestNo,
          barangayName: request.barangayName,
          disaster: request.disaster,
          requestType: request.requestType,
          requestedFoodPacks: request.totals?.requestedFoodPacks || 0,
          requestedMonetaryAmount:
            request.totals?.requestedMonetaryAmount || 0,
          approvalRemarks: request.approvalRemarks || "",
          approvedBy: username,
          approvedByRole: sessionRole,
        },
      });

      return res.json({
        message: "Relief request approved successfully.",
        request: enrichRequestForQueue(request),
      });
    }

    if (action === "reject" || action === "cancel") {
      if (!remarks) {
        return res.status(400).json({
          message: "Rejection reason is required.",
        });
      }

      request.status = "rejected";
      request.currentStage = "rejected";
      request.rejectedBy = String(username);
      request.rejectedAt = new Date();
      request.rejectionReason = remarks;
      request.approvedBy = "";
      request.approvedAt = null;
      request.approvalRemarks = "";

      if (!request.prioritySnapshot?.priorityScore) {
        request.prioritySnapshot = computePrioritySnapshot(request);
      } else {
        request.prioritySnapshot = {
          ...request.prioritySnapshot.toObject?.(),
          ...computePrioritySnapshot(request),
        };
      }

      await request.save();

      await createAuditEvent({
        module: "relief",
        type: "relief_request_rejected",
        priority: "high",
        title: "Relief request rejected",
        message: `${username} rejected relief request ${request.requestNo} for ${request.barangayName}.`,
        actorId: req.session?.userId || null,
        actorName: username,
        actorRole: sessionRole || "system",
        barangayId: request.barangayId,
        barangayName: request.barangayName,
        requestNo: request.requestNo,
        disaster: request.disaster,
        status: "rejected",
        referenceId: request._id,
        referenceModel: "ReliefRequest",
        targetLabel: request.requestNo,
        metadata: {
          requestType: request.requestType,
          requestedFoodPacks: request.totals?.requestedFoodPacks || 0,
          requestedMonetaryAmount: request.totals?.requestedMonetaryAmount || 0,
          rejectionReason: remarks,
        },
      });

      await createNotification({
        recipientRole: "barangay",
        recipientUser: request.barangayId,
        recipientUserModel: "Barangay",
        recipientBarangay: request.barangayId,
        recipientBarangayName: request.barangayName,

        senderUser: req.session?.userId || null,
        senderRole: sessionRole || "system",
        senderName: username,

        module: "relief",
        type: "relief_request_rejected",
        priority: "high",

        title: "Relief request rejected",
        message: `Your relief request ${request.requestNo} for ${request.disaster} was rejected by ${reviewerLabel}. ${
          remarks ? `Reason: ${remarks}` : "Please review the request details."
        }`,
        link: "/barangay/relief-request",

        referenceId: request._id,
        referenceModel: "ReliefRequest",
        audit: false,
        metadata: {
          requestNo: request.requestNo,
          barangayName: request.barangayName,
          disaster: request.disaster,
          requestType: request.requestType,
          requestedFoodPacks: request.totals?.requestedFoodPacks || 0,
          requestedMonetaryAmount:
            request.totals?.requestedMonetaryAmount || 0,
          rejectionReason: remarks,
          rejectedBy: username,
          rejectedByRole: sessionRole,
        },
      });

      return res.json({
        message: "Relief request rejected successfully.",
        request: enrichRequestForQueue(request),
      });
    }

    return res.status(400).json({
      message: "Invalid action. Use accept or reject.",
    });
  } catch (err) {
    console.error("Update Relief Status Error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPendingRequests,
  getRequestQueue,
  getRequestReviewDetails,
  getRequestFeasibility,
  updateReliefStatus,
};
