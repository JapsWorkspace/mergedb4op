import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { API_BASE_URL } from "../config/api";

const ThemeContext = createContext();

const BASE_URL = API_BASE_URL;

function normalizeTheme(value) {
  return String(value || "").toLowerCase() === "light" ? "light" : "dark";
}

function buildThemeStorageKey(role, userId) {
  const safeRole = String(role || "").trim().toLowerCase();
  const safeUserId = String(userId || "").trim();

  if (!safeRole || !safeUserId) {
    return "";
  }

  return `theme:${safeRole}:${safeUserId}`;
}

function getFallbackIdentity() {
  if (typeof window === "undefined") {
    return { role: "", userId: "" };
  }

  return {
    role: localStorage.getItem("role") || "",
    userId: localStorage.getItem("userId") || ""
  };
}

function getStoredThemeForIdentity(role, userId) {
  if (typeof window === "undefined") return null;

  const cacheKey = buildThemeStorageKey(role, userId);
  if (cacheKey) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return normalizeTheme(cached);
  }

  const legacy = localStorage.getItem("theme");
  return legacy ? normalizeTheme(legacy) : null;
}

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const { user, setUser } = useAuth();
  const fallbackIdentity = getFallbackIdentity();

  const resolvedRole = String(user?.role || fallbackIdentity.role || "").toLowerCase();
  const resolvedUserId = String(user?.userId || fallbackIdentity.userId || "");
  const accountThemeKey = useMemo(
    () => buildThemeStorageKey(resolvedRole, resolvedUserId),
    [resolvedRole, resolvedUserId]
  );

  const [theme, setTheme] = useState(() =>
    getStoredThemeForIdentity(fallbackIdentity.role, fallbackIdentity.userId) || "dark"
  );

  useEffect(() => {
    const nextTheme = user?.themePreference
      ? normalizeTheme(user.themePreference)
      : getStoredThemeForIdentity(resolvedRole, resolvedUserId) || "dark";

    setTheme((current) => (current === nextTheme ? current : nextTheme));
  }, [resolvedRole, resolvedUserId, user?.themePreference]);

  useEffect(() => {
    const normalizedTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = normalizedTheme;
    localStorage.setItem("theme", normalizedTheme);

    if (accountThemeKey) {
      localStorage.setItem(accountThemeKey, normalizedTheme);
    }
  }, [accountThemeKey, theme]);

  const persistThemePreference = async (nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme);
    setTheme(normalizedTheme);

    if (accountThemeKey) {
      localStorage.setItem(accountThemeKey, normalizedTheme);
    }

    setUser((currentUser) =>
      currentUser ? { ...currentUser, themePreference: normalizedTheme } : currentUser
    );

    try {
      const res = await fetch(`${BASE_URL}/api/auth/theme-preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ themePreference: normalizedTheme })
      });

      if (!res.ok) {
        throw new Error(`Theme save failed with status ${res.status}`);
      }

      const data = await res.json();
      const persistedTheme = normalizeTheme(data?.themePreference || normalizedTheme);

      setTheme(persistedTheme);
      if (accountThemeKey) {
        localStorage.setItem(accountThemeKey, persistedTheme);
      }
      setUser((currentUser) =>
        currentUser ? { ...currentUser, themePreference: persistedTheme } : currentUser
      );
    } catch (error) {
      console.error("Theme preference save error:", error);
    }
  };

  const toggleTheme = () =>
    persistThemePreference(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: persistThemePreference,
        toggleTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
