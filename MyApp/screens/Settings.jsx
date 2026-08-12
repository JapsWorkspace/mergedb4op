import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeContext } from "./contexts/ThemeContext";
import { UserContext } from "./UserContext";
import { updateShareSafetyLocation } from "../lib/api";
import {
  getNotificationSoundSettings,
  updateNotificationSoundSettings,
} from "../utils/notificationSounds";

const THEME_OPTIONS = [
  { label: "Light", value: "light", icon: "sunny-outline" },
  { label: "Dark", value: "dark", icon: "moon-outline" },
  { label: "System", value: "system", icon: "phone-portrait-outline" },
];

export default function Settings({ navigation }) {
  const { theme, mode, resolvedMode, setMode } = useContext(ThemeContext);
  const { user, setUser } = useContext(UserContext);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyConfirmVisible, setPrivacyConfirmVisible] = useState(false);
  const [privacyConsentSeen, setPrivacyConsentSeen] = useState(false);
  const [soundSettings, setSoundSettings] = useState({
    normalNotificationSound: true,
    dangerNotificationSound: true,
    smsNotificationSound: true,
  });

  const shareSafetyLocation = user?.shareSafetyLocation === true;
  const privacyConsentKey = user?._id
    ? `shareSafetyLocationConsent:${user._id}`
    : null;

  useEffect(() => {
    let active = true;

    const loadSoundSettings = async () => {
      try {
        const settings = await getNotificationSoundSettings();
        if (active) setSoundSettings(settings);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSoundSettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPrivacyConsent = async () => {
      if (!privacyConsentKey) {
        setPrivacyConsentSeen(false);
        return;
      }

      const stored = await AsyncStorage.getItem(privacyConsentKey);
      if (active) setPrivacyConsentSeen(stored === "true");
    };

    loadPrivacyConsent();

    return () => {
      active = false;
    };
  }, [privacyConsentKey]);

  const setSoundSetting = async (key, value) => {
    const nextSettings = {
      ...soundSettings,
      [key]: value,
    };

    setSoundSettings(nextSettings);

    try {
      const savedSettings = await updateNotificationSoundSettings({
        [key]: value,
      });
      setSoundSettings(savedSettings);
    } catch (err) {
      console.log("[settings] sound setting save failed:", err?.message);
      setSoundSettings(soundSettings);
    }
  };

  const saveShareSafetyLocation = async (value) => {
    if (!user?._id || privacySaving) return;

    setPrivacySaving(true);

    try {
      const res = await updateShareSafetyLocation(user._id, value);
      await setUser(res?.data?.user || { ...user, shareSafetyLocation: value });

      if (value && privacyConsentKey) {
        await AsyncStorage.setItem(privacyConsentKey, "true");
        setPrivacyConsentSeen(true);
      }
    } catch (err) {
      Alert.alert(
        "Privacy Setting",
        err?.response?.data?.message ||
          "Failed to update Safety Marking location sharing."
      );
    } finally {
      setPrivacySaving(false);
    }
  };

  const handleShareSafetyLocationChange = (value) => {
    if (value && !privacyConsentSeen) {
      setPrivacyConfirmVisible(true);
      return;
    }

    saveShareSafetyLocation(value);
  };

  const handleAllowSharing = () => {
    setPrivacyConfirmVisible(false);
    saveShareSafetyLocation(true);
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={21} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SAFETY</Text>
          <View style={styles.groupCard}>
            <SettingSwitchRow
              theme={theme}
              styles={styles}
              icon="location-outline"
              title="Share Safety Marking location"
              helper="Show your safety status on the Safety Marking map."
              value={shareSafetyLocation}
              disabled={privacySaving || !user?._id}
              onValueChange={handleShareSafetyLocationChange}
              isLast
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.groupCard}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : (
              <>
                <SettingSwitchRow
                  theme={theme}
                  styles={styles}
                  icon="notifications-outline"
                  title="Normal notification sound"
                  helper="Guidelines, announcements, and safety updates"
                  value={soundSettings.normalNotificationSound}
                  onValueChange={(value) =>
                    setSoundSetting("normalNotificationSound", value)
                  }
                />

                <SettingSwitchRow
                  theme={theme}
                  styles={styles}
                  icon="chatbubble-ellipses-outline"
                  title="SMS alert sound"
                  helper="Alerts also delivered by text message"
                  value={soundSettings.smsNotificationSound}
                  onValueChange={(value) =>
                    setSoundSetting("smsNotificationSound", value)
                  }
                />

                <SettingSwitchRow
                  theme={theme}
                  styles={styles}
                  icon="warning-outline"
                  title="Danger alert sound"
                  helper="Nearby incidents, hazards, and emergency alerts"
                  value={soundSettings.dangerNotificationSound}
                  onValueChange={(value) =>
                    setSoundSetting("dangerNotificationSound", value)
                  }
                  isLast
                />
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.groupCard}>
            <View style={styles.appearanceBlock}>
              <View style={styles.themeOptions}>
                {THEME_OPTIONS.map((option) => {
                  const active = mode === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.themeOption, active && styles.themeOptionActive]}
                      onPress={() => setMode(option.value)}
                      activeOpacity={0.86}
                    >
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={active ? theme.buttonText : theme.primary}
                      />
                      <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.helperText}>
                Current display: {resolvedMode === "dark" ? "Dark" : "Light"}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={privacyConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivacyConfirmVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="location-outline" size={24} color={theme.primary} />
            </View>
            <Text style={styles.modalTitle}>Share Safety Location?</Text>
            <Text style={styles.modalMessage}>
              Your profile marker and safety status may be visible to other users inside the Safety Marking map. You can turn this off anytime in Settings.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setPrivacyConfirmVisible(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAllowSharing}
              >
                <Text style={styles.modalButtonPrimaryText}>Allow Sharing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SettingSwitchRow({
  theme,
  styles,
  icon,
  title,
  helper,
  value,
  onValueChange,
  disabled = false,
  isLast = false,
}) {
  return (
    <View style={[styles.settingRow, isLast && styles.settingRowLast]}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingHelper}>{helper}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.primarySoft }}
        thumbColor={value ? theme.primary : theme.muted}
      />
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingTop: 34,
      paddingHorizontal: 16,
      paddingBottom: 48,
    },
    header: {
      height: 42,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    headerBack: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      color: theme.text,
      fontSize: 17,
      fontWeight: "900",
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    section: {
      marginTop: 14,
    },
    sectionLabel: {
      marginBottom: 7,
      color: theme.subtext,
      fontSize: 10,
      fontWeight: "900",
    },
    groupCard: {
      overflow: "hidden",
      backgroundColor: theme.card,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#10251B",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: theme.mode === "dark" ? 0 : 0.035,
      shadowRadius: 12,
      elevation: theme.mode === "dark" ? 0 : 1,
    },
    loadingRow: {
      minHeight: 70,
      alignItems: "center",
      justifyContent: "center",
    },
    settingRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    settingRowLast: {
      borderBottomWidth: 0,
    },
    settingIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: theme.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
    },
    settingCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 10,
    },
    settingTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "800",
    },
    settingHelper: {
      marginTop: 3,
      color: theme.subtext,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "600",
    },
    appearanceBlock: {
      padding: 13,
    },
    themeOptions: {
      flexDirection: "row",
      gap: 8,
    },
    themeOption: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 8,
    },
    themeOptionActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    themeOptionText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    themeOptionTextActive: {
      color: theme.buttonText,
    },
    helperText: {
      marginTop: 11,
      color: theme.subtext,
      fontSize: 12,
      fontWeight: "700",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 18,
      backgroundColor: theme.modalBackground,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
    },
    modalIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: theme.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 8,
    },
    modalMessage: {
      color: theme.subtext,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "600",
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    modalButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    modalButtonSecondary: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalButtonPrimary: {
      backgroundColor: theme.primary,
    },
    modalButtonSecondaryText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "900",
    },
    modalButtonPrimaryText: {
      color: theme.buttonText,
      fontSize: 13,
      fontWeight: "900",
    },
  });
}