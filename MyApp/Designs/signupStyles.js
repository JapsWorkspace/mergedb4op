import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
    color: "#166534",
  },

  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    color: "#555",
  },

  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
  },

  button: {
    backgroundColor: "#166534",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
    flex: 1,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: "#166534",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },

  secondaryText: {
    color: "#166534",
    fontWeight: "700",
  },

  row: {
    flexDirection: "row",
    marginTop: 10,
  },
});