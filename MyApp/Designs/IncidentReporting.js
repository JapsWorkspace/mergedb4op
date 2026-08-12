// Designs/IncidentReport.js
import { Platform, StyleSheet } from "react-native";

/** THEME (align to SafetyMark + green bar) */
export const COLORS = {
  bg: "#FFFFFF",
  mapBg: "#DDDDDD",

  // Accent / brand
  green: "#16A34A",
  greenDark: "#0F7A37",
  greenOutline: "#1F7A32",

  text: "#0B1220",
  textMuted: "#6B7280",

  // Panel / card
  panelBg: "#FFFFFF",
  handle: "#D1D5DB",
  border: "#365275",

  // Buttons
  primary: "#0F7A37",
  primaryText: "#ffe345",

  // Shadows
  shadow: "rgba(0,0,0,0.20)",
};

export const METRICS = {
  phoneMaxWidth: 390,      // match your other screens
  panelTop: 470,           // anchor; adjust as you like
  panelRadius: 18,
  handleW: 40,
  handleH: 4,
  pad: 14,
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

  /** The draggable wrapper (absolute, same geometry across screens) */
  centerWrapper: {
    position: "absolute",
    top: METRICS.panelTop,
    width: "100%",
    alignSelf: "center",
    zIndex: 10,
    paddingBottom: 30,
  },

  /** White panel (sheet) */
  card: {
    backgroundColor: COLORS.panelBg,
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

  /** Grey drag handle INSIDE the panel, top */
  dragHandle: {
    width: METRICS.handleW,
    height: METRICS.handleH,
    borderRadius: METRICS.handleH / 2,
    backgroundColor: COLORS.handle,
    alignSelf: "center",
    marginBottom: 8,
    marginTop: 2,
  },

  logo: {
    width: 100,
    height: 70,
    alignSelf: "center",
    marginVertical: 6,
  },

  title: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: COLORS.green, // subtle brand cue
    letterSpacing: 0.2,
  },

  label: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    color: COLORS.text,
  },

  /** Inputs with green outline vibe */
  input: {
    borderWidth: 1,
    borderColor: COLORS.greenOutline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    fontSize: 14,
    width: "100%",
    color: COLORS.text,
    backgroundColor: "#FFF",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },

  /** Picker wrapper (keep spacing consistent) */
  picker: {
    borderWidth: 1,
    borderColor: COLORS.greenOutline,
    borderRadius: 10,
    marginTop: 6,
    width: "100%",
    height: 50,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "#FFF",
  },

  /** Primary button */
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
    width: "100%",

    shadowColor: COLORS.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonText: {
    color: COLORS.primaryText,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.6,
  },

  /** Web upload button mirrors primary button */
  webUploadButton: {
    backgroundColor: COLORS.primary,
    color: COLORS.primaryText,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    display: "inline-block",
    textAlign: "center",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.6,
  },
});

export default styles;
// Designs/IncidentReport.js
import { Platform, StyleSheet } from "react-native";

/** THEME (align to SafetyMark + green bar) */
export const COLORS = {
  bg: "#FFFFFF",
  mapBg: "#DDDDDD",

  // Accent / brand
  green: "#16A34A",
  greenDark: "#0F7A37",
  greenOutline: "#1F7A32",

  text: "#0B1220",
  textMuted: "#6B7280",

  // Panel / card
  panelBg: "#FFFFFF",
  handle: "#D1D5DB",
  border: "#365275",

  // Buttons
  primary: "#0F7A37",
  primaryText: "#ffe345",

  // Shadows
  shadow: "rgba(0,0,0,0.20)",
};

export const METRICS = {
  phoneMaxWidth: 390,      // match your other screens
  panelTop: 470,           // anchor; adjust as you like
  panelRadius: 18,
  handleW: 40,
  handleH: 4,
  pad: 14,
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

  /** The draggable wrapper (absolute, same geometry across screens) */
  centerWrapper: {
    position: "absolute",
    top: METRICS.panelTop,
    width: "100%",
    alignSelf: "center",
    zIndex: 10,
    paddingBottom: 30,
  },

  /** White panel (sheet) */
  card: {
    backgroundColor: COLORS.panelBg,
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

  /** Grey drag handle INSIDE the panel, top */
  dragHandle: {
    width: METRICS.handleW,
    height: METRICS.handleH,
    borderRadius: METRICS.handleH / 2,
    backgroundColor: COLORS.handle,
    alignSelf: "center",
    marginBottom: 8,
    marginTop: 2,
  },

  logo: {
    width: 100,
    height: 70,
    alignSelf: "center",
    marginVertical: 6,
  },

  title: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: COLORS.green, // subtle brand cue
    letterSpacing: 0.2,
  },

  label: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    color: COLORS.text,
  },

  /** Inputs with green outline vibe */
  input: {
    borderWidth: 1,
    borderColor: COLORS.greenOutline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    fontSize: 14,
    width: "100%",
    color: COLORS.text,
    backgroundColor: "#FFF",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },

  /** Picker wrapper (keep spacing consistent) */
  picker: {
    borderWidth: 1,
    borderColor: COLORS.greenOutline,
    borderRadius: 10,
    marginTop: 6,
    width: "100%",
    height: 50,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "#FFF",
  },

  /** Primary button */
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
    width: "100%",

    shadowColor: COLORS.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonText: {
    color: COLORS.primaryText,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.6,
  },

  /** Web upload button mirrors primary button */
  webUploadButton: {
    backgroundColor: COLORS.primary,
    color: COLORS.primaryText,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    display: "inline-block",
    textAlign: "center",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.6,
  },
});

export default styles;