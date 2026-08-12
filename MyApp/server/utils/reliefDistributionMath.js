const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  getSupportTypesFromRequest,
  normalizeSupportTypes,
} = require("./reliefSupportTypes");

const normalize = (value) => String(value || "").trim().toLowerCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNonNegativeNumber = (value) => {
  const parsed = toNumber(value);
  return parsed >= 0 ? parsed : 0;
};

const assertNonNegativeFinite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
};

const createValidationError = (message) => Object.assign(new Error(message), { status: 400 });

const looksLikeApplianceItem = (item = {}) => {
  const itemType = normalize(item.itemType);
  const category = normalize(item.category);
  const itemName = normalize(item.itemName || item.name);
  const unit = normalize(item.unit);

  if (itemType === "appliance") {
    return true;
  }

  return (
    category.includes("appliance") ||
    itemName.includes("appliance") ||
    itemName.includes("fan") ||
    itemName.includes("rice cooker") ||
    itemName.includes("blender") ||
    unit === "unit"
  );
};

const sumReleaseApplianceUnits = (release = {}) =>
  Array.isArray(release.items)
    ? release.items
        .filter((item) => looksLikeApplianceItem(item))
        .reduce((itemSum, item) => itemSum + toNonNegativeNumber(item.quantityReleased), 0)
    : 0;

const buildRequestDistributionCaps = ({ supportTypes = [], releases = [], request = null } = {}) => {
  const normalizedSupportTypes = normalizeSupportTypes(supportTypes);
  const allowsFood = normalizedSupportTypes.includes(SUPPORT_TYPE_FOODPACKS);
  const allowsMonetary = normalizedSupportTypes.includes(SUPPORT_TYPE_MONETARY);
  const allowsAppliance = normalizedSupportTypes.includes(SUPPORT_TYPE_APPLIANCE);

  const receivedReleases = releases.filter(
    (release) => normalize(release.releaseStatus) === "received"
  );

  const releaseFoodPacks = receivedReleases.reduce(
    (sum, release) => sum + toNonNegativeNumber(release.foodPacksReleased),
    0
  );
  const releaseMonetaryAmount = receivedReleases.reduce(
    (sum, release) => sum + toNonNegativeNumber(release.releasedMonetaryAmount),
    0
  );
  const releaseApplianceUnits = receivedReleases.reduce(
    (sum, release) => sum + sumReleaseApplianceUnits(release),
    0
  );

  const fulfillment = request?.fulfillment || {};
  const requestFoodPacks = toNonNegativeNumber(
    fulfillment.receivedFoodPacks || fulfillment.releasedFoodPacks
  );
  const requestMonetaryAmount = toNonNegativeNumber(
    fulfillment.receivedMonetaryAmount || fulfillment.releasedMonetaryAmount
  );
  const requestApplianceUnits = toNonNegativeNumber(
    fulfillment.receivedApplianceQuantity || fulfillment.releasedApplianceQuantity
  );

  return {
    foodPacks: Math.max(releaseFoodPacks, requestFoodPacks),
    monetaryAmount: Math.max(releaseMonetaryAmount, requestMonetaryAmount),
    applianceUnits: Math.max(releaseApplianceUnits, requestApplianceUnits),
    allowsFood,
    allowsMonetary,
    allowsAppliance,
  };
};

const summarizeCompletedDistributions = (records = []) => {
  const completed = records.filter(
    (record) => normalize(record.distributionStatus) === "completed"
  );

  return {
    foodPacksDistributed: completed.reduce(
      (sum, record) => sum + toNonNegativeNumber(record.distribution?.foodPacksReceived),
      0
    ),
    monetaryDistributed: completed.reduce(
      (sum, record) => sum + toNonNegativeNumber(record.distribution?.monetaryAmountReceived),
      0
    ),
    applianceUnitsDistributed: completed.reduce(
      (sum, record) =>
        sum +
        toNonNegativeNumber(
          record.distribution?.applianceUnitsReceived ??
            (Array.isArray(record.distribution?.applianceItems)
              ? record.distribution.applianceItems.reduce(
                  (itemSum, item) => itemSum + toNonNegativeNumber(item.quantityReceived),
                  0
                )
              : 0)
        ),
      0
    ),
  };
};

