import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SCREEN_HEIGHT = Dimensions.get("window").height;

/**
 * Props:
 * - visible: boolean
 * - routes: array of routes
 * - activeMode: "walking" | "cycling" | "driving"
 * - activeRouteIndex: number
 * - onChangeMode(mode)
 * - onSelectRoute(index)
 * - onStart()
 */
export default function RoutePanel({
  visible,
  routes,
  activeMode,
  activeRouteIndex,
  onChangeMode,
  onSelectRoute,
  onStart,
}) {
  /* ================= SAFETY GUARDS ================= */
  if (!visible || !Array.isArray(routes) || routes.length === 0) {
    return null;
  }

  const route = routes[activeRouteIndex] ?? routes[0];
  if (!route) return null;

  /* ================= MODE LABEL ================= */

  const modeLabel =
    activeMode === "walking"
      ? "Walking"
      : activeMode === "cycling"
      ? "Bike"
      : "Car";

  /* ================= PANEL DRAG ================= */

  const COLLAPSED_Y = SCREEN_HEIGHT * 0.55;
  const EXPANDED_Y = SCREEN_HEIGHT * 0.12;

  const translateY = useRef(new Animated.Value(COLLAPSED_Y)).current;
  const lastY = useRef(COLLAPSED_Y);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: COLLAPSED_Y,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      lastY.current = COLLAPSED_Y;
    });
  }, [activeMode]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,

      onPanResponderMove: (_, g) => {
        let next = lastY.current + g.dy;
        next = Math.max(EXPANDED_Y, Math.min(COLLAPSED_Y, next));
        translateY.setValue(next);
      },

      onPanResponderRelease: (_, g) => {
        let next = lastY.current + g.dy;
        next = Math.max(EXPANDED_Y, Math.min(COLLAPSED_Y, next));
        lastY.current = next;

        Animated.spring(translateY, {
          toValue: next,
          stiffness: 220,
          damping: 28,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      {/* Handle */}
      <View style={styles.handle} />

      {/* MODE SWITCH */}
      <View style={styles.modes}>
        <ModeButton
          icon="walk"
          label="Walk"
          active={activeMode === "walking"}
          onPress={() => onChangeMode("walking")}
        />
        <ModeButton
          icon="bicycle"
          label="Bike"
          active={activeMode === "cycling"}
          onPress={() => onChangeMode("cycling")}
        />
        <ModeButton
          icon="car"
          label="Car"
          active={activeMode === "driving"}
          onPress={() => onChangeMode("driving")}
        />
      </View>

      {/* SUMMARY */}
      <Text style={styles.summary}>
        {modeLabel} · {route.summary.minutes} min · {route.summary.km} km
      </Text>

      <Text style={styles.sub}>
        {route.isRecommended ? "Recommended route" : "Alternative route"}
      </Text>

      {/* ROUTE LIST */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {routes.map((r, idx) => {
          const isActive = idx === activeRouteIndex;
          return (
            <TouchableOpacity
              key={r.id ?? idx}
              style={[
                styles.routeCard,
                isActive && styles.routeCardActive,
              ]}
              onPress={() => onSelectRoute(idx)}
            >
              <View style={styles.routeHeader}>
                <Text style={styles.routeTitle}>
                  {modeLabel} · {r.summary.minutes} min · {r.summary.km} km
                </Text>

                {r.isRecommended && (
                  <View style={styles.badge}>
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={styles.badgeText}>Recommended</Text>
                  </View>
                )}
              </View>

              <Text style={styles.routeSub}>
                Best available route for {modeLabel.toLowerCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ACTIONS */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Leave later</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={onStart}>
          <Text style={styles.primaryText}>Go now</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/* ================= SUB COMPONENT ================= */

function ModeButton({ icon, label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.modeBtn, active && styles.modeBtnActive]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? "#fff" : "#14532D"}
      />
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    elevation: 30,
    zIndex: 9999,
  },

  handle: {
    width: 44,
    height: 5,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 14,
  },

  modes: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 14,
  },

  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#14532D",
  },

  modeBtnActive: {
    backgroundColor: "#14532D",
  },

  modeText: {
    color: "#14532D",
    fontWeight: "600",
  },

  modeTextActive: {
    color: "#fff",
  },

  summary: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },

  sub: {
    textAlign: "center",
    color: "#16A34A",
    marginBottom: 12,
  },

  list: {
    flex: 1,
    marginTop: 6,
  },

  routeCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  routeCardActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#14532D",
  },

  routeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },

  routeTitle: {
    fontSize: 16,
    fontWeight: "600",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#14532D",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  badgeText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },

  routeSub: {
    fontSize: 13,
    color: "#4b5563",
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#14532D",
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: "center",
  },

  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#14532D",
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: "center",
  },

  secondaryText: {
    color: "#14532D",
    fontWeight: "600",
    fontSize: 16,
  },
});