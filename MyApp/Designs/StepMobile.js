import { StyleSheet, Dimensions, Platform } from "react-native";

const { height } = Dimensions.get("window");

export default StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    backgroundColor: "#fff",
  },

  backBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    left: 20,
    zIndex: 10,
  },

  backText: {
    fontSize: 28,
    color: "#166534",
  },

  image: {
    width: "100%",
    height: height * 0.22,
    resizeMode: "contain",
    marginBottom: 12,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    marginVertical: 12,
    color: "#166534",
    textAlign: "center",
  },

  description: {
    textAlign: "center",
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 20,
  },

  /* ================= MODERN INPUT SYSTEM ================= */

  fieldGroup: {
    width: "100%",
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },

  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    minHeight: 52,

    // iOS shadow
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },

    // Android elevation
    elevation: 2,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingHorizontal: 10,
  },

  prefixBox: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  prefixText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  /* ================= ERROR ================= */

  error: {
    color: "#DC2626",
    fontSize: 12,
    marginTop: 4,
  },

  /* ================= BUTTON ================= */

  button: {
    backgroundColor: "#166534",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 24,
    marginBottom: 40,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 16,
  },
});
