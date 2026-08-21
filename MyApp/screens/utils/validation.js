const INVISIBLE_WHITESPACE_REGEX = /[\u200B-\u200D\uFEFF]/g;
const MULTI_WHITESPACE_REGEX = /\s+/g;
const SUSPICIOUS_TEXT_REGEX = /[<>{}[\]`$\\]/g;

export const NAME_MAX_LENGTH = 50;
export const USERNAME_MAX_LENGTH = 24;
export const ADDRESS_MAX_LENGTH = 160;
export const SEARCH_MAX_LENGTH = 80;
export const INCIDENT_LOCATION_MAX_LENGTH = 120;
export const INCIDENT_DESCRIPTION_MAX_LENGTH = 500;
export const DONATION_DESCRIPTION_MAX_LENGTH = 300;
export const CONNECTION_CODE_MAX_LENGTH = 12;

function asString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function normalizeWhitespace(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(MULTI_WHITESPACE_REGEX, " ")
    .trim();
}

export function sanitizeTextInput(value, { maxLength, collapse = true } = {}) {
  const base = asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(SUSPICIOUS_TEXT_REGEX, "");
  const normalized = collapse ? base.replace(MULTI_WHITESPACE_REGEX, " ") : base;
  const trimmed = normalized.trim();

  if (typeof maxLength === "number" && maxLength >= 0) {
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

export function sanitizeName(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/[^A-Za-z\s]/g, "")
    .replace(MULTI_WHITESPACE_REGEX, " ")
    .slice(0, NAME_MAX_LENGTH);
}

export function sanitizeUsername(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

export function sanitizeEmailInput(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .trim();
}

export function sanitizePhoneLocal(value) {
  return asString(value).replace(/\D/g, "").slice(0, 10);
}

export function sanitizeAmount(value) {
  const cleaned = asString(value)
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");
  const [whole, cents = ""] = cleaned.split(".");
  return cents ? `${whole.slice(0, 8)}.${cents.slice(0, 2)}` : whole.slice(0, 8);
}

export function sanitizeQuantity(value) {
  return asString(value).replace(/\D/g, "").slice(0, 6);
}

export function sanitizeAlphaNumericText(value, maxLength = ADDRESS_MAX_LENGTH) {
  return sanitizeTextInput(value, { maxLength }).replace(/[^A-Za-z0-9\s-]/g, "");
}

export function sanitizeReferenceText(value, maxLength = 80) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, maxLength);
}

export function sanitizeIncidentText(value, maxLength = INCIDENT_DESCRIPTION_MAX_LENGTH) {
  return sanitizeTextInput(value, { maxLength }).replace(/[^A-Za-z0-9\s,.\-()/#]/g, "");
}

// Notes are sanitized as the user types, so preserve trailing whitespace long
// enough to allow normal multi-word input while removing unsupported symbols.
export function sanitizeIncidentNotesInput(
  value,
  maxLength = INCIDENT_DESCRIPTION_MAX_LENGTH
) {
  const cleaned = asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/[^A-Za-z0-9\s,.\-()/#]/g, "")
    .replace(/\s{3,}/g, "  ");

  return typeof maxLength === "number" && maxLength >= 0
    ? cleaned.slice(0, maxLength)
    : cleaned;
}

export function sanitizeFreeTextInput(
  value,
  maxLength = INCIDENT_DESCRIPTION_MAX_LENGTH
) {
  const cleaned = asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/[<>]/g, "")
    .replace(/\s{3,}/g, "  ");

  return typeof maxLength === "number" && maxLength >= 0
    ? cleaned.slice(0, maxLength)
    : cleaned;
}

export function sanitizeFreeTextOnSubmit(
  value,
  maxLength = INCIDENT_DESCRIPTION_MAX_LENGTH
) {
  const cleaned = asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return typeof maxLength === "number" && maxLength >= 0
    ? cleaned.slice(0, maxLength)
    : cleaned;
}

export function normalizeEmail(value) {
  return sanitizeEmailInput(value).toLowerCase();
}

export function sanitizeSearchText(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(SUSPICIOUS_TEXT_REGEX, "")
    .replace(MULTI_WHITESPACE_REGEX, " ")
    .slice(0, SEARCH_MAX_LENGTH);
}

export function sanitizeConnectionCode(value) {
  return asString(value)
    .replace(INVISIBLE_WHITESPACE_REGEX, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .toUpperCase()
    .slice(0, CONNECTION_CODE_MAX_LENGTH);
}

export function isNonEmptyText(value) {
  return normalizeWhitespace(value).length > 0;
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidGmail(value) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(normalizeEmail(value));
}

export function getUsernameError(value) {
  const username = sanitizeUsername(value);

  if (!username) return "Username is required.";
  if (username.length < 4) {
    return "Username must be at least 4 characters.";
  }
  if (!/^[A-Za-z0-9_]+$/.test(username)) {
    return "Username can only use letters, numbers, and underscores.";
  }

  return "";
}

export function getPhoneError(value) {
  const phone = sanitizePhoneLocal(value);

  if (!phone) return "Mobile number is required.";
  if (!/^9\d{9}$/.test(phone)) {
    return "Enter a valid 10-digit mobile number starting with 9.";
  }

  return "";
}

export function getPasswordError(value, { minLength = 8, maxLength = 64 } = {}) {
  const password = asString(value).replace(INVISIBLE_WHITESPACE_REGEX, "").trim();

  if (!password) return "Password is required.";
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters.`;
  }
  if (password.length > maxLength) {
    return `Password must not exceed ${maxLength} characters.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must include at least one special character.";
  }

  return "";
}

export function sanitizeNumericReference(value, maxLength = 80) {
  return asString(value).replace(/\D/g, "").slice(0, maxLength);
}

export function getForgotPasswordPasswordError(
  value,
  { minLength = 8, maxLength = 64 } = {}
) {
  const password = asString(value).replace(INVISIBLE_WHITESPACE_REGEX, "").trim();

  if (!password) return "Password is required.";
  if (password.length < minLength) {
    return `Password must contain at least ${minLength} characters.`;
  }
  if (password.length > maxLength) {
    return `Password must not exceed ${maxLength} characters.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least 1 uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least 1 lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least 1 number.";
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must contain at least 1 special character.";
  }

  return "";
}

