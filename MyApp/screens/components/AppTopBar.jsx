import React, { useMemo, useState } from "react";
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sanitizeSearchText, safeDisplayText } from "../utils/validation";
import { useTheme } from "../contexts/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppTopBar({
  onMenuPress,
  onNotificationPress,
  notificationCount = 0,
  onSearchChange,
  showSearch,
  suggestions = [],
  onSelectSuggestion,
}) {
  // âœ… local controlled input state
  const [value, setValue] = useState("");
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const themed = useMemo(() => createThemedStyles(theme), [theme]);

  const handleChangeText = (text) => {
    const cleanText = sanitizeSearchText(text);
    setValue(cleanText);
    onSearchChange?.(cleanText);
  };

  /**
   * âœ… IMPORTANT:
   * This function forwards the FULL suggestion object exactly as received.
   * This includes:
   * - latitude
   * - longitude
   * - label
   * - source
   * - raw (full MongoDB evacuation document, when available)
   *
   * DO NOT destructure or rebuild `item` here.
   */
  const handleSelect = (item) => {
    // âœ… clear UI immediately
    setValue("");
    Keyboard.dismiss();

    // âœ… forward FULL object to parent (navigation happens there)
    onSelectSuggestion?.(item);

    // âœ… clear suggestions
    onSearchChange?.("");
  };

  const topOffset = Math.max(insets.top + 12, Platform.OS === "ios" ? 58 : 40);

  return (
    <View style={[styles.wrapper, { top: topOffset }]}>
      <View style={styles.container}>
        <TouchableOpacity style={[styles.iconButton, themed.floatingSurface]} onPress={onMenuPress}>
          <Ionicons name="menu" size={24} color={theme.text} />
        </TouchableOpacity>

        {showSearch && (
          <View style={[styles.searchWrap, themed.floatingSurface]}>
            <Ionicons name="search-outline" size={17} color={theme.subtext} />
            <TextInput
              placeholder="Search evacuation place"
              style={[styles.search, { color: theme.text }]}
              value={value}
              onChangeText={handleChangeText}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              returnKeyType="search"
              placeholderTextColor={theme.subtext}
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.notificationButton, themed.floatingSurface]}
          activeOpacity={0.82}
          onPress={onNotificationPress}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.text} />
          {notificationCount > 0 && (
            <View style={styles.notificationDot}>
              <Text style={styles.notificationCount}>
                {notificationCount > 9 ? "9+" : notificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* âœ… Suggestions dropdown */}
      {showSearch && suggestions.length > 0 && (
        <View style={[styles.dropdown, themed.dropdown]}>
          <FlatList
            data={suggestions}
            keyExtractor={(item, index) =>
              item.id
                ? String(item.id)
                : `${item.source}-${item.latitude}-${item.longitude}-${index}`
            }
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.item}
                onPress={() => handleSelect(item)}
              >
                <Text numberOfLines={2} style={{ color: theme.text }}>
                  {safeDisplayText(item?.label, "Unnamed place")}
                </Text>

                {item.source === "evacuation" && (
                  <Text style={[styles.badge, { color: theme.primary }]}>EVAC PLACE</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 6000,
    elevation: 6000,
    pointerEvents: "box-none",
  },

  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    pointerEvents: "auto",
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    elevation: 7,
  },

  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    elevation: 7,
  },

  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#facc15",
    borderWidth: 1,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  notificationCount: {
    color: "#10251b",
    fontSize: 9,
    fontWeight: "900",
  },

  searchWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    elevation: 7,
  },

  search: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 8,
    fontSize: 14,
    color: "#10251b",
  },

  dropdown: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 16,
    maxHeight: 220,
    elevation: 8,
    pointerEvents: "auto",
    overflow: "hidden",
  },

  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  badge: {
    fontSize: 11,
    color: "#047857",
    fontWeight: "700",
    marginTop: 4,
  },
});

function createThemedStyles(theme) {
  return StyleSheet.create({
    floatingSurface: {
      backgroundColor: theme.elevated,
      borderColor: theme.border,
    },
    dropdown: {
      backgroundColor: theme.elevated,
      borderColor: theme.border,
      borderWidth: 1,
    },
  });
}
