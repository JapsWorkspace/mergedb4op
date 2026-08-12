import { View, Text, StyleSheet, Modal } from "react-native";
import { useContext, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { MapContext } from "../../contexts/MapContext";

export default function NavigationPanel() {
  const {
    activeRoute,
    setPanelState,
    setRouteRequested,
    setRoutes,
    setActiveRoute,
  } = useContext(MapContext);

  const [showConfirm, setShowConfirm] = useState(false);

  if (!activeRoute) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Preparing route…</Text>
      </View>
    );
  }

  /* =========================
     STOP NAVIGATION
     (LOGIC UNCHANGED)
  ========================= */
  const handleStopConfirmed = () => {
    setShowConfirm(false);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setPanelState("PLACE_INFO");
  };

  const steps = activeRoute.steps || [];
  const currentStep = steps[0];
  const totalSteps = steps.length;

  return (
    <View style={styles.container}>
      {/* ETA / DISTANCE */}
      <View style={styles.summaryRow}>
        <Ionicons name="time-outline" size={18} color="#14532d" />
        <Text style={styles.time}>
          {activeRoute.summary.displayTime}
        </Text>

        <Ionicons
          name="navigate-outline"
          size={18}
          color="#14532d"
          style={{ marginLeft: 14 }}
        />
        <Text style={styles.distance}>
          {activeRoute.summary.km} km
        </Text>
      </View>

      {/* DIVIDER */}
      <View style={styles.divider} />

      {/* STEP INFO */}
      <View style={styles.stepHeader}>
        <Ionicons
          name="location-outline"
          size={16}
          color="#6b7280"
        />
        <Text style={styles.stepCounter}>
          Step 1 of {totalSteps || 1}
        </Text>
      </View>

      {/* TURN INSTRUCTION */}
      <View style={styles.instructionRow}>
        <Ionicons
          name="arrow-forward-circle-outline"
          size={22}
          color="#374151"
        />
        <Text style={styles.instruction}>
          {currentStep?.instruction || "Continue straight"}
        </Text>
      </View>

      {/* STOP CONFIRMATION MODAL (UNCHANGED) */}
      <Modal transparent visible={showConfirm} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalText}>
              Do you want to stop navigation?
            </Text>

            <View style={styles.modalActions}>
              <Text onPress={() => setShowConfirm(false)}>No</Text>
              <Text
                onPress={handleStopConfirmed}
                style={{ color: "red", fontWeight: "700" }}
              >
                Yes
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* =========================
   STYLES (UI‑ONLY)
========================= */

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
  },

  loading: {
    color: "#6b7280",
  },

  /* SUMMARY */
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  time: {
    marginLeft: 6,
    fontWeight: "700",
    color: "#14532d",
  },

  distance: {
    marginLeft: 6,
    fontWeight: "600",
    color: "#14532d",
  },

  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 10,
  },

  /* STEP META */
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  stepCounter: {
    marginLeft: 6,
    fontSize: 12,
    color: "#6b7280",
  },

  /* INSTRUCTION */
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  instruction: {
    marginLeft: 8,
    fontSize: 15,
    color: "#374151",
    flex: 1,
    lineHeight: 20,
  },

  /* MODAL */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    width: "80%",
  },

  modalText: {
    marginBottom: 16,
    fontSize: 16,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});