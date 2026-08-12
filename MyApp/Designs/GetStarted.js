// Designs/GetStarted.js
import { StyleSheet, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const COLORS = {
  base: "#053101",
  dark: "#032500",
  mid: "#0C4308",
  light: "#25B01A",
  white: "#ffffff",
};

export default StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.base,
  },

  background: {
    flex: 1,
    backgroundColor: COLORS.base,
    position: "relative",
    overflow: "hidden",
  },

  /* ===== CAMO DIAGONAL STRIPES (RECTANGLES, NOT CURVES) ===== */

  stripeTop: {
    position: "absolute",
    top: -160,
    left: -width,
    width: width * 2,
    height: height * 0.35,
    backgroundColor: COLORS.dark,
    transform: [{ rotate: "-12deg" }],
    opacity: 0.9,
  },

  stripeMid: {
    position: "absolute",
    top: height * 0.18,
    left: -width,
    width: width * 2,
    height: height * 0.35,
    backgroundColor: COLORS.mid,
    transform: [{ rotate: "-12deg" }],
    opacity: 0.95,
  },

  stripeMid2: {
    position: "absolute",
    top: height * 0.38,
    left: -width,
    width: width * 2,
    height: height * 0.25,
    backgroundColor: COLORS.dark,
    transform: [{ rotate: "-12deg" }],
    opacity: 0.85,
  },

  stripeBottom: {
    position: "absolute",
    bottom: -200,
    left: -width,
    width: width * 2,
    height: height * 0.4,
    backgroundColor: COLORS.light,
    transform: [{ rotate: "-12deg" }],
  },

  /* ===== CONTENT ===== */

  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: height * 0.25,
    paddingBottom: 60,
    paddingHorizontal: 20,
    zIndex: 10,
  },

  logo: {
    width: width * 3.68,
    height: 280,
    marginBottom: -150,
  },

  brandText: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "300",
    letterSpacing: 0.8,
    marginBottom: 28,
  },

  /* ===== SLIDER ===== */

  bottomDock: {
    width: "100%",
  },

  sliderTrack: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
  },

  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.dark,
    borderRadius: 28,
  },

  sliderLabel: {
    color: COLORS.base,
    fontSize: 14,
    fontWeight: "600",
  },

  knob: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
    elevation: 14,
  },

  knobArrow: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
  },
});