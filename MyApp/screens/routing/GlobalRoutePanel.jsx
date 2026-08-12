// screens/routing/GlobalRoutePanel.jsx

import { useContext, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  View,
  ScrollView,
  StyleSheet,
} from "react-native";

import { MapContext } from "../contexts/MapContext";
import PlaceInfoPanel from "./panels/PlaceInfoPanel";
import RouteSelectionPanel from "./panels/RouteSelectionPanel";
import NavigationPanel from "./panels/NavigationPanel";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/*
  PANEL POSITIONING RULES

  ✅ MIN_Y = expanded (near top)
  ✅ MAX_Y = collapsed (still visible!)
  ✅ height = visible panel only (NOT full screen!)
*/

const BOTTOM_NAV_HEIGHT = 72;

const MIN_Y = SCREEN_HEIGHT * 0.12;
const MAX_Y = SCREEN_HEIGHT * 0.55;
const PANEL_HEIGHT = SCREEN_HEIGHT - MIN_Y;

export default function GlobalRoutePanel({ visible }) {
  const { panelState, panelY, setPanelY } = useContext(MapContext);

  const translateY = useRef(
    new Animated.Value(typeof panelY === "number" ? panelY : MAX_Y)
  ).current;

  const lastY = useRef(typeof panelY === "number" ? panelY : MAX_Y);

  /* =========================
     Sync saved panelY
  ========================= */
  useEffect(() => {
    if (typeof panelY === "number") {
      translateY.setValue(panelY);
      lastY.current = panelY;
    }
  }, [panelY]);

  /* =========================
     Drag logic
  ========================= */
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 6, // ✅ don’t steal scroll

      onPanResponderGrant: () => {
        translateY.setOffset(lastY.current);
        translateY.setValue(0);
      },

      onPanResponderMove: (_, g) => {
        let nextY = lastY.current + g.dy;
        nextY = Math.max(MIN_Y, Math.min(MAX_Y, nextY));
        translateY.setValue(nextY - lastY.current);
      },

      onPanResponderRelease: (_, g) => {
        translateY.flattenOffset();

        let finalY = lastY.current + g.dy;
        finalY = Math.max(MIN_Y, Math.min(MAX_Y, finalY));

        lastY.current = finalY;
        setPanelY(finalY);
        translateY.setValue(finalY);
      },
    })
  ).current;

  if (!visible || panelState === "HIDDEN") return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          height: PANEL_HEIGHT,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* DRAG HANDLE */}
      <View
        {...panResponder.panHandlers}
        style={styles.handle}
      />

      {/* CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {panelState === "PLACE_INFO" && <PlaceInfoPanel />}
        {panelState === "ROUTE_SELECTION" && <RouteSelectionPanel />}
        {panelState === "NAVIGATION" && <NavigationPanel />}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,

    zIndex: 999,
    elevation: 999,

    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
    marginTop: 12,
    marginBottom: 10,
  },

  content: {
    paddingHorizontal: 16,
    paddingBottom: BOTTOM_NAV_HEIGHT + 24,
  },
});