import { StyleSheet, Platform, Dimensions } from "react-native";

const FONT = Platform.OS === "ios" ? "System" : "Roboto";
const { height } = Dimensions.get("window");

export default StyleSheet.create({
  /* ===== EXISTING STYLES (kept, slightly tuned) ===== */
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  slide: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 120, // ↓ less vertical bloat
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: FONT,
    textAlign: "center",
  },

  paragraph: {
    fontSize: 13,
    fontFamily: FONT,
    marginBottom: 10,
    color: "#374151",
    lineHeight: 18,
  },

  bullet: {
    fontSize: 13,
    fontFamily: FONT,
    marginBottom: 6,
    color: "#374151",
    lineHeight: 18,
  },

  paginationRowTop: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
  },

  activePill: {
    width: 26,
    height: 6,
    backgroundColor: "#166534",
    borderRadius: 3,
  },

  inactiveDot: {
    width: 6,
    height: 6,
    backgroundColor: "#ccc",
    borderRadius: 3,
    marginHorizontal: 6,
  },

  /* ===== IMAGE ===== */
  image: {
    width: "100%",
    height: 150, // ✅ slightly smaller = more space
    resizeMode: "contain",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 13,
    fontFamily: FONT,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 8,
  },

  /* ===== ✅ MORE COMPACT PANEL ===== */
  panel: {
    maxHeight: height * 0.48, // ✅ smaller than before
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,

    // subtle card shadow
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  sectionHeader: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT,
    marginTop: 10,
    marginBottom: 6,
    color: "#111827",
  },

  /* ===== ACCEPT CHECKBOX ===== */
  acceptRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },

  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: "#166534",
    marginRight: 10,
    borderRadius: 4,
  },

  checkboxChecked: {
    backgroundColor: "#166534",
  },

  acceptText: {
    fontSize: 13,
    fontFamily: FONT,
    flex: 1,
    color: "#111827",
  },

 button: {
  position: "absolute",
  bottom: 64, // ✅ pushed up more from system nav
  left: 28,
  right: 28,
  backgroundColor: "#166534",
  paddingVertical: 16,
  borderRadius: 12,
  alignItems: "center",

  // 🔥 STRONG GLOW EFFECT
  shadowColor: "#166534",
  shadowOpacity: 0.85,      // ✅ MUCH stronger
  shadowRadius: 24,         // ✅ wider glow spread
  shadowOffset: { 
    width: 0, 
    height: 0               // ✅ true glow (not just drop shadow)
  },

  elevation: 18,            // ✅ stronger Android glow
},
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONT,
    letterSpacing: 0.5,
  },
});