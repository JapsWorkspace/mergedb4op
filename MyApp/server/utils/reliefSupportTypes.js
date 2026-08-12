const SUPPORT_TYPE_FOODPACKS = "foodpacks";
const SUPPORT_TYPE_MONETARY = "monetary";
const SUPPORT_TYPE_APPLIANCE = "appliance";

const SUPPORT_TYPES = [
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  SUPPORT_TYPE_APPLIANCE,
];

const VALID_REQUEST_TYPES = [
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  "both",
  SUPPORT_TYPE_APPLIANCE,
  "foodpacks_appliance",
  "monetary_appliance",
  "all",
];

const LEGACY_TO_SUPPORT_TYPES = {
  [SUPPORT_TYPE_FOODPACKS]: [SUPPORT_TYPE_FOODPACKS],
  [SUPPORT_TYPE_MONETARY]: [SUPPORT_TYPE_MONETARY],
  both: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_MONETARY],
  [SUPPORT_TYPE_APPLIANCE]: [SUPPORT_TYPE_APPLIANCE],
  foodpacks_appliance: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_APPLIANCE],
  monetary_appliance: [SUPPORT_TYPE_MONETARY, SUPPORT_TYPE_APPLIANCE],
  all: SUPPORT_TYPES,
};

const normalizeLower = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
};

const normalizeSupportTypes = (value, legacyRequestType = "") => {
  const raw = Array.isArray(value) && value.length > 0
    ? value
    : LEGACY_TO_SUPPORT_TYPES[normalizeLower(legacyRequestType)] || [];

  const seen = new Set();
  const normalized = [];

  raw.forEach((entry) => {
    const candidate = normalizeLower(entry);
    if (SUPPORT_TYPES.includes(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      normalized.push(candidate);
    }
  });

  return normalized.length > 0 ? normalized : [SUPPORT_TYPE_FOODPACKS];
};

const deriveLegacyRequestType = (supportTypes = []) => {
  const normalized = normalizeSupportTypes(supportTypes);
  const signature = SUPPORT_TYPES.filter((type) => normalized.includes(type)).join("|");

  switch (signature) {
    case SUPPORT_TYPE_FOODPACKS:
      return SUPPORT_TYPE_FOODPACKS;
    case SUPPORT_TYPE_MONETARY:
      return SUPPORT_TYPE_MONETARY;
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_MONETARY}`:
      return "both";
    case SUPPORT_TYPE_APPLIANCE:
      return SUPPORT_TYPE_APPLIANCE;
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_APPLIANCE}`:
      return "foodpacks_appliance";
    case `${SUPPORT_TYPE_MONETARY}|${SUPPORT_TYPE_APPLIANCE}`:
      return "monetary_appliance";
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_MONETARY}|${SUPPORT_TYPE_APPLIANCE}`:
      return "all";
    default:
      return SUPPORT_TYPE_FOODPACKS;
  }
};

const normalizeRequestType = (value) => {
  const normalized = normalizeLower(value);
  return VALID_REQUEST_TYPES.includes(normalized)
    ? normalized
    : SUPPORT_TYPE_FOODPACKS;
};

const hasSupportType = (supportTypes = [], type) =>
  normalizeSupportTypes(supportTypes).includes(type);

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getRequestedMonetaryAmountFromRequest = (request = {}) => {
  const totals = request?.totals || {};
  const candidates = [
    totals.requestedMonetaryAmount,
    request?.requestedMonetaryAmount,
    request?.monetaryAmount,
    request?.requestedMonetary,
    request?.requestedAmount,
    request?.amountRequested,
    request?.cashAmount,
    request?.financialAmount,
    request?.moneyAmount,
    request?.amount,
  ];

  for (const candidate of candidates) {
    const amount = toNumber(candidate);
    if (amount > 0) return amount;
  }

  return 0;
};

const getSupportTypesFromRequest = (request = {}) => {
  const normalized = normalizeSupportTypes(request.supportTypes, request.requestType);
  const inferred = new Set(normalized);
  const totals = request?.totals || {};
  const rows = Array.isArray(request?.rows) ? request.rows : [];
  const requestedAppliances = Array.isArray(request?.requestedAppliances)
    ? request.requestedAppliances
    : [];

  const requestedFoodPacks =
    toNumber(totals.requestedFoodPacks) ||
    rows.reduce((sum, row) => sum + toNumber(row?.requestedFoodPacks), 0);
  const requestedMonetaryAmount = getRequestedMonetaryAmountFromRequest(request);
  const requestedApplianceQuantity =
    toNumber(totals.requestedApplianceQuantity) ||
    requestedAppliances.reduce(
      (sum, item) => sum + toNumber(item?.quantityRequested),
      0
    );

  if (requestedFoodPacks > 0) {
    inferred.add(SUPPORT_TYPE_FOODPACKS);
  }

  if (requestedMonetaryAmount > 0) {
    inferred.add(SUPPORT_TYPE_MONETARY);
  }

  if (requestedApplianceQuantity > 0) {
    inferred.add(SUPPORT_TYPE_APPLIANCE);
  }

  return normalizeSupportTypes([...inferred]);
};

const getSupportTypeLabel = (supportTypes = []) => {
  const normalized = normalizeSupportTypes(supportTypes);
  const labels = normalized.map((type) => {
    if (type === SUPPORT_TYPE_FOODPACKS) return "Food Packs";
    if (type === SUPPORT_TYPE_MONETARY) return "Monetary";
    if (type === SUPPORT_TYPE_APPLIANCE) return "Appliance";
    return "Support";
  });

  return labels.join(" + ");
};

module.exports = {
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPES,
  VALID_REQUEST_TYPES,
  normalizeSupportTypes,
  deriveLegacyRequestType,
  normalizeRequestType,
  hasSupportType,
  getSupportTypesFromRequest,
  getRequestedMonetaryAmountFromRequest,
  getSupportTypeLabel,
};
