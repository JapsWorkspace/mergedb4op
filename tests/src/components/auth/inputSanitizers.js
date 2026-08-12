const CONTROL_AND_MARKUP = /[<>`]/g;

function removeControlChars(value) {
  return String(value ?? "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
}

export function sanitizeText(value) {
  return removeControlChars(value).replace(CONTROL_AND_MARKUP, "");
}

export function sanitizeUsername(value) {
  return sanitizeText(value).replace(/[^a-zA-Z0-9 _.-]/g, "");
}

export function sanitizeEmail(value) {
  return sanitizeText(value).replace(/\s+/g, "");
}

export function sanitizePhoneNumber(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 11);
}

export function sanitizeHotline(value) {
  return sanitizeText(value).replace(/[^0-9+\-() ]/g, "");
}

export function sanitizeAddress(value) {
  return sanitizeText(value);
}

export function sanitizePassword(value) {
  return removeControlChars(value);
}
