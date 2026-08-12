const normalizeToStartOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const validateInventoryExpirationDate = (value, baseDate = new Date()) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid expiration date.";
  }

  const normalizedExpiry = normalizeToStartOfDay(parsed);
  const normalizedToday = normalizeToStartOfDay(baseDate);

  if (normalizedExpiry < normalizedToday) {
    return "Expiration date cannot be in the past.";
  }

  return "";
};

module.exports = {
  validateInventoryExpirationDate,
};
