import { getInventoryExpiryStatus } from "./inventoryExpiryUtils";

const LOW_STOCK_THRESHOLD = 20;

const normalizeId = (value) => String(value || "").trim();
const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeQuantity = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric) || numeric < 0) return 0;
  return numeric;
};

const buildTemplateSignature = (item = {}) =>
  [
    normalizeText(item?.itemName || item?.name),
    normalizeText(item?.category),
    normalizeText(item?.unit),
  ].join("||");

const sortTemplateInventoryItems = (items = []) =>
  items.slice().sort((left, right) => {
    const leftExpiry = left?.expirationDate
      ? new Date(left.expirationDate).getTime()
      : Number.POSITIVE_INFINITY;
    const rightExpiry = right?.expirationDate
      ? new Date(right.expirationDate).getTime()
      : Number.POSITIVE_INFINITY;

    if (leftExpiry !== rightExpiry) {
      return leftExpiry - rightExpiry;
    }

    const leftCreated = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreated = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftCreated - rightCreated;
  });

export const getTemplateExpiryStatus = getInventoryExpiryStatus;

export function isLowStockQuantity(quantity) {
  return normalizeQuantity(quantity) < LOW_STOCK_THRESHOLD;
}

export function buildInventoryItemLookup(items = []) {
  return items.reduce(
    (lookup, item) => {
      const normalizedItem = item || {};
      const key = normalizeId(item?._id);
      if (key) {
        lookup.byId[key] = normalizedItem;
      }

      const signature = buildTemplateSignature(normalizedItem);
      if (signature) {
        if (!lookup.bySignature[signature]) {
          lookup.bySignature[signature] = [];
        }
        lookup.bySignature[signature].push(normalizedItem);
      }

      return lookup;
    },
    { byId: {}, bySignature: {} }
  );
}

export function getTemplateItemHealth(templateItem, inventoryLookup = {}) {
  const itemsById = inventoryLookup?.byId || {};
  const itemsBySignature = inventoryLookup?.bySignature || {};
  const signature = buildTemplateSignature(templateItem);
  const matchingInventoryItems = sortTemplateInventoryItems(
    itemsBySignature[signature] || []
  );
  const inventoryItemById = itemsById[normalizeId(templateItem?.inventoryItemId)] || null;
  const inventoryItem =
    matchingInventoryItems.find((item) => normalizeQuantity(item?.quantity) > 0) ||
    inventoryItemById ||
    matchingInventoryItems[0] ||
    null;
  const availableQuantity = normalizeQuantity(inventoryItem?.quantity);
  const expiryStatus = inventoryItem
    ? getTemplateExpiryStatus(inventoryItem?.expirationDate)
    : "no_expiry";
  const isUnavailable = !inventoryItem || availableQuantity <= 0;
  const isLow = !isUnavailable && isLowStockQuantity(availableQuantity);

  return {
    inventoryItem,
    matchingInventoryItems,
    availableQuantity,
    expiryStatus,
    isUnavailable,
    isLow,
    isExpiring: expiryStatus === "soon",
    isExpired: expiryStatus === "expired",
  };
}

export function summarizeTemplateHealth(template, inventoryLookup = {}) {
  const items = Array.isArray(template?.items) ? template.items : [];

  const itemHealth = items.map((item) => ({
    item,
    ...getTemplateItemHealth(item, inventoryLookup),
  }));

  return {
    itemHealth,
    unavailableCount: itemHealth.filter((entry) => entry.isUnavailable).length,
    lowCount: itemHealth.filter((entry) => entry.isLow).length,
    expiringCount: itemHealth.filter((entry) => entry.isExpiring).length,
    expiredCount: itemHealth.filter((entry) => entry.isExpired).length,
    hasBlockedItems: itemHealth.some((entry) => entry.isUnavailable || entry.isExpired),
  };
}

