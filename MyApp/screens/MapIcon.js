// screens/MapIcon.js
import React from "react";
import { View, Text } from "react-native";

/* ================= MARKER IMAGES ================= */
export const MarkerImages = {
  default: require("../stores/assets/low.png"),
  low: require("../stores/assets/low.png"),
  medium: require("../stores/assets/medium.png"),
  high: require("../stores/assets/high.png"),
  critical: require("../stores/assets/critical.png"),
  def: require("../stores/assets/defmarker.png"),
};

/* ================= IMAGE PICKER ================= */
export function getMarkerImageBySeverity(levelOrType) {
  const key = String(levelOrType || "").toLowerCase();
  if (key.includes("critical")) return MarkerImages.critical;
  if (key.includes("high") || key.includes("severe")) return MarkerImages.high;
  if (key.includes("med")) return MarkerImages.medium;
  if (key.includes("low") || key.includes("safe")) return MarkerImages.low;
  return MarkerImages.default;
}

/* ================= COLOR PICKER ✅ FIX ================= */
export function colorByLevel(level = "default") {
  switch (String(level).toLowerCase()) {
    case "critical":
      return "#991B1B";
    case "high":
    case "severe":
      return "#DC2626";
    case "medium":
      return "#F59E0B";
    case "low":
    case "safe":
      return "#16A34A";
    default:
      return "#2563EB"; // default blue
  }
}

/* ================= PILL MARKER ================= */
export function PillMarker({ color = "#2563EB", label, compact = false }) {
  const padH = compact ? 6 : 8;
  const padV = compact ? 4 : 6;

  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          backgroundColor: color,
          paddingHorizontal: padH,
          paddingVertical: padV,
          borderRadius: 14,
          minWidth: 22,
          alignItems: "center",
        }}
      >
        {label ? (
          <Text
            style={{
              color: "#fff",
              fontWeight: "600",
              fontSize: compact ? 11 : 12,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderTopWidth: compact ? 7 : 8,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
        }}
      />
    </View>
  );
}
