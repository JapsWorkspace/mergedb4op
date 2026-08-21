import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AccessibilityInfo,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import styles from "../Designs/NewBottomNav";
import { MapContext } from "./contexts/MapContext";
import { useTheme } from "./contexts/ThemeContext";

const MODULES = [
  {
    key: "incident",
    label: "Incident",
    helper: "Report",
    icon: "warning-outline",
  },
  {
    key: "hazard",
    label: "Hazard Map",
    helper: "Hazard",
    icon: "warning-outline",
  },
  {
    key: "barangay",
    label: "Barangay",
    helper: "Boundary",
    icon: "map-outline",
  },
  {
    key: "evac",
    label: "Evac Place",
    helper: "Routes",
    icon: "navigate-outline",
  },
];

const ITEM_WIDTH = 180;
const HORIZONTAL_DRAG_THRESHOLD = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function DockCard({ item, index, total, isActive, onPress, theme, disabled }) {
  const isDark = theme.mode === "dark";
  const activeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: isActive ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isActive, activeAnim]);

  const translateY = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });

  const scale = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.045],
  });

  const backgroundColor = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "rgba(18,28,24,0.96)" : theme.card, theme.buttonPrimary],
  });

  const borderColor = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "rgba(134,239,172,0.46)" : theme.border, theme.buttonPrimary],
  });

  const iconBg = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "rgba(134,239,172,0.16)" : theme.primarySoft, theme.panel],
  });

  const iconBorder = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "rgba(134,239,172,0.36)" : theme.border, theme.border],
  });

  const labelColor = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "#F8FFF9" : theme.text, theme.buttonText],
  });

  const helperColor = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? "#D7E8DC" : theme.subtext, theme.buttonText],
  });

  const iconColor = isActive ? theme.primary : isDark ? "#F8FFF9" : theme.primary;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={index === total - 1 ? styles.lastCardWrap : styles.cardWrap}
    >
      <Animated.View
        style={[
          styles.moduleCard,
          {
            backgroundColor,
            borderColor,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.iconBox,
            {
              backgroundColor: iconBg,
              borderColor: iconBorder,
            },
          ]}
        >
          <Ionicons name={item.icon} size={isActive ? 22 : 20} color={iconColor} />
        </Animated.View>

        <View style={styles.labelBox}>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.moduleLabel,
              {
                color: labelColor,
                fontSize: isActive ? 14 : 13,
              },
            ]}
          >
            {item.label}
          </Animated.Text>

          <Animated.Text
            numberOfLines={1}
            style={[styles.moduleHelper, { color: helperColor }]}
          >
            {item.helper}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function NewBottomNav() {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const {
    activeMapModule,
    isMapPanelOpen,
    setIsMapPanelOpen,
    setActiveMapModule,
    setPanelState,
    setPanelY,
    setIsBottomNavInteracting,
    setEvac,
    setRouteRequested,
    setRoutes,
    setActiveRoute,
  } = useContext(MapContext);

  const [activeDockItem, setActiveDockItem] = useState("incident");
  const [isDragging, setIsDragging] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const moduleData = useMemo(() => MODULES, []);
  const maxOffset = useMemo(
    () => Math.max(0, moduleData.length * ITEM_WIDTH - screenWidth + 36),
    [moduleData.length, screenWidth]
  );
  const navAnim = useRef(new Animated.Value(1)).current;
  const railX = useRef(new Animated.Value(0)).current;
  const releaseTimerRef = useRef(null);
  const dragStartOffsetRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const focusedIndexRef = useRef(0);
  const dragFrameRef = useRef(null);
  const pendingRailValueRef = useRef(0);

  const shouldRevealBottomNav = !isMapPanelOpen;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(Boolean(enabled))
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const lockBottomNavGesture = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    if (typeof setIsBottomNavInteracting === "function") {
      setIsBottomNavInteracting(true);
    }
  }, [setIsBottomNavInteracting]);

  const releaseBottomNavGesture = useCallback(
    (delay = 140) => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }

      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null;
        if (typeof setIsBottomNavInteracting === "function") {
          setIsBottomNavInteracting(false);
        }
      }, delay);
    },
    [setIsBottomNavInteracting]
  );

  const setFocusedModuleByIndex = useCallback(
    (index) => {
      const safeIndex = clamp(index, 0, moduleData.length - 1);
      const focused = moduleData[safeIndex];

      if (!focused || focusedIndexRef.current === safeIndex) return;

      focusedIndexRef.current = safeIndex;
      setActiveDockItem(focused.key);
    },
    [moduleData]
  );

  const setRailOffset = useCallback(
    (nextOffset, animated = true) => {
      const safeOffset = clamp(nextOffset, 0, maxOffset);
      currentOffsetRef.current = safeOffset;

      const toValue = -safeOffset;
      if (!animated) {
        railX.setValue(toValue);
        return;
      }

      Animated.spring(railX, {
        toValue,
        stiffness: 150,
        damping: 32,
        mass: 0.95,
        useNativeDriver: true,
      }).start();
    },
    [maxOffset, railX, setFocusedModuleByIndex]
  );

  const snapToNearest = useCallback(
    (offset, velocityX = 0) => {
      const projectedOffset = offset - velocityX * 46;
      const nearestIndex = clamp(
        Math.round(projectedOffset / ITEM_WIDTH),
        0,
        moduleData.length - 1
      );
      setFocusedModuleByIndex(nearestIndex);
      setRailOffset(nearestIndex * ITEM_WIDTH, true);
    },
    [moduleData.length, setRailOffset]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          const isHorizontalDrag =
            Math.abs(gesture.dx) > HORIZONTAL_DRAG_THRESHOLD &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.08;

          if (isHorizontalDrag) lockBottomNavGesture();
          return isHorizontalDrag;
        },
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > HORIZONTAL_DRAG_THRESHOLD &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.08,
        onPanResponderGrant: () => {
          lockBottomNavGesture();
          setIsDragging(true);
          railX.stopAnimation((value) => {
            const currentOffset = clamp(-value, 0, maxOffset);
            currentOffsetRef.current = currentOffset;
            dragStartOffsetRef.current = currentOffset;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const nextOffset = clamp(dragStartOffsetRef.current - gesture.dx, 0, maxOffset);
          currentOffsetRef.current = nextOffset;
          pendingRailValueRef.current = -nextOffset;

          if (!dragFrameRef.current) {
            dragFrameRef.current = requestAnimationFrame(() => {
              dragFrameRef.current = null;
              railX.setValue(pendingRailValueRef.current);
            });
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (dragFrameRef.current) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
            railX.setValue(pendingRailValueRef.current);
          }
          setIsDragging(false);
          snapToNearest(currentOffsetRef.current, gesture.vx);
          releaseBottomNavGesture(220);
        },
        onPanResponderTerminate: () => {
          if (dragFrameRef.current) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
            railX.setValue(pendingRailValueRef.current);
          }
          setIsDragging(false);
          snapToNearest(currentOffsetRef.current, 0);
          releaseBottomNavGesture(220);
        },
      }),
    [lockBottomNavGesture, maxOffset, railX, releaseBottomNavGesture, setFocusedModuleByIndex, snapToNearest]
  );

  useEffect(() => {
    navAnim.stopAnimation();
    Animated.timing(navAnim, {
      toValue: shouldRevealBottomNav ? 1 : 0,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [navAnim, reduceMotion, shouldRevealBottomNav]);

  useEffect(() => {
    const index = moduleData.findIndex((item) => item.key === activeMapModule);

    if (index >= 0) {
      focusedIndexRef.current = index;
      setActiveDockItem(moduleData[index].key);
      requestAnimationFrame(() => setRailOffset(index * ITEM_WIDTH, true));
    }
  }, [activeMapModule, moduleData, setRailOffset]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    },
    []
  );

  const openModule = (moduleKey, index) => {
    if (isDragging) return;

    releaseBottomNavGesture(0);
    focusedIndexRef.current = index;
    setActiveDockItem(moduleKey);
    setEvac(null);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setIsMapPanelOpen(true);
    setActiveMapModule(moduleKey);
    setPanelState("HIDDEN");
    setPanelY(null);
    setRailOffset(index * ITEM_WIDTH, true);
  };

  return (
    <Animated.View
      pointerEvents={shouldRevealBottomNav ? "auto" : "none"}
      style={[
        localStyles.overlay,
        {
          opacity: navAnim,
          transform: [
            {
              translateY: navAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [120, 0],
              }),
            },
          ],
        },
      ]}
    >
      <SafeAreaView edges={["bottom"]} style={styles.safe} pointerEvents="box-none">
        <View
          style={styles.root}
          pointerEvents="auto"
          onTouchStart={lockBottomNavGesture}
          onTouchEnd={() => releaseBottomNavGesture(160)}
          onTouchCancel={() => releaseBottomNavGesture(160)}
        >
          <View style={localStyles.navFrame} {...panResponder.panHandlers}>
            <Animated.View
              style={[
                styles.stackContent,
                localStyles.cardRail,
                { transform: [{ translateX: railX }] },
              ]}
            >
              {moduleData.map((item, index) => (
                <DockCard
                  key={item.key}
                  item={item}
                  index={index}
                  total={moduleData.length}
                  isActive={activeDockItem === item.key}
                  onPress={() => openModule(item.key, index)}
                  theme={theme}
                  disabled={isDragging}
                />
              ))}
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const localStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 999,
  },

  navFrame: {
    width: "100%",
    minHeight: 132,
    overflow: "hidden",
  },

  cardRail: {
    flexDirection: "row",
    width: "auto",
    overflow: "visible",
  },
});
