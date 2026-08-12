import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Props:
 * - route: active route object (with summary + steps)
 * - travelMode: walking | cycling | driving
 * - currentStep: one step object (instruction, distance...)
 * - remainingDistanceM: number | null
 * - remainingDurationS: number | null
 * - onStop()
 * - onResume()
 */
export default function NavigationHUD({
  route,
  travelMode,
  currentStep,
  remainingDistanceM,
  remainingDurationS,
  onStop,
  onResume,
}) {
  if (!route) return null;

  const modeLabel =
    travelMode === "walking"
      ? "Walk"
      : travelMode === "cycling"
      ? "Bike"
      : "Drive";

  const remainingKm = useMemo(() => {
    const meters = remainingDistanceM ?? route.distance;
    return (meters / 1000).toFixed(1);
  }, [remainingDistanceM, route.distance]);

  const remainingMin = useMemo(() => {
    const seconds = remainingDurationS ?? route.duration;
    return Math.max(1, Math.round(seconds / 60));
  }, [remainingDurationS, route.duration]);

  const instruction = currentStep?.instruction ?? "Continue on route";

  return (
    <View style={styles.container}>
      {/* ETA */}
      <View style={styles.top}>
        <Text style={styles.time}>{remainingMin} min</Text>
        <Text style={styles.sub}>
          {remainingKm} km remaining · {modeLabel}
        </Text>
      </View>

      {/* Instruction */}
      <View style={styles.instruction}>
        <Ionicons name="navigate" size={24} color="#14532D" />
        <Text style={styles.instructionText}>{instruction}</Text>
      </View>

      {/* Controls */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.stopBtn} onPress={onStop}>
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resumeBtn} onPress={onResume}>
          <Text style={styles.resumeText}>Resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    elevation: 50,
    zIndex: 9999,
  },

  top: {
    alignItems: "center",
    marginBottom: 16,
  },

  time: {
    fontSize: 32,
    fontWeight: "800",
  },

  sub: {
    fontSize: 15,
    color: "#4b5563",
    marginTop: 2,
  },

  instruction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ecfdf5",
    padding: 16,
    borderRadius: 18,
    marginBottom: 20,
  },

  instructionText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#14532D",
    flex: 1,
  },

  actions: {
    flexDirection: "row",
    gap: 14,
  },

  stopBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },

  stopText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 16,
  },

  resumeBtn: {
    flex: 1,
    backgroundColor: "#14532D",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },

  resumeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});