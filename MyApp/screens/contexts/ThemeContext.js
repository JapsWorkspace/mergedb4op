import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_MODE_KEY = "appThemeMode";

export const lightTheme = {
  mode: "light",
  background: "#F3F7F1",
  card: "#FEFFFC",
  panel: "#FEFFFC",
  surface: "#FEFFFC",
  surfaceAlt: "#EEF5EC",
  elevated: "#FFFFFF",
  text: "#122218",
  subtext: "#526257",
  mutedText: "#526257",
  muted: "#6B7A70",
  border: "#D3E0D7",
  buttonPrimary: "#1F5F3B",
  primary: "#1F5F3B",
  primarySoft: "#DDEEE3",
  inputBackground: "#FBFDF9",
  input: "#FBFDF9",
  modalBackground: "#FEFFFC",
  buttonText: "#FFFFFF",
  overlay: "rgba(18,34,24,0.42)",
  danger: "#C2413B",
  warning: "#A16207",
};

export const darkTheme = {
  mode: "dark",
  background: "#0B1210",
  card: "#121C18",
  panel: "#121C18",
  surface: "#121C18",
  surfaceAlt: "#18241F",
  elevated: "#17231E",
  text: "#F1F5F2",
  subtext: "#A7B5AD",
  mutedText: "#A7B5AD",
  muted: "#A7B5AD",
  border: "#294038",
  buttonPrimary: "#86EFAC",
  primary: "#86EFAC",
  primarySoft: "#183B2A",
  inputBackground: "#111A16",
  input: "#111A16",
  modalBackground: "#121C18",
  buttonText: "#07120D",
  overlay: "rgba(2,6,5,0.66)",
  danger: "#F87171",
  warning: "#FBBF24",
};

export const ThemeContext = createContext({
  theme: lightTheme,
  mode: "system",
  resolvedMode: "light",
  ready: false,
  setMode: () => {},
  toggleMode: () => {},
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const loadThemeMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (active && ["light", "dark", "system"].includes(savedMode)) {
          setMode(savedMode);
        }
      } catch (err) {
        console.log("[theme] load failed:", err?.message);
      } finally {
        if (active) setReady(true);
      }
    };

    loadThemeMode();

    return () => {
      active = false;
    };
  }, []);

  const resolvedMode = mode === "system" ? systemScheme || "light" : mode;
  const theme = resolvedMode === "dark" ? darkTheme : lightTheme;

  const saveMode = useCallback(async (nextMode) => {
    const safeMode = ["light", "dark", "system"].includes(nextMode)
      ? nextMode
      : "system";

    setMode(safeMode);

    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, safeMode);
    } catch (err) {
      console.log("[theme] save failed:", err?.message);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const active = current === "system" ? systemScheme || "light" : current;
      const nextMode = active === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_MODE_KEY, nextMode).catch((err) =>
        console.log("[theme] save failed:", err?.message)
      );
      return nextMode;
    });
  }, [systemScheme]);

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, ready, setMode: saveMode, toggleMode }),
    [mode, ready, resolvedMode, saveMode, theme, toggleMode]
  );

  useEffect(() => {
    console.log("[theme check]", theme);
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
