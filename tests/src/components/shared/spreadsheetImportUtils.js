export const parseSafeNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
};

export const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");

export const resolveHeaderKey = (rawHeader, aliases = {}) => {
  const normalized = normalizeHeader(rawHeader);
  const entries = Object.entries(aliases);

  for (const [field, fieldAliases] of entries) {
    if (fieldAliases.includes(normalized)) return field;
  }

  return "";
};

export const mapSpreadsheetRow = (rawRow = {}, aliases = {}) => {
  const mapped = {};

  Object.keys(rawRow || {}).forEach((header) => {
    const resolvedKey = resolveHeaderKey(header, aliases);
    if (resolvedKey) {
      mapped[resolvedKey] = rawRow[header];
    }
  });

  return mapped;
};
