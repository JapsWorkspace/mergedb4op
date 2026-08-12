import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  backBtn: { position: "absolute", top: 40, left: 20 },
  backText: { fontSize: 28, color: "#166534" },
  image: { width: "100%", height: 180, marginTop: 1,  },
  title: { fontSize: 22, fontWeight: "700", marginVertical: 16, color: "#166534" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingRight: 48,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    width: "100%",
  },
  button: { backgroundColor: "#166534", padding: 14, borderRadius: 10, marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "700", textAlign: "center" },
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
  inputWrapper: {
  position: "relative",
  justifyContent: "center",
},

eyeIcon: {
  position: "absolute",
  right: 12,
  top: 14,
},

error: {
  color: "#DC2626",
  fontSize: 12,
  marginTop: 4,
},

});
