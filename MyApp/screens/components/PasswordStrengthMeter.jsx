import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getPasswordStrength } from "../utils/validation";

export default function PasswordStrengthMeter({
  password,
  style,
  textColor = "#64748B",
  mutedColor = "#94A3B8",
  surfaceColor = "#F1F5F9",
  borderColor = "#E2E8F0",
}) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!password) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.headerRow}>
        <View style={styles.barRow}>
          {[1, 2, 3].map((level) => (
            <View
              key={level}
              style={[
                styles.barSegment,
                { backgroundColor: surfaceColor },
                strength.level >= level && { backgroundColor: strength.color },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.strengthLabel, { color: strength.color }]}>
          {strength.label}
        </Text>
      </View>

      <View style={styles.requirementGrid}>
        {strength.requirements.map((item) => (
          <View
            key={item.key}
            style={[
              styles.requirementPill,
              { backgroundColor: surfaceColor, borderColor },
              item.met && {
                backgroundColor: "#ECFDF3",
                borderColor: "#BBF7D0",
              },
            ]}
          >
            <Ionicons
              name={item.met ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={item.met ? "#16A34A" : mutedColor}
            />
            <Text
              style={[
                styles.requirementText,
                { color: item.met ? "#166534" : textColor },
              ]}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barRow: {
    flex: 1,
    flexDirection: "row",
    gap: 5,
  },
  barSegment: {
    flex: 1,
    height: 5,
    borderRadius: 999,
  },
  strengthLabel: {
    minWidth: 112,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "900",
  },
  requirementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9,
  },
  requirementPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  requirementText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: "800",
  },
});
