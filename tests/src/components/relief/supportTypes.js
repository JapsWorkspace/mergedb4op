export const SUPPORT_TYPE_FOODPACKS = 'foodpacks';
export const SUPPORT_TYPE_MONETARY = 'monetary';
export const SUPPORT_TYPE_APPLIANCE = 'appliance';

export const SUPPORT_TYPES = [
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  SUPPORT_TYPE_APPLIANCE,
];

const LEGACY_TO_SUPPORT_TYPES = {
  foodpacks: [SUPPORT_TYPE_FOODPACKS],
  monetary: [SUPPORT_TYPE_MONETARY],
  both: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_MONETARY],
  appliance: [SUPPORT_TYPE_APPLIANCE],
  foodpacks_appliance: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_APPLIANCE],
  monetary_appliance: [SUPPORT_TYPE_MONETARY, SUPPORT_TYPE_APPLIANCE],
  all: SUPPORT_TYPES,
};

export const SUPPORT_TYPE_LABELS = {
  [SUPPORT_TYPE_FOODPACKS]: 'Food Packs',
  [SUPPORT_TYPE_MONETARY]: 'Monetary',
  [SUPPORT_TYPE_APPLIANCE]: 'Appliance',
};

export const SUPPORT_TYPE_OPTIONS = SUPPORT_TYPES.map((type) => ({
  value: type,
  label: SUPPORT_TYPE_LABELS[type] || 'Support',
}));

export const isStandaloneMonetarySupport = (supportTypes = []) => {
  const normalized = normalizeSupportTypes(supportTypes);
  return (
    normalized.includes(SUPPORT_TYPE_MONETARY) &&
    !normalized.includes(SUPPORT_TYPE_FOODPACKS) &&
    !normalized.includes(SUPPORT_TYPE_APPLIANCE)
  );
};

export const isMonetaryMixedWithOtherSupport = (supportTypes = []) => {
  const normalized = normalizeSupportTypes(supportTypes);
  return (
    normalized.includes(SUPPORT_TYPE_MONETARY) &&
    (normalized.includes(SUPPORT_TYPE_FOODPACKS) ||
      normalized.includes(SUPPORT_TYPE_APPLIANCE))
  );
};

export const normalizeSupportTypes = (value, legacyRequestType = '') => {
  const raw = Array.isArray(value) && value.length > 0
    ? value
    : LEGACY_TO_SUPPORT_TYPES[String(legacyRequestType || '').trim().toLowerCase()] || [];

  const seen = new Set();
  const normalized = [];

  raw.forEach((entry) => {
    const candidate = String(entry || '').trim().toLowerCase();
    if (SUPPORT_TYPES.includes(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      normalized.push(candidate);
    }
  });

  return normalized.length > 0 ? normalized : [SUPPORT_TYPE_FOODPACKS];
};

export const deriveLegacyRequestType = (supportTypes = []) => {
  const normalized = normalizeSupportTypes(supportTypes);
  const signature = SUPPORT_TYPES.filter((type) => normalized.includes(type)).join('|');

  switch (signature) {
    case SUPPORT_TYPE_FOODPACKS:
      return SUPPORT_TYPE_FOODPACKS;
    case SUPPORT_TYPE_MONETARY:
      return SUPPORT_TYPE_MONETARY;
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_MONETARY}`:
      return 'both';
    case SUPPORT_TYPE_APPLIANCE:
      return SUPPORT_TYPE_APPLIANCE;
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_APPLIANCE}`:
      return 'foodpacks_appliance';
    case `${SUPPORT_TYPE_MONETARY}|${SUPPORT_TYPE_APPLIANCE}`:
      return 'monetary_appliance';
    case `${SUPPORT_TYPE_FOODPACKS}|${SUPPORT_TYPE_MONETARY}|${SUPPORT_TYPE_APPLIANCE}`:
      return 'all';
    default:
      return SUPPORT_TYPE_FOODPACKS;
  }
};

export const hasSupportType = (supportTypes = [], type) =>
  normalizeSupportTypes(supportTypes).includes(type);

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const getRequestedMonetaryAmountFromRequest = (request = {}) => {
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

export const getSupportTypesFromRequest = (request = {}) => {
  const normalized = normalizeSupportTypes(request?.supportTypes, request?.requestType);
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

export const getSupportTypeLabel = (supportTypes = []) =>
  normalizeSupportTypes(supportTypes)
    .map((type) => SUPPORT_TYPE_LABELS[type] || 'Support')
    .join(' + ');
