// Designs/MainCenter.js
import { Platform, StyleSheet, Dimensions } from "react-native";

const SCREEN_H = Dimensions.get("window").height;

export const COLORS = {
  bg: "#FFFFFF",
  mapBg: "#DDDDDD",

  green: "#14532D",
  greenLite: "#16A34A",
  text: "#0B1220",
  textMuted: "#6B7280",

  sheetBg: "#FFFFFF",
  handle: "#D1D5DB",

  tileBg: "#E5E7EB",
  inputBorder: "#14532D",
  inputPlaceholder: "#94A3B8",

  alertsBtnBg: "#0B3916",
  alertsBtnText: "#FFFFFF",
};

export const METRICS = {
  phoneMaxWidth: 390,

  // ✅ PANEL STARTS NEAR BOTTOM (HANDLE ONLY)
  panelTop: Math.round(SCREEN_H * 0.88),

  panelRadius: 18,
  pad: 14,
  handleW: 52,
  handleH: 5,
  handleRadius: 3,
  tileH: 112,
  tileR: 12,
  gutter: 12,
};

const styles = StyleSheet.create({
  webFrame: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "#f0f0f0" : COLORS.bg,
  },

  phone: {
    flex: 1,
    width: "100%",
    maxWidth: METRICS.phoneMaxWidth,
    backgroundColor: COLORS.bg,
    position: "relative",
  },

  mapContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: COLORS.mapBg,
  },

  centerWrapper: {
    position: "absolute",
    top: METRICS.panelTop,
    width: "100%",
    alignSelf: "center",
    zIndex: 10,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: COLORS.sheetBg,
    borderTopLeftRadius: METRICS.panelRadius,
    borderTopRightRadius: METRICS.panelRadius,
    padding: METRICS.pad,
    width: "100%",

    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },

  dragHandle: {
    width: METRICS.handleW,
    height: METRICS.handleH,
    borderRadius: METRICS.handleRadius,
    backgroundColor: COLORS.handle,
    alignSelf: "center",
    marginBottom: 10,
    marginTop: 4,
  },
});

export default styles;
