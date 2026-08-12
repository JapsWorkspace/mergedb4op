const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sanitizeString = (value) => String(value || "").trim();

export const buildReleasePreviewSummary = ({
  needsFood = false,
  needsMonetary = false,
  computedTemplateItems = [],
  foodPacksToRelease = 0,
  releaseMonetaryAmount = 0,
  applianceSelections = [],
} = {}) => {
  const applianceItems = Array.isArray(applianceSelections)
    ? applianceSelections.filter((item) => toNumber(item?.quantityReleased) > 0)
    : [];

  const foodSummary = Array.isArray(computedTemplateItems)
    ? computedTemplateItems.reduce(
        (acc, item) => {
          acc.lineItems += 1;
          acc.totalQuantity += toNumber(item?.quantityReleased);
          return acc;
        },
        { lineItems: 0, totalQuantity: 0 }
      )
    : { lineItems: 0, totalQuantity: 0 };

  const applianceUnits = applianceItems.reduce(
    (sum, item) => sum + toNumber(item?.quantityReleased),
    0
  );

  return {
    lineItems: foodSummary.lineItems + applianceItems.length,
    totalQuantity: foodSummary.totalQuantity + applianceUnits,
    packCount: needsFood ? toNumber(foodPacksToRelease) : 0,
    totalMonetary: needsMonetary ? toNumber(releaseMonetaryAmount) : 0,
    applianceUnits,
  };
};

export const buildReleaseRequestPayload = ({
  reliefRequestId = "",
  remarks = "",
  needsFood = false,
  needsMonetary = false,
  needsAppliance = false,
  selectedTemplateId = "",
  foodPacksToRelease = 0,
  releaseMonetaryAmount = 0,
  applianceSelections = [],
} = {}) => {
  const payload = {
    reliefRequestId,
    remarks: sanitizeString(remarks),
    releaseMode: needsFood ? "template" : "manual",
  };

  if (needsFood) {
    payload.foodPackTemplateId = sanitizeString(selectedTemplateId);
    payload.foodPacksToRelease = toNumber(foodPacksToRelease);
  }

  if (needsMonetary) {
    payload.releasedMonetaryAmount = toNumber(releaseMonetaryAmount);
  }

  if (needsAppliance) {
    payload.items = (Array.isArray(applianceSelections) ? applianceSelections : [])
      .filter((item) => toNumber(item?.quantityReleased) > 0)
      .map((item) => ({
        inventoryItemId: item.inventoryItemId,
        itemType: "appliance",
        itemName: sanitizeString(item.itemName),
        category: sanitizeString(item.category),
        quantityReleased: toNumber(item.quantityReleased),
        unit: sanitizeString(item.unit),
        remarks: sanitizeString(item.remarks),
      }));
  }

  return payload;
};
