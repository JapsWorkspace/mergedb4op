import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export const LAN_IP = "192.168.1.25";
export const PORT = 8000;
export const NGROK_URL = ""; // Example: "https://xxxx.ngrok.app"
export const HEALTH_PATH = "/health";
export const PROD_BASE = "https://gaganadapat.onrender.com";
const ENV_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "";

/**
 * Leave empty for auto-detect.
 *
 * The mobile app should default to the deployed backend. To force a local
 * backend while developing server code, set EXPO_PUBLIC_API_URL or FORCE_BASE.
 *
 * To force a local backend while developing server code, set:
 * EXPO_PUBLIC_API_URL=http://your-local-ip:8000
 *
 * For physical phone only, you may force:
 * const FORCE_BASE = `http://${LAN_IP}:${PORT}`;
 *
 * For Android emulator only, you may force:
 * const FORCE_BASE = `http://10.0.2.2:${PORT}`;
 */
const FORCE_BASE = "";
const USE_REMOTE_FALLBACK_IN_DEV = false;

const remoteBase = PROD_BASE;
const physicalDeviceBases = [LAN_IP]
  .map((ip) => String(ip || "").trim())
  .filter(Boolean)
  .map((ip) => `http://${ip}:${PORT}`);
const emulatorBase = Platform.OS === "android" ? `http://10.0.2.2:${PORT}` : "";

function uniqueBases(values) {
  return [...new Set(values.filter(Boolean).map((base) => base.replace(/\/+$/, "")))];
}

const candidatesDev = uniqueBases(
  Platform.OS === "android"
    ? [
        FORCE_BASE,
        ENV_BASE,
        NGROK_URL,
        emulatorBase,
        ...physicalDeviceBases,
        remoteBase,
      ]
    : [
        FORCE_BASE,
        ENV_BASE,
        NGROK_URL,
        ...physicalDeviceBases,
        remoteBase,
      ]
);

let resolvedBase = null;

export function resetApiBaseUrl() {
  resolvedBase = null;
}

export async function resolveApiBase() {
  if (!__DEV__) return PROD_BASE;
  if (resolvedBase) return resolvedBase;

  for (const base of candidatesDev) {
    try {
      await axios.get(`${base}${HEALTH_PATH}`, { timeout: 1800 });
      resolvedBase = base;
      console.log("[api] using base:", resolvedBase);
      return resolvedBase;
    } catch (err) {
      console.log("[api] base failed:", base, err?.message);
    }
  }

  resolvedBase = USE_REMOTE_FALLBACK_IN_DEV ? remoteBase : candidatesDev[0];
  console.log("[api] fallback base:", resolvedBase);
  return resolvedBase;
}

export async function getApiBaseUrl() {
  return resolveApiBase();
}

export function updateShareSafetyLocation(userId, shareSafetyLocation) {
  return api.patch(`/user/${userId}/share-safety-location`, {
    shareSafetyLocation,
  });
}

export async function postMultipart(path, formData) {
  const baseURL = await resolveApiBase();
  const token = await AsyncStorage.getItem("token");
  const url = `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const rawText = await response.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      data = rawText;
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        `Upload failed with status ${response.status}.`;
      const error = new Error(message);
      error.response = {
        status: response.status,
        data,
      };
      throw error;
    }

    return {
      data,
      status: response.status,
    };
  } catch (err) {
    console.log("[api] multipart error:", {
      url,
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    throw err;
  }
}

export async function uploadSingleFile(path, fileUri, options = {}) {
  const baseURL = await resolveApiBase();
  const token = await AsyncStorage.getItem("token");
  const url = `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: options.httpMethod || "POST",
    uploadType: FileSystem.FileSystemUploadType?.MULTIPART || 1,
    fieldName: options.fieldName || "file",
    mimeType: options.mimeType || "image/jpeg",
    parameters: options.parameters || {},
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;

  try {
    data = response.body ? JSON.parse(response.body) : null;
  } catch (_) {
    data = response.body;
  }

  if (response.status < 200 || response.status >= 300) {
    const message =
      data?.message ||
      data?.error ||
      `Upload failed with status ${response.status}.`;
    const error = new Error(message);
    error.response = {
      status: response.status,
      data,
    };
    throw error;
  }

  return {
    data,
    status: response.status,
  };
}

const api = axios.create({
  baseURL: __DEV__ ? undefined : PROD_BASE,
  timeout: 30000,
});

function isFormDataPayload(data) {
  return data && typeof data === "object" && typeof data.append === "function";
}

api.interceptors.request.use(
  async (config) => {
    if (__DEV__) {
      config.baseURL = await resolveApiBase();
    }

    const token = await AsyncStorage.getItem("token");
    const isFormData = isFormDataPayload(config.data);

    config.headers = {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
    };

    /**
     * Important:
     * For FormData/image upload, do not force Content-Type.
     * Axios/React Native needs to set multipart boundary automatically.
     */
    if (isFormData) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
      delete config.headers.common;
      delete config.headers.post;
      delete config.headers.put;
      delete config.headers.patch;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = (err?.config?.baseURL || "") + (err?.config?.url || "");
    const status = err?.response?.status;

    console.log("[api] error:", {
      url,
      method: err?.config?.method,
      message: err?.message,
      status,
      data: err?.response?.data,
    });

    return Promise.reject(err);
  }
);

export default api;