export function getPasswordRequirements(value, { minLength = 8, maxLength = 64 } = {}) {
  const password = asString(value).replace(INVISIBLE_WHITESPACE_REGEX, "").trim();

  return [
    {
      key: "length",
      label: `${minLength}+ characters`,
      met: password.length >= minLength && password.length <= maxLength,
    },
    {
      key: "uppercase",
      label: "Uppercase",
      met: /[A-Z]/.test(password),
    },
    {
      key: "lowercase",
      label: "Lowercase",
      met: /[a-z]/.test(password),
    },
    {
      key: "number",
      label: "Number",
      met: /[0-9]/.test(password),
    },
    {
      key: "special",
      label: "Special character",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
  ];
}

export function getPasswordStrength(value, options = {}) {
  const password = asString(value).replace(INVISIBLE_WHITESPACE_REGEX, "").trim();
  const requirements = getPasswordRequirements(password, options);
  const metCount = requirements.filter((item) => item.met).length;
  const hasTooManyCharacters =
    typeof options.maxLength === "number" && password.length > options.maxLength;

  if (!password) {
    return {
      key: "empty",
      label: "",
      color: "#94A3B8",
      level: 0,
      requirements,
    };
  }

  if (metCount === requirements.length && !hasTooManyCharacters) {
    return {
      key: "strong",
      label: "Strong password",
      color: "#16A34A",
      level: 3,
      requirements,
    };
  }

  if (metCount >= 3) {
    return {
      key: "medium",
      label: "Medium password",
      color: "#D97706",
      level: 2,
      requirements,
    };
  }

  return {
    key: "weak",
    label: "Weak password",
    color: "#DC2626",
    level: 1,
    requirements,
  };
}

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function isValidCoordinate(lat, lng) {
  const parsedLat = toNumber(lat);
  const parsedLng = toNumber(lng);

  return (
    parsedLat !== null &&
    parsedLng !== null &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180 &&
    !(parsedLat === 0 && parsedLng === 0)
  );
}

export function normalizeCoordinate(value) {
  if (!value || typeof value !== "object") return null;

  const latitude = toNumber(
    value.latitude ??
      value.lat ??
      value.location?.latitude ??
      value.location?.lat
  );
  const longitude = toNumber(
    value.longitude ??
      value.lng ??
      value.lon ??
      value.location?.longitude ??
      value.location?.lng ??
      value.location?.lon
  );

  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function sanitizeIncidentLocation(value) {
  return sanitizeIncidentText(value, INCIDENT_LOCATION_MAX_LENGTH);
}

export function sanitizeIncidentDescription(value) {
  return sanitizeIncidentText(value, INCIDENT_DESCRIPTION_MAX_LENGTH);
}

export function safeDisplayText(value, fallback = "Unknown") {
  const text = sanitizeTextInput(value);
  return text || fallback;
}

export function isSafeHttpUrl(value) {
  const url = sanitizeTextInput(value, { maxLength: 2048, collapse: false });
  return /^https?:\/\//i.test(url);
}
