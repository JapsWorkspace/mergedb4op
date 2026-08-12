// Designs/SafetyMark.js
import { Platform, StyleSheet } from "react-native";

export const COLORS = {
  sheetBg: "#FFFFFF",
  title: "#0B1220",
  muted: "#6B7280",
  border: "#E5E7EB",
  shadow: "rgba(0,0,0,0.15)",

  // Tile
  tileBg: "#11642E",
  tileBgAlt: "#0F5A29",
  tileText: "#E9FCEB",
  statusBg: "#0A4A22",
  statusText: "#D9FFE1",

  // Status dot
  dotSafe: "#22C55E",
  dotNotSafe: "#EF4444",
  dotUnknown: "#A3A3A3",

  // Buttons
  btnSafeBg: "#16A34A",
  btnSafeText: "#FFFFFF",
  btnUnsafeBg: "#B91C1C",
  btnUnsafeText: "#FFFFFF",

  // Avatars
  avatarRing: "#D1FAE5",

  // Find People block
  findTitle: "#14532D",
  findBorder: "#14532D",
  findEnterBg: "#14532D",
  findEnterText: "#FACC15",
  findCodeBg: "#07250E",
  findCodeText: "#FFFFFF",

  // Primary action (Family connections button)
  primaryBg: "#0D3B1E",
  primaryText: "#FFFFFF",
  primaryDisabledBg: "#D1D5DB",
  primaryDisabledText: "#6B7280",

  // Search results
  resultName: "#0B1220",
  resultMeta: "#6B7280",
  resultBtnBg: "#0F172A",
  resultBtnText: "#FFFFFF",
};