const resolveSupportTypes = ({ caps, supportTypes, request } = {}) => {
  if (Array.isArray(supportTypes) && supportTypes.length > 0) {
    return normalizeSupportTypes(supportTypes);
  }

  if (request && typeof request === "object") {
    return getSupportTypesFromRequest(request);
  }

  const inferred = [];
  if (caps?.allowsFood) inferred.push(SUPPORT_TYPE_FOODPACKS);
  if (caps?.allowsMonetary) inferred.push(SUPPORT_TYPE_MONETARY);
  if (caps?.allowsAppliance) inferred.push(SUPPORT_TYPE_APPLIANCE);
  return inferred.length > 0 ? normalizeSupportTypes(inferred) : [];
};

const validateDistributionAgainstCaps = ({
  caps,
  existingSummary,
  incomingRecord,
  supportTypes,
  request,
  checkTotals = true,
}) => {
  const incomingFood = incomingRecord?.distribution?.foodPacksReceived;
  const incomingMoney = incomingRecord?.distribution?.monetaryAmountReceived;
  const incomingApplianceUnits =
    incomingRecord?.distribution?.applianceUnitsReceived ??
    (Array.isArray(incomingRecord?.distribution?.applianceItems)
      ? incomingRecord.distribution.applianceItems.reduce(
          (sum, item) => sum + toNumber(item?.quantityReceived),
          0
        )
      : 0);
  const resolvedSupportTypes = resolveSupportTypes({ caps, supportTypes, request });
  const allowsFood = resolvedSupportTypes.length
    ? resolvedSupportTypes.includes(SUPPORT_TYPE_FOODPACKS)
    : Boolean(caps?.allowsFood);
  const allowsMonetary = resolvedSupportTypes.length
    ? resolvedSupportTypes.includes(SUPPORT_TYPE_MONETARY)
    : Boolean(caps?.allowsMonetary);
  const allowsAppliance = resolvedSupportTypes.length
    ? resolvedSupportTypes.includes(SUPPORT_TYPE_APPLIANCE)
    : Boolean(caps?.allowsAppliance);

  if (
    !assertNonNegativeFinite(caps?.foodPacks) ||
    !assertNonNegativeFinite(caps?.monetaryAmount) ||
    !assertNonNegativeFinite(caps?.applianceUnits) ||
    !assertNonNegativeFinite(existingSummary?.foodPacksDistributed) ||
    !assertNonNegativeFinite(existingSummary?.monetaryDistributed) ||
    !assertNonNegativeFinite(existingSummary?.applianceUnitsDistributed) ||
    !assertNonNegativeFinite(incomingFood) ||
    !assertNonNegativeFinite(incomingMoney) ||
    !assertNonNegativeFinite(incomingApplianceUnits)
  ) {
    throw createValidationError("Invalid distribution values.");
  }

  if (!allowsFood && toNumber(incomingFood) > 0) {
    throw createValidationError("Food packs are not supported for this request.");
  }

  if (!allowsMonetary && toNumber(incomingMoney) > 0) {
    throw createValidationError("Monetary aid is not supported for this request.");
  }

  if (!allowsAppliance && toNumber(incomingApplianceUnits) > 0) {
    throw createValidationError("Appliance aid is not supported for this request.");
  }

  if (!checkTotals) {
    return;
  }

  const nextFood = toNumber(existingSummary.foodPacksDistributed) + toNumber(incomingFood);
  const nextMoney = toNumber(existingSummary.monetaryDistributed) + toNumber(incomingMoney);
  const nextApplianceUnits =
    toNumber(existingSummary.applianceUnitsDistributed) + toNumber(incomingApplianceUnits);

  if (
    nextFood > toNumber(caps.foodPacks) ||
    nextMoney > toNumber(caps.monetaryAmount) ||
    nextApplianceUnits > toNumber(caps.applianceUnits)
  ) {
    throw createValidationError("Distribution exceeds the received relief totals.");
  }
};

module.exports = {
  buildRequestDistributionCaps,
  summarizeCompletedDistributions,
  validateDistributionAgainstCaps,
};
