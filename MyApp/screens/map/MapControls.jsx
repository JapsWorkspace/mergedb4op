import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";

/**
 * Global map controls.
 * ❗ Recenter ONLY.
 * ❌ No Flood
 * ❌ No Quake
 *
 * Flood / Quake live in GlobalRoutePanel
 * so they move WITH the draggable panel.
 */
export default function MapControls({ onRecenter = () => {} }) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onRecenter}
        activeOpacity={0.8}
        style={styles.button}
      >
        <Text style={styles.icon}>📍</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },

  button: {
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 30,
    elevation: 4,
  },

  icon: {
    fontSize: 16,
  },
});