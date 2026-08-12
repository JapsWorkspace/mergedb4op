const normalizeValue = (value) => String(value || "").trim().toLowerCase();

export const resolveInventoryType = (item = {}) => {
  const explicitType = normalizeValue(item.type);

  if (explicitType === "goods" || explicitType === "monetary" || explicitType === "appliance") {
    return explicitType;
  }

  if (
    item.amount !== undefined &&
    item.amount !== null &&
    item.amount !== "" &&
    !Number.isNaN(Number(item.amount))
  ) {
    return "monetary";
  }

  if (normalizeValue(item.referenceNumber)) {
    return "monetary";
  }

  if (normalizeValue(item.condition) || normalizeValue(item.usageDuration)) {
    return "appliance";
  }

  return "goods";
};
