// screens/Profile.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { UserContext } from "./UserContext";
import { useTheme } from "./contexts/ThemeContext";
import { useAppChrome } from "./contexts/AppChromeContext";
import api, { getApiBaseUrl } from "../lib/api";
import { safeDisplayText } from "./utils/validation";

const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=E5E7EB&color=6B7280&rounded=true&name=User";

export default function Profile({ navigation }) {
  const { user, setUser } = useContext(UserContext);
  const { theme } = useTheme();
  const { openDrawer, openNotifications, unreadCount } = useAppChrome();
  const themed = useMemo(() => createProfileThemeStyles(theme), [theme]);
  const [avatarUri, setAvatarUri] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user?.avatar) {
      setAvatarUri(user.avatar || null);
    }
  }, [user?.avatar]);

  const changeAvatar = async () => {
    if (!user?._id || uploading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow photo access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled || !Array.isArray(result.assets) || !result.assets[0]?.uri) {
      return;
    }

    const picked = result.assets[0];
    const mimeType = picked.mimeType || "image/jpeg";

    if (!mimeType.startsWith("image/")) {
      Alert.alert("Invalid File", "Please choose an image file.");
      return;
    }

    setAvatarUri(picked.uri);

    try {
      setUploading(true);

      const API_BASE_URL = await getApiBaseUrl();

      const uploadResult = await FileSystem.uploadAsync(
        `${API_BASE_URL}/user/avatar/${user._id}`,
        picked.uri,
        {
          httpMethod: "PUT",
          uploadType: 1,
          fieldName: "avatar",
          mimeType,
          parameters: {},
        }
      );

      let responseData = {};

      try {
        responseData = uploadResult.body ? JSON.parse(uploadResult.body) : {};
      } catch (_) {
        responseData = { message: uploadResult.body };
      }

      console.log("Avatar upload response:", {
        status: uploadResult.status,
        body: responseData,
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(responseData?.message || "Avatar upload failed.");
      }

      const updatedUser = responseData?.user || {
        ...user,
        avatar: responseData?.avatar || picked.uri,
      };

      setUser(updatedUser);
      setAvatarUri(updatedUser.avatar || picked.uri);

      Alert.alert("Profile updated", "Your profile picture has been updated.");
    } catch (err) {
      console.log("Avatar upload failed:", {
        message: err?.message,
        data: err?.response?.data,
        status: err?.response?.status,
      });

      Alert.alert("Upload failed", err?.message || "Please try again.");
      setAvatarUri(user.avatar || null);
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  const isSafe = user.safetyStatus === "SAFE";
  const statusLabel = isSafe ? "Safe" : "Needs check-in";
  const fullName = `${safeDisplayText(user.fname, "User")} ${safeDisplayText(user.lname, "")}`.trim();
  const username = safeDisplayText(user.username, "resident");
  const phone = safeDisplayText(user.phone, "Not set");
  const email = safeDisplayText(user.email, "Not set");
  return (
    <ScrollView
      style={[styles.container, themed.screen]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#86EFAC", "#16A34A", "#065F46"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dashboardHeader}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerIconButton} onPress={openDrawer}>
            <Ionicons name="menu" size={23} color={theme.buttonText} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity style={styles.headerIconButton} onPress={openNotifications}>
            <Ionicons name="notifications-outline" size={22} color={theme.buttonText} />
            {unreadCount > 0 ? (
              <View style={[styles.notificationBadge, { backgroundColor: theme.danger }]}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={[styles.profileCard, themed.card]}>
        <TouchableOpacity
          onPress={changeAvatar}
          disabled={uploading}
          style={[styles.avatarWrap, { backgroundColor: theme.card, borderColor: theme.card }]}
          activeOpacity={0.86}
        >
          <Image source={{ uri: avatarUri || DEFAULT_AVATAR }} style={styles.avatar} />
          {uploading && (
            <View style={styles.overlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: theme.primary, borderColor: theme.card }]}>
            <Ionicons name="camera" size={17} color={theme.buttonText} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.profileName, themed.text]} numberOfLines={1}>{fullName}</Text>
        <Text style={[styles.profileMeta, themed.subtext]} numberOfLines={1}>@{username}</Text>
        <Text style={[styles.profileEmail, themed.subtext]} numberOfLines={1}>{email}</Text>
      </View>

      <View style={styles.tileGrid}>
        <GridTile
          theme={theme}
          icon="person-outline"
          title="Account Details"
          subtitle="Profile info"
          onPress={() => navigation.navigate("PersonalDetails")}
        />
        <GridTile
          theme={theme}
          icon="lock-closed-outline"
          title="Password & Security"
          subtitle="Sign-in safety"
          onPress={() => navigation.navigate("PasswordSecurity")}
        />
        <GridTile
          theme={theme}
          icon="shield-checkmark-outline"
          title="Safety Status"
          subtitle={statusLabel}
          statusColor={isSafe ? theme.primary : theme.danger}
        />
        <GridTile
          theme={theme}
          icon="settings-outline"
          title="Settings"
          subtitle="App preferences"
          onPress={() => navigation.navigate("Settings")}
        />
        <GridTile
          theme={theme}
          icon="trash-outline"
          title="Delete Account"
          subtitle="Permanent action"
          danger
          onPress={() =>
            Alert.alert("Delete Account", "Are you sure you want to delete your account?", [
              { text: "Cancel" },
              { text: "Delete", style: "destructive" },
            ])
          }
        />
      </View>
    </ScrollView>
  );
}

function GridTile({ icon, title, subtitle, onPress, theme, danger = false, statusColor }) {
  const iconColor = danger ? theme.danger : statusColor || theme.primary;
  const iconBackground =
    danger || statusColor === theme.danger ? "#FDECEC" : theme.primarySoft;
  const titleColor = danger ? theme.danger : theme.text;

  const content = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: iconBackground }] }>
        <Ionicons name={icon} size={28} color={iconColor} />
      </View>
      <Text style={[styles.tileTitle, { color: titleColor }]} numberOfLines={2}>{title}</Text>
      <Text style={[styles.tileSubtitle, { color: statusColor || theme.subtext }]} numberOfLines={1}>{subtitle}</Text>
    </>
  );

  if (!onPress) {
    return <View style={[styles.tileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>{content}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.tileCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 34,
    paddingBottom: 46,
  },
  dashboardHeader: {
    height: 162,
    marginHorizontal: -12,
    paddingTop: 40,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textShadowColor: "rgba(6, 78, 59, 0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  profileCard: {
    alignItems: "center",
    marginTop: -30,
    marginBottom: 22,
    minHeight: 204,
    borderRadius: 8,
    borderWidth: 1,
    paddingTop: 30,
    paddingHorizontal: 18,
    paddingBottom: 18,
    shadowColor: "#10251B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  avatarWrap: {
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 3,
    marginBottom: 11,
    shadowColor: "#10251B",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 53,
    backgroundColor: "#E5E7EB",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 53,
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: 5,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
  },
  profileMeta: {
    alignSelf: "stretch",
    marginTop: 3,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
  profileEmail: {
    alignSelf: "stretch",
    marginTop: 2,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  tileCard: {
    width: "48%",
    minHeight: 128,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 14,
    shadowColor: "#10251B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  tileIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },
  tileTitle: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  tileSubtitle: {
    alignSelf: "stretch",
    marginTop: 4,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
  },
});
function createProfileThemeStyles(theme) {
  return StyleSheet.create({
    screen: {
      backgroundColor: theme.background,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    softIcon: {
      backgroundColor: theme.primarySoft,
    },
    text: {
      color: theme.text,
    },
    subtext: {
      color: theme.subtext,
    },
  });
}
