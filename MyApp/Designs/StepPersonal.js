// Designs/StepPersonal.js
import { StyleSheet } from "react-native";

export default StyleSheet.create({
  /* ================= CONTAINER ================= */
  container: {
    padding: 24,
    backgroundColor: "#FFFFFF",
    paddingBottom: 64, // prevents keyboard overlap
    flexGrow: 1,
  },

  /* ================= IMAGE ================= */
  image: {
    width: "100%",
    height: 200,
    resizeMode: "contain",
    marginTop: 40,
    marginBottom: 8,
  },

  /* ================= TEXT ================= */
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#166534",
    textAlign: "center",
    marginTop: 12,
  },

  subtext: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },

  /* ================= INPUT ================= */
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
    width: "100%",
  },

  fieldContainer: {
    width: "100%",
    marginBottom: 14,
  },

  label: {
    marginBottom: 6,
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
  },

  pickerShell: {
    width: "100%",
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
  },

  picker: {
    width: "100%",
    minHeight: 52,
  },

  /* ================= ERROR ================= */
  error: {
    color: "#DC2626", // red
    fontSize: 12,
    marginTop: 4,
  },

  /* ================= BUTTON ================= */
  button: {
    backgroundColor: "#166534",
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 20,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 14,
  },
});
