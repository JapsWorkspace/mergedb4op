import React from "react";
import { View, Text } from "react-native";

export default function RouteSummary({ route }) {
  if (!route) return null;

  const minutes = Math.round(route.duration / 60);
  const meters = Math.round(route.distance);

  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        {minutes} min ({meters} m)
      </Text>
      <Text style={{ color: "#16A34A" }}>
        Fastest & safest route
      </Text>
    </View>
  );
}
