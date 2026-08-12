import React, { useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MIN_Y = SCREEN_HEIGHT * 0.24;
const MID_Y = SCREEN_HEIGHT * 0.48;
const MAX_Y = SCREEN_HEIGHT * 0.7;
const DRAG_THRESHOLD = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearestSnapPoint(value) {
  return [MIN_Y, MID_Y, MAX_Y].reduce((closest, point) =>
    Math.abs(point - value) < Math.abs(closest - value) ? point : closest
  );
}

function getAvailabilityMeta(status) {
  switch (status) {
    case "available":
      return { text: "Available", color: "#16a34a", tint: "#DCFCE7" };
    case "limited":
      return { text: "Limited", color: "#ca8a04", tint: "#FEF3C7" };
    case "full":
      return { text: "Full", color: "#dc2626", tint: "#FEE2E2" };
    default:
      return { text: "Unknown", color: "#64748b", tint: "#F1F5F9" };
  }
}

export default function BottomSheetPanel({
  state,
  evac,
  routes = [],
  onViewRoutes,
  onGoNow,
  onLeaveLater,
}) {
  const translateY = useRef(new Animated.Value(MAX_Y)).current;
  const lastY = useRef(MAX_Y);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > DRAG_THRESHOLD &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: () => {
        translateY.stopAnimation((value) => {
          lastY.current = clamp(value, MIN_Y, MAX_Y);
          translateY.setOffset(lastY.current);
          translateY.setValue(0);
        });
      },

      onPanResponderMove: (_, gesture) => {
        const nextY = clamp(lastY.current + gesture.dy, MIN_Y, MAX_Y);
        translateY.setValue(nextY - lastY.current);
      },

      onPanResponderRelease: (_, gesture) => {
        translateY.flattenOffset();
        const rawFinalY = clamp(lastY.current + gesture.dy, MIN_Y, MAX_Y);
        const projectedY = rawFinalY + clamp(gesture.vy * 18, -44, 44);
        const finalY = nearestSnapPoint(projectedY);

        lastY.current = finalY;
        Animated.spring(translateY, {
          toValue: finalY,
          stiffness: 170,
          damping: 34,
          mass: 0.9,
          useNativeDriver: true,
        }).start();
      },

      onPanResponderTerminate: () => {
        translateY.flattenOffset();
        translateY.setValue(lastY.current);
      },
    })
  ).current;

  if (!evac || state === "HIDDEN") return null;

  const availability = getAvailabilityMeta(evac.availability);

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
      <View {...panResponder.panHandlers} style={styles.dragZone}>
        <View style={styles.handle} />
      </View>

      {state === "PLACE_INFO" && (
        <View style={styles.content}>
          <Text style={styles.title}>{evac.label || "Selected location"}</Text>

          <View
            style={[
              styles.badge,
              { backgroundColor: availability.tint, borderColor: availability.color },
            ]}
          >
            <Text style={[styles.badgeText, { color: availability.color }]}>
              {availability.text}
            </Text>
          </View>

          <PrimaryButton text="View routes" onPress={onViewRoutes} />
        </View>
      )}

      {state === "ROUTE_SELECTION" && (
        <View style={styles.content}>
          <Text style={styles.title}>Available Routes</Text>

          {routes.map((route, index) => (
            <View key={route?.id || index} style={styles.routeCard}>
              <Text style={styles.routeText}>
                {Math.round(route.duration / 60)} min | {Math.round(route.distance)} m
              </Text>
            </View>
          ))}

          <View style={styles.actions}>
            <SecondaryButton text="Later" onPress={onLeaveLater} />
            <PrimaryButton text="Go now" onPress={onGoNow} />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const PrimaryButton = ({ text, onPress }) => (
  <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.88}>
    <Text style={styles.primaryText}>{text}</Text>
  </TouchableOpacity>
);

const SecondaryButton = ({ text, onPress }) => (
  <TouchableOpacity style={styles.secondaryBtn} onPress={onPress} activeOpacity={0.88}>
    <Text style={styles.secondaryText}>{text}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingBottom: 20,
    shadowColor: "#0f2319",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 18,
  },
  dragZone: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 68,
    height: 6,
    backgroundColor: "#A7BAAF",
    borderRadius: 999,
  },
  content: {
    paddingTop: 4,
    gap: 12,
  },
  title: {
    color: "#10251B",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  routeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2ECE6",
    backgroundColor: "#F8FBF9",
    padding: 13,
  },
  routeText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: "#047857",
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "900",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#DCE7E1",
    backgroundColor: "#F8FBF9",
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: "#14532D",
    fontWeight: "900",
  },
});