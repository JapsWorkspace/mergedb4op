import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserContext } from "../UserContext";
import { useTheme } from "../contexts/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl, PROD_BASE } from "../../lib/api";

const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=E5E7EB&color=6B7280&rounded=true&name=User";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(width * 0.84, 360);

const QUICK_ACTIONS = [
  {
    icon: "home-outline",
    label: "Home",
    route: "Map",
    params: { resetMap: true },
  },
  {
    icon: "shield-checkmark-outline",
    label: "Safety Marking",
    route: "Connection",
  },
  {
    icon: "warning-outline",
    label: "Incident Tagging",
    route: "Map",
    params: { module: "incident" },
  },
  {
    icon: "water-outline",
    label: "Hazard Map",
    route: "Map",
    params: { module: "flood" },
  },
];

const RESOURCE_ITEMS = [
  {
    icon: "heart-outline",
    label: "Donate",
    route: "DonationScreen",
  },
  {
    icon: "reader-outline",
    label: "Guidelines",
    route: "Guidelines",
  },
  {
    icon: "radio-outline",
    label: "Announcements",
    route: "Announcement",
  },
  {
  icon: "water-outline",
  label: "Digital Twin",
  route: "DigitalTwin",
  },
  {
    icon: "cube-outline",
    label: "Virtual Twin",
    route: "VirtualTwin",
  },
];

const ACCOUNT_ITEMS = [
  {
    icon: "person-circle-outline",
    label: "Account",
    route: "Profile",
  },
];

