import { StyleSheet, StatusBar } from "react-native";

export default StyleSheet.create({
  container: {
    paddingTop: (StatusBar.currentHeight || 0) + 24,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: -30,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE9D6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#123524",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: "#10251B",
  },

  headerSpacer: {
    width: 40,
    height: 40,
  },

  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: 12,
  },

  circle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#d1d5db",
    marginHorizontal: 6,
  },

  activeCircle: {
    backgroundColor: "#166534",
  },

  stepTitle: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
});