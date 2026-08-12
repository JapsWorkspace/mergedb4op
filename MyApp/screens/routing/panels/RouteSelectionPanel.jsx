import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useContext } from "react";
import { Ionicons } from "@expo/vector-icons";
import { MapContext } from "../../contexts/MapContext";

export default function RouteSelectionPanel() {
  const {
    routes,
    setRoutes,
    activeRoute,
    setActiveRoute,
    travelMode,
    setTravelMode,
    setRouteRequested,
    setPanelState,
  } = useContext(MapContext);

  /* =========================
     CHANGE TRAVEL MODE
     (UNCHANGED)
  ========================= */
  const handleChangeMode = (mode) => {
    if (mode === travelMode) return;

    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setTravelMode(mode);

    setTimeout(() => {
      setRouteRequested(true);
    }, 0);
  };

  /* =========================
     ICON MAP (UI ONLY)
  ========================= */
  const MODE_ICONS = {
    walking: "walk-outline",
    cycling: "bicycle-outline",
    driving: "car-outline",
  };

  return (
    <View style={styles.container}>
      {/* TRANSPORT MODES */}
      <View style={styles.modes}>
        {["walking", "cycling", "driving"].map((mode) => {
          const isActive = travelMode === mode;

          return (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeBtn,
                isActive && styles.modeActive,
              ]}
              onPress={() => handleChangeMode(mode)}
            >
              <Ionicons
                name={MODE_ICONS[mode]}
                size={22}
                color={isActive ? "#ffffff" : "#374151"}
                style={{ marginBottom: 4 }}
              />
              <Text
                style={[
                  styles.modeText,
                  isActive && styles.modeTextActive,
                ]}
              >
                {mode}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ROUTES */}
      {routes.length === 0 ? (
        <Text style={styles.loading}>Finding routes…</Text>
      ) : (
        routes.map((r, idx) => (
          <TouchableOpacity
            key={r.id ?? idx}
            style={[
              styles.routeCard,
              r === activeRoute && styles.routeActive,
            ]}
            onPress={() => setActiveRoute(r)}
          >
            <Text style={styles.routeMain}>
              {r.summary.displayTime} · {r.summary.km} km
            </Text>

            {r.isRecommended && (
              <Text style={styles.routeSub}>
                Recommended route
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

/* =========================
   STYLES (UI‑ONLY CHANGES)
========================= */

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },

  /* MODE SELECTOR */
  modes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  modeBtn: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },

  modeActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },

  modeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textTransform: "capitalize",
  },

  modeTextActive: {
    color: "#ffffff",
  },

  /* ROUTES */
  loading: {
    color: "#6b7280",
    marginBottom: 12,
  },

  routeCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },

  routeActive: {
    borderColor: "#16a34a",
    backgroundColor: "#f0fdf4",
  },

  routeMain: {
    fontWeight: "700",
  },

  routeSub: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
});