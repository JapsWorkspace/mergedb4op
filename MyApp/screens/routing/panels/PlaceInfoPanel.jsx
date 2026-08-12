// screens/routing/panels/PlaceInfoPanel.jsx

import { View, Text, StyleSheet } from "react-native";
import { useContext } from "react";
import { MapContext } from "../../contexts/MapContext";

export default function PlaceInfoPanel() {
  const { evac } = useContext(MapContext);

  /* =========================
     HARD DATA GUARD
  ========================= */

  if (
    !evac ||
    typeof evac !== "object" ||
    !evac._id ||
    typeof evac.latitude !== "number" ||
    typeof evac.longitude !== "number"
  ) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No place selected.</Text>
      </View>
    );
  }

  /* =========================
     STATUS COLORS
  ========================= */

  const STATUS_COLORS = {
    available: "#16a34a", // green
    limited: "#facc15",   // yellow
    full: "#dc2626",      // red
  };

  const hasCapacityStatus =
    evac.capacityStatus &&
    ["available", "limited", "full"].includes(evac.capacityStatus);

  /* =========================
     ONSITE SERVICES
  ========================= */

  const services = [
    evac.maleCR && "Male Restroom",
    evac.femaleCR && "Female Restroom",
    evac.commonCR && "Common Restroom",
    evac.potableWater && "Potable Water",
    evac.nonPotableWater && "Non‑potable Water",
    evac.isCovidFacility && "COVID Facility",
    typeof evac.bedCapacity === "number" && evac.bedCapacity > 0
      ? `${evac.bedCapacity} Beds`
      : null,
  ].filter(Boolean);

  /* =========================
     RENDER
  ========================= */

  return (
    <View style={styles.container}>
      {/* PLACE NAME */}
      <Text style={styles.title}>
        {evac.name || "Unnamed location"}
      </Text>

      {/* AVAILABILITY */}
      {hasCapacityStatus ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: STATUS_COLORS[evac.capacityStatus] },
          ]}
        >
          <Text style={styles.badgeText}>
            {evac.capacityStatus.toUpperCase()}
          </Text>
        </View>
      ) : (
        <Text style={styles.meta}>Location</Text>
      )}

      {/* SAFETY NOTICE */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Keep a safe distance from nearby structures. Be alert for falling hazards.
        </Text>
      </View>

      {/* ONSITE SERVICES */}
      <Text style={styles.section}>Onsite Services</Text>

      {services.length === 0 ? (
        <Text style={styles.empty}>
          No onsite services recorded for this location.
        </Text>
      ) : (
        <View style={styles.services}>
          {services.map((s) => (
            <View key={s} style={styles.chip}>
              <Text>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },

  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },

  badgeText: {
    color: "#fff",
    fontWeight: "600",
  },

  meta: {
    color: "#6b7280",
    marginBottom: 10,
  },

  notice: {
    backgroundColor: "#166534",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },

  noticeText: {
    color: "#fff",
  },

  section: {
    fontWeight: "600",
    marginBottom: 6,
  },

  services: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 14,
  },

  empty: {
    color: "#6b7280",
    marginBottom: 8,
  },

  placeholder: {
    color: "#6b7280",
  },
});
