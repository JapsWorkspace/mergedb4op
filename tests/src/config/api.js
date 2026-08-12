export const PRODUCTION_API_BASE_URL = "https://gaganadapat.onrender.com";

export function normalizeApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export const API_BASE_URL =
  normalizeApiBaseUrl(process.env.REACT_APP_API_URL) || PRODUCTION_API_BASE_URL;

export function buildApiUrl(path = "") {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return cleanPath ? `${API_BASE_URL}/${cleanPath}` : API_BASE_URL;
}