export default function AppDrawer({
  onRequestClose = () => {},
  onLogout = async () => {},
  onNavigate,
}) {
  const { user } = useContext(UserContext);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const themed = useMemo(() => createThemedDrawerStyles(theme), [theme]);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [assetBaseUrl, setAssetBaseUrl] = useState(PROD_BASE);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  useEffect(() => {
    let isMounted = true;

    getApiBaseUrl()
      .then((baseUrl) => {
        if (isMounted && baseUrl) setAssetBaseUrl(baseUrl);
      })
      .catch(() => {
        if (isMounted) setAssetBaseUrl(PROD_BASE);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const closeDrawer = (cb) => {
    Animated.timing(translateX, {
      toValue: -DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onRequestClose();
      if (typeof cb === "function") cb();
    });
  };

  const goTo = (route, params) => {
    closeDrawer(() => {
      onNavigate?.(route, params);
    });
  };

  const handleLogout = async () => {
    closeDrawer(async () => {
      await onLogout();
    });
  };

  const avatarUri = user?.avatar
    ? user.avatar.startsWith("http")
      ? user.avatar
      : `${assetBaseUrl}${user.avatar}`
    : DEFAULT_AVATAR;

  const displayName =
    `${user?.fname || ""} ${user?.lname || ""}`.trim() || "Resident";

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.drawer,
          themed.drawer,
          { paddingTop: Math.max(insets.top + 24, 60), transform: [{ translateX }] },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <View style={[styles.headerBadge, themed.softIcon]}>
              <Ionicons name="shield-half-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.headerEyebrow, themed.subtext]}>Disaster Response</Text>
              <Text style={[styles.headerTitle, themed.text]}>Main Menu</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, themed.closeBtn]}
            onPress={() => closeDrawer()}
            activeOpacity={0.82}
          >
            <Ionicons name="close" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.profileCard, themed.card]}
            activeOpacity={0.88}
            onPress={() => goTo("Profile")}
          >
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View style={styles.profileCopy}>
              <Text style={[styles.profileName, themed.text]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.profileSub, themed.subtext]} numberOfLines={2}>
                Open profile and account settings.
              </Text>
            </View>
            <View style={[styles.profileArrow, themed.softIcon]}>
              <Ionicons name="chevron-forward" size={18} color={theme.primary} />
            </View>
          </TouchableOpacity>

      

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, themed.text]}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.quickCard, themed.card]}
                  onPress={() => goTo(item.route, item.params)}
                  activeOpacity={0.86}
                >
                  <View style={[styles.quickIconWrap, themed.softIcon]}>
                    <Ionicons name={item.icon} size={21} color={theme.primary} />
                  </View>
                  <Text style={[styles.quickLabel, themed.text]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, themed.text]}>Resources</Text>
            <View style={[styles.listGroup, themed.card]}>
              {RESOURCE_ITEMS.map((item, index) => (
                <DrawerRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  isLast={index === RESOURCE_ITEMS.length - 1}
                  theme={theme}
                  onPress={() => goTo(item.route, item.params)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, themed.text]}>Account &amp; Settings</Text>
            <View style={[styles.listGroup, themed.card]}>
              {ACCOUNT_ITEMS.map((item, index) => (
                <DrawerRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  isLast={index === ACCOUNT_ITEMS.length - 1}
                  theme={theme}
                  onPress={() => goTo(item.route, item.params)}
                />
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.logoutRow}
            onPress={handleLogout}
            activeOpacity={0.86}
          >
            <View style={styles.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={20} color="#B91C1C" />
            </View>
            <View style={styles.logoutCopy}>
              <Text style={styles.logoutText}>Sign Out</Text>
              <Text style={styles.logoutSub}>End current session</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D18181" />
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        onPress={() => closeDrawer()}
        activeOpacity={1}
      />
    </View>
  );
}

function DrawerRow({ icon, label, onPress, isLast = false, theme }) {
  return (
    <TouchableOpacity
      style={[styles.rowItem, { borderBottomColor: theme.border }, isLast && styles.rowItemLast]}
      onPress={onPress}
      activeOpacity={0.84}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name={icon} size={20} color={theme.primary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 9999,
    elevation: 9999,
  },

  drawer: {
    width: DRAWER_WIDTH,
    backgroundColor: "#F6F7F2",
    paddingTop: 42,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 24,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.42)",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  headerBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#E6EFE4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#D6E3D2",
  },

  headerCopy: {
    flex: 1,
    minWidth: 0,
  },

  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#163A28",
  },

  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E8EBE8",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 18,
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#10251B",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: "#E6ECE6",
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },

  profileCopy: {
    flex: 1,
    minWidth: 0,
  },

  profileName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },

  profileSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
    fontWeight: "600",
  },

  profileArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ECF2E8",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F2E8",
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#DCE4D6",
    marginBottom: 18,
  },

  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1F4D36",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  heroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  heroTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#163A28",
  },

  heroSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#66756B",
    fontWeight: "600",
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#163A28",
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  quickCard: {
    width: "48.5%",
    minHeight: 104,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6ECE6",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    justifyContent: "space-between",
    shadowColor: "#10251B",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#EDF3E9",
    alignItems: "center",
    justifyContent: "center",
  },

  quickLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
  },

  listGroup: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6ECE6",
    overflow: "hidden",
  },

  rowItem: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2EE",
  },

  rowItemLast: {
    borderBottomWidth: 0,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EEF3EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },

  logoutRow: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#FFF4F4",
    borderWidth: 1,
    borderColor: "#F4D2D2",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },

  logoutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FDE6E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  logoutCopy: {
    flex: 1,
    minWidth: 0,
  },

  logoutText: {
    color: "#B91C1C",
    fontSize: 15,
    fontWeight: "900",
  },

  logoutSub: {
    marginTop: 2,
    color: "#D18181",
    fontSize: 11,
    fontWeight: "700",
  },
});

function createThemedDrawerStyles(theme) {
  return StyleSheet.create({
    drawer: {
      backgroundColor: theme.background,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    softIcon: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    closeBtn: {
      backgroundColor: theme.surfaceAlt,
    },
    text: {
      color: theme.text,
    },
    subtext: {
      color: theme.subtext,
    },
  });
}
