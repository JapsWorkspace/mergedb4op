import { Dimensions, StyleSheet } from "react-native";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const COLORS = {
  background: "#F4F7F5",
  primary: "#047857",
  primaryDark: "#035F46",
  primarySoft: "#DDF8EA",
  primaryMist: "#BFEFD4",
  white: "#FFFFFF",
  text: "#10251B",
  muted: "#8A9690",
  border: "#E4ECE7",
  danger: "#B91C1C",
  placeholder: "#A6B0AB",
};

export function createLoginStyles(windowWidth, windowHeight) {
  const width = windowWidth || Dimensions.get("window").width;
  const height = windowHeight || Dimensions.get("window").height;
  const compactHeight = height < 720;
  const narrow = width < 360;
  const heroHeight = clamp(height * 0.58, compactHeight ? 390 : 430, 520);
  const panelOverlap = clamp(height * 0.2, compactHeight ? 132 : 150, 188);
  const cardWidth = Math.min(width - 32, 430);
  const heroBottomPadding = panelOverlap + (compactHeight ? 44 : 58);

  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboard: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
    paddingBottom: compactHeight ? 28 : 36,
    backgroundColor: COLORS.background,
  },
  heroBg: {
    height: heroHeight,
    justifyContent: "flex-end",
    paddingHorizontal: narrow ? 28 : 34,
    paddingBottom: heroBottomPadding,
    overflow: "hidden",
  },
  heroImage: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 78, 57, 0.7)",
  },
  heroDiagonalCut: {
    position: "absolute",
    left: -width * 0.1,
    right: -width * 0.1,
    bottom: -clamp(height * 0.1, 66, 88),
    height: clamp(height * 0.17, 128, 164),
    backgroundColor: COLORS.background,
    transform: [{ rotate: "-12deg" }],
  },
  heroContent: {
    maxWidth: 430,
    width: "100%",
    alignSelf: "center",
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: compactHeight ? 28 : 31,
    lineHeight: compactHeight ? 34 : 38,
    fontWeight: "900",
    marginBottom: 7,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  topShape: {
    display: "none",
  },
  topShapeGlow: {
    display: "none",
  },
  formCard: {
    width: cardWidth,
    maxWidth: 430,
    alignSelf: "center",
    marginTop: -panelOverlap,
    marginBottom: compactHeight ? 28 : 42,
    paddingHorizontal: narrow ? 22 : 26,
    paddingTop: compactHeight ? 24 : 30,
    paddingBottom: compactHeight ? 22 : 28,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    shadowColor: "#0B2A1F",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  brandPill: {
    display: "none",
  },
  brandDot: {
    display: "none",
  },
  brandText: {
    display: "none",
  },
  title: {
    color: COLORS.text,
    fontSize: compactHeight ? 26 : 29,
    lineHeight: compactHeight ? 31 : 35,
    fontWeight: "900",
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    marginBottom: compactHeight ? 28 : 38,
  },
  signupText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  signupLink: {
    color: COLORS.primary,
    fontWeight: "900",
  },
  inputShell: {
    width: "100%",
    minHeight: 56,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1.2,
    borderColor: "#DCE7E1",
    backgroundColor: COLORS.white,
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  passwordShell: {
    marginTop: 14,
  },
  inputShellFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0,
    elevation: 0,
  },
  inputField: {
    flex: 1,
    minWidth: 0,
    height: 54,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  eyeButton: {
    width: 34,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotButton: {
    minHeight: 36,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: "900",
  },
  errorBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF7F7",
    borderWidth: 1,
    borderColor: "#F6CACA",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  loginButton: {
    width: "100%",
    height: 54,
    borderRadius: 27,
    backgroundColor: "transparent",
    alignSelf: "center",
    overflow: "hidden",
    marginTop: compactHeight ? 22 : 32,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  buttonGradient: {
    width: "100%",
    height: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  loginButtonDisabled: {
    opacity: 0.72,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: compactHeight ? 14 : 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  signupButton: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    borderWidth: 1.2,
    borderColor: "#A8DCC2",
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signupButtonText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "900",
  },
  bottomSignup: {
    paddingTop: compactHeight ? 20 : 26,
    paddingBottom: 2,
  },
  });
}

const defaultDimensions = Dimensions.get("window");
export default createLoginStyles(defaultDimensions.width, defaultDimensions.height);
