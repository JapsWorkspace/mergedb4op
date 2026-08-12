export function getTodayInputDate(baseDate = new Date()) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toStartOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getInventoryExpiryStatus(expirationDate, baseDate = new Date()) {
  if (!expirationDate) return "none";

  const today = toStartOfDay(baseDate);
  const expiry = toStartOfDay(expirationDate);
  if (!today || !expiry) return "none";

  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

export function validateFutureOrTodayInventoryDate(value, baseDate = new Date()) {
  if (!value) return "";

  const parsed = toStartOfDay(value);
  if (!parsed) {
    return "Expiration date is invalid.";
  }

  const today = toStartOfDay(baseDate);
  if (!today) {
    return "Expiration date is invalid.";
  }

  if (parsed < today) {
    return "Expiration date cannot be in the past.";
  }

  return "";
}
