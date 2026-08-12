import { parseSafeNumber } from "../shared/spreadsheetImportUtils";

export const INVENTORY_IMPORT_HEADER_ALIASES = {
  itemName: [
    "itemname",
    "item name",
    "name",
    "donorname",
    "donor name",
    "appliancename",
    "appliance name",
  ],
  category: ["category", "itemcategory", "item category", "appliancecategory", "appliance category"],
  customCategory: ["customcategory", "custom category"],
  quantity: ["quantity", "qty", "count", "units"],
  unit: ["unit", "measure", "uom"],
  amount: ["amount", "value", "monetary amount", "donation amount"],
  referenceNumber: ["referencenumber", "reference number", "reference", "ref", "transaction reference"],
  expirationDate: ["expirationdate", "expiration date", "expirydate", "expiry date"],
  condition: ["condition", "item condition", "appliance condition"],
  usageDuration: ["usageduration", "usage duration", "years used", "duration used"],
  description: ["description", "notes", "remarks", "description / notes"],
  sourceType: ["sourcetype", "source type"],
  sourceName: ["sourcename", "source name", "donation source"],
};

export const getInventoryImportModeConfig = (mode = "goods") => {
  const normalizedMode = String(mode || "goods").trim().toLowerCase();

  if (normalizedMode === "monetary") {
    return {
      mode: "monetary",
      requiredFields: ["itemName", "amount", "referenceNumber"],
      match: (row) =>
        Boolean(String(row.itemName || row.donorName || "").trim()) &&
        parseSafeNumber(row.amount) > 0 &&
        Boolean(String(row.referenceNumber || "").trim()),
      mismatchIssue: "This row does not match the active Monetary import format.",
    };
  }

  if (normalizedMode === "appliance") {
    return {
      mode: "appliance",
      requiredFields: ["itemName", "category", "quantity", "condition"],
      match: (row) =>
        Boolean(String(row.itemName || "").trim()) &&
        Boolean(String(row.category || "").trim()) &&
        parseSafeNumber(row.quantity) > 0 &&
        Boolean(String(row.condition || "").trim()),
      mismatchIssue: "This row does not match the active Appliances import format.",
    };
  }

  return {
    mode: "goods",
    requiredFields: ["itemName", "category", "quantity", "unit"],
    match: (row) =>
      Boolean(String(row.itemName || "").trim()) &&
      Boolean(String(row.category || "").trim()) &&
      parseSafeNumber(row.quantity) > 0 &&
      Boolean(String(row.unit || "").trim()),
    mismatchIssue: "This row does not match the active Goods import format.",
  };
};

export const validateInventoryImportRow = (row = {}, config = getInventoryImportModeConfig()) => {
  if (config.match(row)) {
    return { isValid: true, issue: "" };
  }

  return {
    isValid: false,
    issue: config.mismatchIssue,
  };
};