export const METRICS = {
  sheetRadius: 18,
  tileRadius: 10,
  tileGap: 10,
  avatar: 38,
  statusPillH: 24,
  safeUnsafeBtnH: 40,
};

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    backgroundColor: COLORS.sheetBg,
    borderTopLeftRadius: METRICS.sheetRadius,
    borderTopRightRadius: METRICS.sheetRadius,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  dragHandle: {
    width: 52,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 10,
  },

  title: {
    color: COLORS.title,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },

  // Find People
  findBlock: { marginTop: 4, marginBottom: 12 },
  findTitle: {
    textAlign: "center",
    color: COLORS.findTitle,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  findSearch: {
    height: 40,
    borderWidth: 2,
    borderColor: COLORS.findBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: "#0B1220",
    backgroundColor: "#FFFFFF",
  },
  findResultBox: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  resultInfo: { flex: 1 },
  resultName: { color: COLORS.resultName, fontWeight: "800", fontSize: 14 },
  resultMeta: { color: COLORS.resultMeta, fontSize: 12, marginTop: 2 },
  resultBtn: {
    backgroundColor: COLORS.resultBtnBg,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 10,
  },
  resultBtnText: { color: COLORS.resultBtnText, fontWeight: "700" },

  findRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  findEnterBtn: {
    height: 38,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.findEnterBg,
    borderRadius: 6,
  },
  findEnterText: { color: COLORS.findEnterText, fontWeight: "800", fontSize: 14 },
  findCodeInput: {
    flex: 1,
    height: 38,
    borderWidth: 2,
    borderColor: COLORS.findBorder,
    borderRadius: 8,
    marginLeft: 12,
    paddingHorizontal: 10,
    color: "#0B1220",
    backgroundColor: "#FFFFFF",
  },

  // Your code
  yourCodeLabel: { marginTop: 12, color: COLORS.title, fontSize: 12 },
  yourCodeBox: {
    marginTop: 6,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.findCodeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  yourCodeText: {
    color: COLORS.findCodeText,
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: 1.2,
  },

  // Primary CTA buttons
  primaryBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryBg,
  },
  primaryBtnDisabled: { backgroundColor: COLORS.primaryDisabledBg },
  primaryBtnText: {
    color: COLORS.primaryText,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  primaryBtnTextDisabled: { color: COLORS.primaryDisabledText },

  // Connections list
  list: { width: "100%", marginTop: 2 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.tileBg,
    borderRadius: METRICS.tileRadius,
    padding: 10,
  },
  tileSpacing: { marginTop: METRICS.tileGap },

  avatarWrap: {
    width: METRICS.avatar,
    height: METRICS.avatar,
    borderRadius: METRICS.avatar / 2,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 2,
    borderColor: COLORS.avatarRing,
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },

  infoCol: { flex: 1 },
  name: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, marginBottom: 2 },
  location: { color: COLORS.tileText, fontSize: 12 },

  statusPill: {
    height: METRICS.statusPillH,
    borderRadius: METRICS.statusPillH / 2,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.statusBg,
    marginLeft: 10,
  },
  statusText: { color: COLORS.statusText, fontWeight: "700", fontSize: 11 },

  // SAFE / UNSAFE row
  actionRow: { flexDirection: "row", marginTop: 12 },
  btn: {
    flex: 1,
    height: METRICS.safeUnsafeBtnH,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSafe: { backgroundColor: COLORS.btnSafeBg },
  btnUnsafe: { backgroundColor: COLORS.btnUnsafeBg },
  btnText: { fontWeight: "800", letterSpacing: 0.6, color: "#FFFFFF" },

  // Status dot on avatar
  dotWrap: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.sheetBg,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

export default styles;

// Designs/SafetyMark.js
import { Platform, StyleSheet } from "react-native";

export const COLORS = {
  sheetBg: "#FFFFFF",
  title: "#0B1220",
  muted: "#6B7280",
  border: "#E5E7EB",
  shadow: "rgba(0,0,0,0.15)",

  // Tile
  tileBg: "#11642E",
  tileBgAlt: "#0F5A29",
  tileText: "#E9FCEB",
  statusBg: "#0A4A22",
  statusText: "#D9FFE1",

  // Status dot
  dotSafe: "#22C55E",
  dotNotSafe: "#EF4444",
  dotUnknown: "#A3A3A3",

  // Buttons
  btnSafeBg: "#16A34A",
  btnSafeText: "#FFFFFF",
  btnUnsafeBg: "#B91C1C",
  btnUnsafeText: "#FFFFFF",

  // Avatars
  avatarRing: "#D1FAE5",

  // Find People block
  findTitle: "#14532D",
  findBorder: "#14532D",
  findEnterBg: "#14532D",
  findEnterText: "#FACC15",
  findCodeBg: "#07250E",
  findCodeText: "#FFFFFF",

  // Primary action (Family connections button)
  primaryBg: "#0D3B1E",
  primaryText: "#FFFFFF",
  primaryDisabledBg: "#D1D5DB",
  primaryDisabledText: "#6B7280",

  // Search results
  resultName: "#0B1220",
  resultMeta: "#6B7280",
  resultBtnBg: "#0F172A",
  resultBtnText: "#FFFFFF",
};

export const METRICS = {
  sheetRadius: 18,
  tileRadius: 10,
  tileGap: 10,
  avatar: 38,
  statusPillH: 24,
  safeUnsafeBtnH: 40,
};

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    backgroundColor: COLORS.sheetBg,
    borderTopLeftRadius: METRICS.sheetRadius,
    borderTopRightRadius: METRICS.sheetRadius,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  dragHandle: {
    width: 52,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 10,
  },

  title: {
    color: COLORS.title,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },

  // Find People
  findBlock: { marginTop: 4, marginBottom: 12 },
  findTitle: {
    textAlign: "center",
    color: COLORS.findTitle,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  findSearch: {
    height: 40,
    borderWidth: 2,
    borderColor: COLORS.findBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: "#0B1220",
    backgroundColor: "#FFFFFF",
  },
  findResultBox: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  resultInfo: { flex: 1 },
  resultName: { color: COLORS.resultName, fontWeight: "800", fontSize: 14 },
  resultMeta: { color: COLORS.resultMeta, fontSize: 12, marginTop: 2 },
  resultBtn: {
    backgroundColor: COLORS.resultBtnBg,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 10,
  },
  resultBtnText: { color: COLORS.resultBtnText, fontWeight: "700" },

  findRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  findEnterBtn: {
    height: 38,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.findEnterBg,
    borderRadius: 6,
  },
  findEnterText: { color: COLORS.findEnterText, fontWeight: "800", fontSize: 14 },
  findCodeInput: {
    flex: 1,
    height: 38,
    borderWidth: 2,
    borderColor: COLORS.findBorder,
    borderRadius: 8,
    marginLeft: 12,
    paddingHorizontal: 10,
    color: "#0B1220",
    backgroundColor: "#FFFFFF",
  },

  // Your code
  yourCodeLabel: { marginTop: 12, color: COLORS.title, fontSize: 12 },
  yourCodeBox: {
    marginTop: 6,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.findCodeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  yourCodeText: {
    color: COLORS.findCodeText,
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: 1.2,
  },

  // Primary CTA buttons
  primaryBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryBg,
  },
  primaryBtnDisabled: { backgroundColor: COLORS.primaryDisabledBg },
  primaryBtnText: {
    color: COLORS.primaryText,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  primaryBtnTextDisabled: { color: COLORS.primaryDisabledText },

  // Connections list
  list: { width: "100%", marginTop: 2 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.tileBg,
    borderRadius: METRICS.tileRadius,
    padding: 10,
  },
  tileSpacing: { marginTop: METRICS.tileGap },

  avatarWrap: {
    width: METRICS.avatar,
    height: METRICS.avatar,
    borderRadius: METRICS.avatar / 2,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 2,
    borderColor: COLORS.avatarRing,
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },

  infoCol: { flex: 1 },
  name: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, marginBottom: 2 },
  location: { color: COLORS.tileText, fontSize: 12 },

  statusPill: {
    height: METRICS.statusPillH,
    borderRadius: METRICS.statusPillH / 2,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.statusBg,
    marginLeft: 10,
  },
  statusText: { color: COLORS.statusText, fontWeight: "700", fontSize: 11 },

  // SAFE / UNSAFE row
  actionRow: { flexDirection: "row", marginTop: 12 },
  btn: {
    flex: 1,
    height: METRICS.safeUnsafeBtnH,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSafe: { backgroundColor: COLORS.btnSafeBg },
  btnUnsafe: { backgroundColor: COLORS.btnUnsafeBg },
  btnText: { fontWeight: "800", letterSpacing: 0.6, color: "#FFFFFF" },

  // Status dot on avatar
  dotWrap: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.sheetBg,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

export default styles;
