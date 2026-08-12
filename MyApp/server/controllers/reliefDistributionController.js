const {
  buildRequestDistributionCaps,
  summarizeCompletedDistributions,
  validateDistributionAgainstCaps,
} = require("../utils/reliefDistributionMath");
const {
  createPdfDocument,
  drawPdfEmptyState,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfLabelValue,
  drawPdfSectionTitle,
  drawPdfTable,
  formatPdfDateValue,
} = require("../utils/pdfTheme");
const {
  parseDistributionWorkbookBuffer,
} = require("../utils/reliefDistributionImport");
const {
  deriveLegacyRequestType,
  getSupportTypeLabel,
  getSupportTypesFromRequest,
} = require("../utils/reliefSupportTypes");
const createNotification = require("../utils/createNotification");
const createAuditEvent = require("../utils/createAuditEvent");

const VALID_DISTRIBUTION_STATUSES = new Set(["draft", "completed"]);
const requestMutationLocks = new Map();

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeStatus = (value) => normalizeString(value).toLowerCase();
const normalizeSerialNo = (value) => normalizeString(value).toUpperCase();
const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(normalizeString(value));
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatMonetaryAmount = (value) =>
  toNumber(value).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatDateValue = formatPdfDateValue;

const formatStatusLabel = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return "-";

  return normalized
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const toPlainObject = (value) =>
  typeof value?.toObject === "function" ? value.toObject() : { ...value };

const createHttpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

const getDefined = (value, fallback) => (value === undefined ? fallback : value);
const withRequestMutationLock = async (requestId, work) => {
  const key = normalizeString(requestId) || "__missing_request__";
  const previous = requestMutationLocks.get(key) || Promise.resolve();
  let releaseLock;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });

  requestMutationLocks.set(key, current);
  await previous;

  try {
    return await work();
  } finally {
    releaseLock();
    if (requestMutationLocks.get(key) === current) {
      requestMutationLocks.delete(key);
    }
  }
};

const parseMaybeJson = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }

  return value;
};

const toObjectInput = (value, fallback = {}) => {
  const parsed = parseMaybeJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
};

const toArrayInput = (value, fallback = []) => {
  const parsed = parseMaybeJson(value);
  return Array.isArray(parsed) ? parsed : fallback;
};

const parseNonNegativeNumber = ({ value, label, fallback = 0 }) => {
  if (value === undefined) {
    return fallback;
  }

  if (value === null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(400, `${label} must be a non-negative number.`);
  }

  return parsed;
};

const parseBooleanInput = ({ value, label, fallback = false }) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (value === null || value === "") {
    return false;
  }

  const normalized = normalizeStatus(value);
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }

  throw createHttpError(400, `${label} must be a boolean value.`);
};

