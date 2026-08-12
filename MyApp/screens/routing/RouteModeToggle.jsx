import React from "react";
import { View, TouchableOpacity, Text } from "react-native";

const MODES = [
  { key: "driving", icon: "🚗" },
  { key: "walking", icon: "🚶" },
  { key: "cycling", icon: "🚲" },
];

export default function RouteModeToggle({ mode, onChange }) {
  return (
    <View style={{ flexDirection: "row", gap: 18 }}>
      {MODES.map(m => (
        <TouchableOpacity
          key={m.key}
          onPress={() => onChange(m.key)}
        >
          <Text style={{ fontSize: 18, opacity: mode === m.key ? 1 : 0.4 }}>
            {m.icon}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
``