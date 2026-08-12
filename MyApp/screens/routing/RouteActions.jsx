import React from "react";
import { View, TouchableOpacity, Text } from "react-native";

export default function RouteActions({
  onStart,
  onAlternatives,
}) {
  return (
    <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
      <TouchableOpacity onPress={onStart}>
        <Text>Start</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onAlternatives}>
        <Text>Alternatives</Text>
      </TouchableOpacity>
    </View>
  );
}
