import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Props:
 * - routes: array of routes from useRouting
 * - activeRouteIndex: number
 * - travelMode: "walking" | "cycling" | "driving"
 * - onSelectRoute(index)
 */
export default function RouteListPanel({
  routes,
  activeRouteIndex,
  travelMode,
  onSelectRoute,
}) {
  if (!routes || routes.length === 0) return null;

  const modeLabel =
    travelMode === "walking"
      ? "Walking"
      : travelMode === "cycling"
      ? "Bike"
      : "Car";

  return (
    <View style={styles.container}>
      {routes.map((route, index) => {
        const isActive = index === activeRouteIndex;
        const isRecommended = route.isRecommended;

        return (
          <TouchableOpacity
            key={route.id}
            style={[
              styles.card,
              isActive && styles.cardActive,
            ]}
            onPress={() => onSelectRoute(index)}
          >
            {/* Row header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {modeLabel} · {route.summary.minutes} min · {route.summary.km} km
              </Text>

              {isRecommended && (
                <View style={styles.badge}>
                  <Ionicons name="star" size={12} color="#fff" />
                  <Text style={styles.badgeText}>Recommended</Text>
                </View>
              )}
            </View>

            {/* Subtext */}
            <Text style={styles.sub}>
              Best available route for {modeLabel.toLowerCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },

  card: {
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  cardActive: {
    borderColor: "#14532D",
    backgroundColor: "#ecfdf5",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#14532D",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },

  sub: {
    fontSize: 13,
    color: "#4b5563",
  },
});