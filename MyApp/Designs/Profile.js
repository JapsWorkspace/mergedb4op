// Designs/Profile.js
import { Platform, StyleSheet } from "react-native";

/** Theme aligned to your app (green + yellow accents) */
export const COLORS = {
  bg: "#FFFFFF",
  text: "#0B1220",
  textMuted: "#6B7280",

  green: "#14532D",
  greenBright: "#16A34A",
  yellow: "#FACC15",

  sheetBg: "#FFFFFF",
  border: "#E5E7EB",

  // buttons
  btnBorder: "#14532D",
  btnText: "#14532D",

  // delete
  danger: "#DC2626",
  disabled: "#AAAAAA",

  // shadows
  shadow: "rgba(0,0,0,0.15)",
};

export const METRICS = {
  phoneMaxWidth: 390,
  padH: 20,
  padV: 30,
  cardR: 12,
  rowH: 52,
  icon: 20,
  gap: 12,
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
    paddingHorizontal: METRICS.padH,
    paddingTop: METRICS.padV,
    position: "relative",
  },

  /** Header with back button */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backBtn: {
    width: 38, height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: COLORS.green,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  backGlyph: {
    width: 12, height: 12,
    borderLeftWidth: 3, borderBottomWidth: 3,
    borderColor: COLORS.green,
    transform: [{ rotate: "45deg" }],
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.green,
  },

  subText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },

  /** Card */
  card: {
    width: "100%",
    backgroundColor: COLORS.sheetBg,
    borderRadius: METRICS.cardR,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  /** Row buttons (navigate to sub-screens) */
  row: {
    height: METRICS.rowH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.green,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  rowText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowTag: {
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "ios" ? 4 : 3,
    borderRadius: 6,
    backgroundColor: COLORS.yellow,
    marginRight: 8,
  },
  rowTagText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  chevron: {
    width: 10, height: 10,
    borderRightWidth: 3, borderTopWidth: 3,
    borderColor: COLORS.green,
    transform: [{ rotate: "45deg" }],
  },

  /** Delete area */
  deleteWrapper: {
    position: "absolute",
    left: METRICS.padH,
    right: METRICS.padH,
    bottom: Platform.OS === "ios" ? 90 : 70, // sit above bottom nav
  },
  deleteBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  deleteText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.danger,
    letterSpacing: 0.4,
  },
  disableText: { color: COLORS.disabled },

  confirmBox: { marginTop: 10 },
  confirmText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.green,
    marginBottom: 4,
  },
  confirmSub: { fontSize: 12, color: COLORS.textMuted },

  confirmBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  confirmBtnText: { fontSize: 15, fontWeight: "800", color: COLORS.danger },

  cancelBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.green,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "800", color: COLORS.green },
  
  /** Bottom nav wrapper keeps it visible */
  navWrapper: {
    position: "absolute",
    left: 0, right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
});
export default styles;