const parseDateInput = ({ value, label, fallback = null }) => {
  if (value === undefined) {
    return fallback;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${label} must be a valid date.`);
  }

  return parsed;
};

const normalizeDistributionStatus = (value, fallback = "draft") => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = normalizeStatus(value);
  if (!VALID_DISTRIBUTION_STATUSES.has(normalized)) {
    throw createHttpError(400, "Distribution status must be either draft or completed.");
  }

  return normalized;
};

const getReceivedReleases = (releases = []) =>
  (Array.isArray(releases) ? releases : []).filter(
    (release) => normalizeStatus(release?.releaseStatus) === "received"
  );

const getReceivedReleaseIds = (releases = []) =>
  getReceivedReleases(releases)
    .map((release) => release?._id)
    .filter(Boolean);

const buildFamilyHeadDisplayName = (record = {}) => {
  const surname = normalizeString(record?.headOfFamily?.surname);
  const firstName = normalizeString(record?.headOfFamily?.firstName);
  const middleName = normalizeString(record?.headOfFamily?.middleName);
  const givenName = [firstName, middleName].filter(Boolean).join(" ");

  if (surname && givenName) {
    return `${surname}, ${givenName}`;
  }

  return surname || givenName || normalizeString(record?.signOff?.familyHeadPrintedName) || "-";
};

const buildDistributionLocationLabel = (record = {}) => {
  const parts = [
    normalizeString(record?.evacuationCenterName),
    normalizeString(record?.siteLabel),
  ].filter(Boolean);

  return parts.join(" / ") || "-";
};

const buildApplianceDistributionText = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) {
    return "-";
  }

  const parts = normalizedItems
    .filter((item) => toNumber(item?.quantityReceived || item?.quantity) > 0)
    .map((item) => {
      const quantity = toNumber(item?.quantityReceived || item?.quantity);
      const itemName = normalizeString(item?.itemName) || "Appliance";
      const unit = normalizeString(item?.unit);
      return `${itemName} (${quantity}${unit ? ` ${unit}` : ""})`;
    });

  return parts.length ? parts.join("; ") : "-";
};

const buildApplianceUsageRows = (caps = {}, completedSummary = {}) => {
  const capItems = Array.isArray(caps?.applianceItems) ? caps.applianceItems : [];
  const usedItems = Array.isArray(completedSummary?.applianceDistributed)
    ? completedSummary.applianceDistributed
    : [];
  const rowMap = new Map();

  capItems.forEach((item) => {
    rowMap.set(item.key || `${normalizeString(item.itemName)}||${normalizeString(item.unit)}`, {
      itemName: normalizeString(item.itemName) || "Appliance",
      unit: normalizeString(item.unit) || "-",
      receivedQuantity: toNumber(item.quantity),
      usedQuantity: 0,
    });
  });

  usedItems.forEach((item) => {
    const key = item.key || `${normalizeString(item.itemName)}||${normalizeString(item.unit)}`;
    const existing = rowMap.get(key) || {
      itemName: normalizeString(item.itemName) || "Appliance",
      unit: normalizeString(item.unit) || "-",
      receivedQuantity: 0,
      usedQuantity: 0,
    };

    existing.usedQuantity = toNumber(item.quantity);
    rowMap.set(key, existing);
  });

  return Array.from(rowMap.values()).map((item) => ({
    ...item,
    remainingQuantity: Math.max(0, toNumber(item.receivedQuantity) - toNumber(item.usedQuantity)),
  }));
};

const sanitizeFamilyMembers = (value, fallback = []) =>
  toArrayInput(getDefined(value, fallback), []).map((member, index) => {
    const source = toObjectInput(member, {});

    return {
      fullName: normalizeString(source.fullName),
      relationshipToHead: normalizeString(source.relationshipToHead),
      age: parseNonNegativeNumber({
        value: source.age,
        label: `Family member ${index + 1} age`,
      }),
      sex: normalizeString(source.sex),
      education: normalizeString(source.education),
      occupationalSkills: normalizeString(source.occupationalSkills),
      remarks: normalizeString(source.remarks),
    };
  });

const sanitizeApplianceItems = (value, fallback = []) =>
  toArrayInput(getDefined(value, fallback), [])
    .map((item, index) => {
      const source = toObjectInput(item, {});
      const normalizedItem = {
        itemName: normalizeString(source.itemName),
        category: normalizeString(source.category),
        quantityReceived: parseNonNegativeNumber({
          value: source.quantityReceived,
          label: `Appliance item ${index + 1} quantity received`,
        }),
        unit: normalizeString(source.unit),
        remarks: normalizeString(source.remarks),
      };

      if (!normalizedItem.itemName && normalizedItem.quantityReceived > 0) {
        throw createHttpError(
          400,
          `Appliance item ${index + 1} name is required when quantity received is greater than zero.`
        );
      }

      return normalizedItem;
    })
    .filter(
      (item) =>
        item.itemName ||
        item.category ||
        item.unit ||
        item.remarks ||
        item.quantityReceived > 0
    );

const buildDistributionRecordPayload = ({
  source = {},
  context,
  existingRecord = null,
  entryMode,
  importBatchId,
  distributionStatus,
  encodedBy,
}) => {
  const baseline = existingRecord ? toPlainObject(existingRecord) : {};
  const payloadSource = toObjectInput(source, {});
  const headOfFamilySource = toObjectInput(
    getDefined(payloadSource.headOfFamily, baseline.headOfFamily),
    {}
  );
  const familyProfileSource = toObjectInput(
    getDefined(payloadSource.familyProfile, baseline.familyProfile),
    {}
  );
  const housingProfileSource = toObjectInput(
    getDefined(payloadSource.housingProfile, baseline.housingProfile),
    {}
  );
  const healthProfileSource = toObjectInput(
    getDefined(payloadSource.healthProfile, baseline.healthProfile),
    {}
  );
  const distributionSource = toObjectInput(
    getDefined(payloadSource.distribution, baseline.distribution),
    {}
  );
  const signOffSource = toObjectInput(getDefined(payloadSource.signOff, baseline.signOff), {});
  const finalStatus =
    distributionStatus ||
    normalizeDistributionStatus(
      getDefined(payloadSource.distributionStatus, baseline.distributionStatus),
      baseline.distributionStatus || "draft"
    );
  const serialNo = normalizeSerialNo(getDefined(payloadSource.serialNo, baseline.serialNo));

  if (!serialNo) {
    throw createHttpError(400, "Serial number is required.");
  }

  return {
    reliefRequestId: context.request._id,
    reliefRequestNo: context.request.requestNo,
    barangayId: context.request.barangayId,
    barangayName: context.request.barangayName,
    releaseIds: getReceivedReleaseIds(context.releases),
    distributionStatus: finalStatus,
    serialNo,
    importBatchId:
      importBatchId !== undefined
        ? normalizeString(importBatchId)
        : normalizeString(baseline.importBatchId),
    entryMode:
      entryMode ||
      (["manual", "excel_import"].includes(normalizeStatus(baseline.entryMode))
        ? normalizeStatus(baseline.entryMode)
        : "manual"),
    evacuationCenterName: normalizeString(
      getDefined(payloadSource.evacuationCenterName, baseline.evacuationCenterName)
    ),
    siteLabel: normalizeString(getDefined(payloadSource.siteLabel, baseline.siteLabel)),
    distributionDate: parseDateInput({
      value: getDefined(payloadSource.distributionDate, baseline.distributionDate),
      label: "Distribution date",
      fallback: baseline.distributionDate || null,
    }),
    headOfFamily: {
      surname: normalizeString(headOfFamilySource.surname),
      firstName: normalizeString(headOfFamilySource.firstName),
      middleName: normalizeString(headOfFamilySource.middleName),
      sex: normalizeString(headOfFamilySource.sex),
      age: parseNonNegativeNumber({
        value: headOfFamilySource.age,
        label: "Head of family age",
      }),
      birthDate: parseDateInput({
        value: headOfFamilySource.birthDate,
        label: "Head of family birth date",
      }),
      occupation: normalizeString(headOfFamilySource.occupation),
      monthlyIncome: parseNonNegativeNumber({
        value: headOfFamilySource.monthlyIncome,
        label: "Monthly income",
      }),
    },
    familyProfile: {
      is4PsBeneficiary: parseBooleanInput({
        value: familyProfileSource.is4PsBeneficiary,
        label: "4Ps beneficiary flag",
      }),
      isIpBeneficiary: parseBooleanInput({
        value: familyProfileSource.isIpBeneficiary,
        label: "IP beneficiary flag",
      }),
      ipEthnicity: normalizeString(familyProfileSource.ipEthnicity),
    },
    housingProfile: {
      tenureStatus: normalizeString(housingProfileSource.tenureStatus),
      housingCondition: normalizeString(housingProfileSource.housingCondition),
    },
    healthProfile: {
      healthCondition: normalizeString(healthProfileSource.healthCondition),
    },
    familyMembers: sanitizeFamilyMembers(payloadSource.familyMembers, baseline.familyMembers),
    distribution: {
      foodPacksReceived: parseNonNegativeNumber({
        value: distributionSource.foodPacksReceived,
        label: "Food packs received",
      }),
      monetaryAmountReceived: parseNonNegativeNumber({
        value: distributionSource.monetaryAmountReceived,
        label: "Monetary amount received",
      }),
      applianceUnitsReceived: parseNonNegativeNumber({
        value:
          distributionSource.applianceUnitsReceived ??
          (Array.isArray(distributionSource.applianceItems)
            ? distributionSource.applianceItems.reduce(
                (sum, item) => sum + parseNonNegativeNumber({
                  value: item?.quantityReceived,
                  label: "Appliance units received",
                }),
                0
              )
            : 0),
        label: "Appliance units received",
      }),
      applianceItems: sanitizeApplianceItems(
        distributionSource.applianceItems,
        baseline?.distribution?.applianceItems
      ),
    },
    signOff: {
      familyHeadPrintedName: normalizeString(signOffSource.familyHeadPrintedName),
      familyHeadSignatureImage: normalizeString(signOffSource.familyHeadSignatureImage),
      barangayOfficerPrintedName: normalizeString(signOffSource.barangayOfficerPrintedName),
      barangayOfficerSignatureImage: normalizeString(signOffSource.barangayOfficerSignatureImage),
      lswdoPrintedName: normalizeString(signOffSource.lswdoPrintedName),
      lswdoSignatureImage: normalizeString(signOffSource.lswdoSignatureImage),
    },
    remarks: normalizeString(getDefined(payloadSource.remarks, baseline.remarks)),
    encodedBy: normalizeString(encodedBy),
    encodedAt: new Date(),
    isArchived: false,
  };
};

const buildSummaryExcludingRecord = (records = [], recordIdToExclude) =>
  summarizeCompletedDistributions(
    (Array.isArray(records) ? records : []).filter(
      (record) => String(record?._id) !== String(recordIdToExclude)
    )
  );

const buildDistributionResponse = (context, extra = {}) => {
  const requestObject = toPlainObject(context.request);

  return {
    ...extra,
    request: {
      ...requestObject,
      requestType: context.requestType,
      supportTypes: context.supportTypes,
    },
    releases: context.releases,
    records: context.records,
    caps: context.caps,
    summary: buildRequestSummary(context),
  };
};

const handleControllerError = (res, label, err) => {
  const status =
    err?.status ||
    (err?.code === 11000 ? 409 : 0) ||
    (err?.name === "ValidationError" ? 400 : 0) ||
    500;

  if (status === 409) {
    return res.status(409).json({
      message: "A distribution record with the same serial number already exists for this request.",
    });
  }

  console.error(`${label}:`, err);
  return res.status(status).json({
    message: err?.message || "An unexpected error occurred.",
    ...(Array.isArray(err?.issues) ? { issues: err.issues } : {}),
  });
};

const ensureRecordIsUnique = async ({ context, recordId, serialNo }) => {
  const { ReliefDistributionRecord } = getModels();
  const existing = await ReliefDistributionRecord.findOne({
    reliefRequestId: context.request._id,
    serialNo: { $regex: `^${escapeRegex(normalizeSerialNo(serialNo))}$`, $options: "i" },
    isArchived: false,
    ...(recordId ? { _id: { $ne: recordId } } : {}),
  }).lean();

  if (existing) {
    throw createHttpError(
      409,
      "A distribution record with the same serial number already exists for this request."
    );
  }
};

const findActiveRecordForRequest = async ({ context, recordId }) => {
  const { ReliefDistributionRecord } = getModels();

  if (!recordId) {
    throw createHttpError(400, "Distribution record ID is required.");
  }

  if (!isValidObjectId(recordId)) {
    throw createHttpError(400, "Invalid distribution record ID.");
  }

  const record = await ReliefDistributionRecord.findOne({
    _id: recordId,
    reliefRequestId: context.request._id,
    isArchived: false,
  });

  if (!record) {
    throw createHttpError(404, "Distribution record not found.");
  }

  return record;
};

const decodeBase64Buffer = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const payload = normalized.includes(",") ? normalized.split(",").pop() : normalized;
  if (!payload) {
    return null;
  }

  return Buffer.from(payload, "base64");
};

const extractWorkbookBuffer = (req) => {
  if (Buffer.isBuffer(req.file?.buffer) && req.file.buffer.length > 0) {
    return req.file.buffer;
  }

  if (Array.isArray(req.files)) {
    const firstFileWithBuffer = req.files.find(
      (file) => Buffer.isBuffer(file?.buffer) && file.buffer.length > 0
    );
    if (firstFileWithBuffer) {
      return firstFileWithBuffer.buffer;
    }
  }

  if (Buffer.isBuffer(req.body?.workbookBuffer) && req.body.workbookBuffer.length > 0) {
    return req.body.workbookBuffer;
  }

  if (Array.isArray(req.body?.workbookBuffer?.data)) {
    return Buffer.from(req.body.workbookBuffer.data);
  }

  const base64Candidates = [
    req.body?.workbookBase64,
    req.body?.fileBase64,
    req.body?.workbook,
    req.body?.file,
  ];

  for (const candidate of base64Candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const buffer = decodeBase64Buffer(candidate);
    if (Buffer.isBuffer(buffer) && buffer.length > 0) {
      return buffer;
    }
  }

  return null;
};

const getModels = () => ({
  ReliefRequest: require("../models/ReliefRequest"),
  ReliefRelease: require("../models/ReliefRelease"),
  ReliefDistributionRecord: require("../models/ReliefDistributionRecord"),
});

const countCompletedRecords = (records = []) =>
  (Array.isArray(records) ? records : []).filter(
    (record) => normalizeStatus(record?.distributionStatus) === "completed"
  ).length;

const isAccomplishedReadyForContext = (context) => {
  const completedCount = countCompletedRecords(context?.records);
  if (completedCount <= 0) {
    return false;
  }

  const caps = context?.caps || {};
  const completedSummary = context?.completedSummary || {};
  const supportTypes = Array.isArray(context?.supportTypes) ? context.supportTypes : [];

  const needsFood = supportTypes.includes("foodpacks");
  const needsMonetary = supportTypes.includes("monetary");
  const needsAppliance = supportTypes.includes("appliance");

  const foodReady =
    !needsFood ||
    Math.max(
      0,
      toNumber(caps?.foodPacks) - toNumber(completedSummary?.foodPacksDistributed)
    ) <= 0;
  const monetaryReady =
    !needsMonetary ||
    Math.max(
      0,
      toNumber(caps?.monetaryAmount) - toNumber(completedSummary?.monetaryDistributed)
    ) <= 0;
  const applianceReady =
    !needsAppliance ||
    Math.max(
      0,
      toNumber(caps?.applianceUnits) - toNumber(completedSummary?.applianceUnitsDistributed)
    ) <= 0;

  return foodReady && monetaryReady && applianceReady;
};

const getRequestOwnerRole = (request = {}) =>
  normalizeStatus(request?.requestType) === "monetary" ? "admin" : "drrmo";

const getRequestQueueLink = (request = {}) =>
  getRequestOwnerRole(request) === "admin"
    ? "/admin/relief-lists"
    : "/drrmo/relief-lists";

const persistRequestStage = async ({ request, currentStage }) => {
  if (!request || !normalizeString(currentStage)) return;
  request.currentStage = currentStage;
  await request.save();
};

const buildRequestSummary = ({ request, releases, records, caps, completedSummary }) => ({
  requestType: deriveLegacyRequestType(getSupportTypesFromRequest(request || {})),
  totalReleases: Array.isArray(releases) ? releases.length : 0,
  receivedReleases: (Array.isArray(releases) ? releases : []).filter(
    (release) => normalizeStatus(release?.releaseStatus) === "received"
  ).length,
  distributionRecords: Array.isArray(records) ? records.length : 0,
  completedDistributionRecords: countCompletedRecords(records),
  foodPacksCap: toNumber(caps?.foodPacks),
  foodPacksDistributed: toNumber(completedSummary?.foodPacksDistributed),
  remainingFoodPacks: Math.max(
    0,
    toNumber(caps?.foodPacks) - toNumber(completedSummary?.foodPacksDistributed)
  ),
  monetaryCap: toNumber(caps?.monetaryAmount),
  monetaryDistributed: toNumber(completedSummary?.monetaryDistributed),
  remainingMonetaryAmount: Math.max(
    0,
    toNumber(caps?.monetaryAmount) - toNumber(completedSummary?.monetaryDistributed)
  ),
  applianceUnitsCap: toNumber(caps?.applianceUnits),
  applianceUnitsDistributed: toNumber(completedSummary?.applianceUnitsDistributed),
  remainingApplianceUnits: Math.max(
    0,
    toNumber(caps?.applianceUnits) - toNumber(completedSummary?.applianceUnitsDistributed)
  ),
});

const loadRequestContextForBarangayUser = async (req) => {
  const { ReliefRequest, ReliefRelease, ReliefDistributionRecord } = getModels();

  if (!req.session?.userId) {
    return {
      error: { status: 401, message: "Not logged in" },
    };
  }

  const role = normalizeStatus(req.session.role);
  if (role !== "barangay") {
    return {
      error: { status: 403, message: "Barangay access required" },
    };
  }

  const reliefRequestId = req.params.reliefRequestId;
  if (!reliefRequestId) {
    return {
      error: { status: 400, message: "Relief request ID is required." },
    };
  }

  if (!isValidObjectId(reliefRequestId)) {
    return {
      error: { status: 400, message: "Invalid relief request ID." },
    };
  }

  const request = await ReliefRequest.findOne({
    _id: reliefRequestId,
    barangayId: req.session.userId,
    isArchived: false,
  });

  if (!request) {
    return {
      error: { status: 404, message: "Relief request not found." },
    };
  }

  const releases = await ReliefRelease.find({
    reliefRequestId: request._id,
    isArchived: false,
  }).sort({ createdAt: -1 });

  const records = await ReliefDistributionRecord.find({
    reliefRequestId: request._id,
    isArchived: false,
  }).sort({ createdAt: -1 });

  const supportTypes = getSupportTypesFromRequest(request);
  const requestType = deriveLegacyRequestType(supportTypes);
  const caps = buildRequestDistributionCaps({
    supportTypes,
    releases,
    request,
  });
  const completedSummary = summarizeCompletedDistributions(records);

  return {
    request,
    requestType,
    supportTypes,
    releases,
    records,
    caps,
    completedSummary,
  };
};

const getRequestDistributions = async (req, res) => {
  try {
    const context = await loadRequestContextForBarangayUser(req);
    if (context.error) {
      return res.status(context.error.status).json({ message: context.error.message });
    }

    const requestObject = toPlainObject(context.request);

    return res.json({
      request: {
        ...requestObject,
        requestType: context.requestType,
        supportTypes: context.supportTypes,
      },
      releases: context.releases,
      records: context.records,
      caps: context.caps,
      summary: buildRequestSummary(context),
    });
  } catch (err) {
    console.error("Get Request Distributions Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const createDistributionRecord = async (req, res) => {
  try {
    return await withRequestMutationLock(req.params.reliefRequestId, async () => {
      const context = await loadRequestContextForBarangayUser(req);
      if (context.error) {
        return res.status(context.error.status).json({ message: context.error.message });
      }

      const payload = buildDistributionRecordPayload({
        source: req.body,
        context,
        entryMode: "manual",
        encodedBy: req.session?.username || req.session?.barangayName || req.session?.userId,
      });

      validateDistributionAgainstCaps({
        caps: context.caps,
        existingSummary: context.completedSummary,
        incomingRecord: payload,
        supportTypes: context.supportTypes,
        checkTotals: payload.distributionStatus === "completed",
      });

      await ensureRecordIsUnique({
        context,
        serialNo: payload.serialNo,
      });

      const { ReliefDistributionRecord } = getModels();
      await ReliefDistributionRecord.create(payload);
      if (normalizeStatus(context.request?.currentStage) === "accomplished") {
        await persistRequestStage({ request: context.request, currentStage: "completed" });
      }

      const refreshedContext = await loadRequestContextForBarangayUser(req);
      return res.status(201).json(
        buildDistributionResponse(refreshedContext, {
          message: "Distribution record created successfully.",
        })
      );
    });
  } catch (err) {
    return handleControllerError(res, "Create Distribution Record Error", err);
  }
};

const updateDistributionRecord = async (req, res) => {
  try {
    return await withRequestMutationLock(req.params.reliefRequestId, async () => {
      const context = await loadRequestContextForBarangayUser(req);
      if (context.error) {
        return res.status(context.error.status).json({ message: context.error.message });
      }

      const existingRecord = await findActiveRecordForRequest({
        context,
        recordId: req.params.recordId,
      });
      const payload = buildDistributionRecordPayload({
        source: req.body,
        context,
        existingRecord,
        encodedBy: req.session?.username || req.session?.barangayName || req.session?.userId,
      });
      const existingSummary = buildSummaryExcludingRecord(context.records, existingRecord._id);

      validateDistributionAgainstCaps({
        caps: context.caps,
        existingSummary,
        incomingRecord: payload,
        supportTypes: context.supportTypes,
        checkTotals: payload.distributionStatus === "completed",
      });

      await ensureRecordIsUnique({
        context,
        recordId: existingRecord._id,
        serialNo: payload.serialNo,
      });

      existingRecord.set(payload);
      await existingRecord.save();
      if (normalizeStatus(context.request?.currentStage) === "accomplished") {
        await persistRequestStage({ request: context.request, currentStage: "completed" });
      }

      const refreshedContext = await loadRequestContextForBarangayUser(req);
      return res.json(
        buildDistributionResponse(refreshedContext, {
          message: "Distribution record updated successfully.",
        })
      );
    });
  } catch (err) {
    return handleControllerError(res, "Update Distribution Record Error", err);
  }
};

const deleteDistributionRecord = async (req, res) => {
  try {
    return await withRequestMutationLock(req.params.reliefRequestId, async () => {
      const context = await loadRequestContextForBarangayUser(req);
      if (context.error) {
        return res.status(context.error.status).json({ message: context.error.message });
      }

      const record = await findActiveRecordForRequest({
        context,
        recordId: req.params.recordId,
      });

      record.isArchived = true;
      await record.save();
      if (normalizeStatus(context.request?.currentStage) === "accomplished") {
        await persistRequestStage({ request: context.request, currentStage: "completed" });
      }

      const refreshedContext = await loadRequestContextForBarangayUser(req);
      return res.json(
        buildDistributionResponse(refreshedContext, {
          message: "Distribution record archived successfully.",
        })
      );
    });
  } catch (err) {
    return handleControllerError(res, "Delete Distribution Record Error", err);
  }
};

const importDistributionWorkbook = async (req, res) => {
  try {
    return await withRequestMutationLock(req.params.reliefRequestId, async () => {
      const context = await loadRequestContextForBarangayUser(req);
      if (context.error) {
        return res.status(context.error.status).json({ message: context.error.message });
      }

      const workbookBuffer = extractWorkbookBuffer(req);
      if (!workbookBuffer) {
        return res.status(400).json({
          message: "A workbook file is required for import.",
        });
      }

      const parsedWorkbook = parseDistributionWorkbookBuffer({ buffer: workbookBuffer });
      if (!parsedWorkbook.records.length) {
        return res.status(400).json({
          message: "The workbook does not contain any distribution rows to import.",
        });
      }

      if (parsedWorkbook.issues.length > 0) {
        return res.status(400).json({
          message: "The workbook contains invalid distribution rows.",
          issues: parsedWorkbook.issues,
        });
      }

      const importBatchId = `dist-import-${Date.now()}`;
      const normalizedRecords = parsedWorkbook.records.map((record) =>
        buildDistributionRecordPayload({
          source: record,
          context,
          entryMode: "excel_import",
          importBatchId,
          distributionStatus: "completed",
          encodedBy: req.session?.username || req.session?.barangayName || req.session?.userId,
        })
      );
      const normalizedSerials = normalizedRecords.map((record) => normalizeSerialNo(record.serialNo));
      const serialKeyCounts = normalizedSerials.reduce((map, serialNo) => {
        const key = normalizeStatus(serialNo);
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map());
      const duplicateSerials = Array.from(serialKeyCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([serialKey]) => serialKey);

      if (duplicateSerials.length > 0) {
        return res.status(400).json({
          message: "The workbook contains duplicate serial numbers.",
          serialNos: duplicateSerials,
        });
      }

      const { ReliefDistributionRecord } = getModels();
      const existingDuplicates = await ReliefDistributionRecord.find({
        reliefRequestId: context.request._id,
        isArchived: false,
        $or: normalizedSerials.map((serialNo) => ({
          serialNo: { $regex: `^${escapeRegex(serialNo)}$`, $options: "i" },
        })),
      })
        .select("serialNo")
        .lean();

      if (existingDuplicates.length > 0) {
        return res.status(409).json({
          message: "Some workbook serial numbers already exist for this relief request.",
          serialNos: existingDuplicates.map((record) => record.serialNo),
        });
      }

      const runningCompletedRecords = (Array.isArray(context.records) ? context.records : [])
        .filter((record) => normalizeStatus(record?.distributionStatus) === "completed")
        .map((record) => toPlainObject(record));

      normalizedRecords.forEach((record) => {
        const runningSummary = summarizeCompletedDistributions(runningCompletedRecords);

        validateDistributionAgainstCaps({
          caps: context.caps,
          existingSummary: runningSummary,
          incomingRecord: record,
          supportTypes: context.supportTypes,
          checkTotals: true,
        });

        runningCompletedRecords.push(record);
      });

      const createdIds = [];

      try {
        for (const record of normalizedRecords) {
          const createdRecord = await ReliefDistributionRecord.create(record);
          createdIds.push(createdRecord._id);
        }
      } catch (err) {
        if (createdIds.length > 0) {
          await ReliefDistributionRecord.deleteMany({
            _id: { $in: createdIds },
          });
        }

        throw err;
      }

      if (normalizeStatus(context.request?.currentStage) === "accomplished") {
        await persistRequestStage({ request: context.request, currentStage: "completed" });
      }

      const refreshedContext = await loadRequestContextForBarangayUser(req);
      return res.status(201).json(
        buildDistributionResponse(refreshedContext, {
          message: "Distribution workbook imported successfully.",
          importedCount: normalizedRecords.length,
          importBatchId,
        })
      );
    });
  } catch (err) {
    return handleControllerError(res, "Import Distribution Workbook Error", err);
  }
};

const confirmAccomplishedDistribution = async (req, res) => {
  try {
    return await withRequestMutationLock(req.params.reliefRequestId, async () => {
      const context = await loadRequestContextForBarangayUser(req);
      if (context.error) {
        return res.status(context.error.status).json({ message: context.error.message });
      }

      if (!isAccomplishedReadyForContext(context)) {
        return res.status(400).json({
          message: "Complete the DAFAC distribution totals first before confirming.",
        });
      }

      await persistRequestStage({ request: context.request, currentStage: "accomplished" });

      await createAuditEvent({
        module: "relief",
        type: "relief_request_accomplished",
        priority: "normal",
        title: "Relief request accomplished",
        message: `${context.request.barangayName} completed the accomplished report for ${context.request.requestNo}.`,
        actorId: context.request.barangayId,
        actorName: context.request.barangayName,
        actorRole: "barangay",
        barangayId: context.request.barangayId,
        barangayName: context.request.barangayName,
        requestNo: context.request.requestNo,
        disaster: context.request.disaster,
        status: context.request.status,
        referenceId: context.request._id,
        referenceModel: "ReliefRequest",
        targetLabel: context.request.requestNo,
        metadata: {
          requestType: context.requestType,
          completedDistributionRecords: countCompletedRecords(context.records),
          foodPacksDistributed: toNumber(context.completedSummary?.foodPacksDistributed),
          monetaryDistributed: toNumber(context.completedSummary?.monetaryDistributed),
          applianceUnitsDistributed: toNumber(
            context.completedSummary?.applianceUnitsDistributed
          ),
          currentStage: "accomplished",
        },
      });

      await createNotification({
        recipientRole: getRequestOwnerRole(context.request),
        senderUser: context.request.barangayId,
        senderRole: "barangay",
        senderName: context.request.barangayName,
        module: "relief",
        type: "relief_request_accomplished",
        priority: "normal",
        title: "Relief request accomplished",
        message: `${context.request.barangayName} completed the accomplished report for ${context.request.requestNo}.`,
        link: getRequestQueueLink(context.request),
        referenceId: context.request._id,
        referenceModel: "ReliefRequest",
        audit: false,
        metadata: {
          requestNo: context.request.requestNo,
          barangayName: context.request.barangayName,
          disaster: context.request.disaster,
          requestType: context.requestType,
          currentStage: "accomplished",
        },
      });

      const refreshedContext = await loadRequestContextForBarangayUser(req);
      return res.json(
        buildDistributionResponse(refreshedContext, {
          message: "DAFAC distribution confirmed. You can now review the accomplished report.",
        })
      );
    });
  } catch (err) {
    return handleControllerError(res, "Confirm Accomplished Distribution Error", err);
  }
};

const exportAccomplishedReportPdf = async (req, res) => {
  try {
    const context = await loadRequestContextForBarangayUser(req);
    if (context.error) {
      return res.status(context.error.status).json({ message: context.error.message });
    }

    const summary = buildRequestSummary(context);
    const completedRecords = (Array.isArray(context.records) ? context.records : [])
      .filter((record) => normalizeStatus(record?.distributionStatus) === "completed")
      .sort((left, right) => {
        const leftTime = new Date(left?.distributionDate || left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.distributionDate || right?.createdAt || 0).getTime();
        return leftTime - rightTime;
      });
    const safeRequestNo = normalizeString(context.request?.requestNo || "distribution-accomplished-report")
      .replace(/[^\w\-]+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeRequestNo}-accomplished-report.pdf"`
    );

    const doc = createPdfDocument({
      size: "A4",
      layout: "portrait",
      margin: 40,
    });

    doc.pipe(res);

    drawPdfHeader(doc, {
      title: "DAFAC Accomplished Report",
      subtitle: context.request?.requestNo || normalizeString(context.request?._id),
      generatedAt: new Date(),
    });

    drawPdfSectionTitle(doc, "Request Summary");
    drawPdfLabelValue(doc, "Request No", context.request?.requestNo || "-");
    drawPdfLabelValue(doc, "Barangay", context.request?.barangayName || "-");
    drawPdfLabelValue(doc, "Disaster", normalizeString(context.request?.disaster) || "-");
    drawPdfLabelValue(doc, "Request Type", getSupportTypeLabel(context.supportTypes));
    drawPdfLabelValue(doc, "Request Status", formatStatusLabel(context.request?.status));
    drawPdfLabelValue(doc, "Request Date", formatDateValue(context.request?.requestDate));
    drawPdfLabelValue(doc, "Received Releases", String(summary.receivedReleases));
    drawPdfLabelValue(doc, "Distribution Records", String(summary.distributionRecords));
    drawPdfLabelValue(
      doc,
      "Completed Records",
      String(summary.completedDistributionRecords)
    );

    drawPdfSectionTitle(doc, "Used vs Remaining Totals");
    drawPdfLabelValue(
      doc,
      "Food Packs",
      `${summary.foodPacksDistributed} used / ${summary.remainingFoodPacks} remaining / ${summary.foodPacksCap} received`
    );
    drawPdfLabelValue(
      doc,
      "Monetary Amount",
      `PHP ${formatMonetaryAmount(summary.monetaryDistributed)} used / PHP ${formatMonetaryAmount(
        summary.remainingMonetaryAmount
      )} remaining / PHP ${formatMonetaryAmount(summary.monetaryCap)} received`
    );
    drawPdfLabelValue(
      doc,
      "Appliance Units",
      `${summary.applianceUnitsDistributed} used / ${summary.remainingApplianceUnits} remaining / ${summary.applianceUnitsCap} received`
    );

    drawPdfSectionTitle(doc, "Completed Family Distribution Table");
    drawPdfTable(
      doc,
      [
        { label: "Serial No", key: "serialNo", width: 55 },
        { label: "Family Head", key: "familyHead", width: 120 },
        { label: "Site", key: "site", width: 90 },
        { label: "Date", key: "distributionDate", width: 72 },
        { label: "Packs", key: "foodPacksReceived", width: 38, align: "right" },
        { label: "Monetary", key: "monetaryAmountReceived", width: 60, align: "right" },
        { label: "Appliances", key: "applianceUnitsReceived", width: 60, align: "right" },
      ],
      completedRecords.map((record) => ({
        serialNo: normalizeString(record?.serialNo) || "-",
        familyHead: buildFamilyHeadDisplayName(record),
        site: buildDistributionLocationLabel(record),
        distributionDate: formatDateValue(record?.distributionDate || record?.createdAt),
        foodPacksReceived: toNumber(record?.distribution?.foodPacksReceived),
        monetaryAmountReceived: formatMonetaryAmount(record?.distribution?.monetaryAmountReceived),
        applianceUnitsReceived: toNumber(
          record?.distribution?.applianceUnitsReceived ??
            (Array.isArray(record?.distribution?.applianceItems)
              ? record.distribution.applianceItems.reduce(
                  (sum, item) => sum + toNumber(item?.quantityReceived),
                  0
                )
              : 0)
        ),
      })),
      {
        rowHeight: 34,
        fontSize: 8,
        emptyMessage: "No completed distribution records available for this request.",
      }
    );

    drawPdfFooter(doc, { generatedAt: new Date() });

    doc.end();
  } catch (err) {
    console.error("Export Accomplished Report PDF Error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message });
    }
  }
};

module.exports = {
  getRequestDistributions,
  createDistributionRecord,
  updateDistributionRecord,
  deleteDistributionRecord,
  importDistributionWorkbook,
  confirmAccomplishedDistribution,
  exportAccomplishedReportPdf,
};
