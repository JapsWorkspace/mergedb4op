import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { UserContext } from "./UserContext";
import { MapContext } from "./contexts/MapContext";
import { NotificationContext } from "./contexts/NotificationContext";
import { ThemeContext } from "./contexts/ThemeContext";
import { useSearch } from "./SearchContext";

import AppTopBar from "./components/AppTopBar";
import AppDrawer from "./components/AppDrawer";
import LogoutModal from "./components/LogoutModal";
import { safeDisplayText } from "./utils/validation";
import { AppChromeContext } from "./contexts/AppChromeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAP_UI_SCREENS = new Set(["Map", "Connection"]);

export default function AppLayout({
  children,
  currentScreen = "Map",
  drawerOpen = false,
  onDrawerOpenChange,
}) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { theme } = useContext(ThemeContext);
  const themed = useMemo(
    () => ({
      root: { backgroundColor: theme.background },
      androidNavBackdrop: { backgroundColor: theme.background },
    }),
    [theme]
  );

  const { setUser } = useContext(UserContext);
  const {
    panelState,
    setPanelState,
    evac,
    setEvac,
    setPanelY,
    setActiveMapModule,
    setRouteRequested,
    setRoutes,
    setActiveRoute,
  } = useContext(MapContext);

  const { search, suggestions, clear } = useSearch();
  const {
    notifications,
    unreadCount,
    markAllRead,
    clearNotifications,
    resolveJoinRequest,
    refreshNotifications,
  } = useContext(NotificationContext);

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const isTopUiAllowedScreen = MAP_UI_SCREENS.has(currentScreen);

  const showSearchBar =
    isTopUiAllowedScreen &&
    panelState !== "NAVIGATION" &&
    isFocused &&
    !drawerOpen;

  const confirmLogout = async () => {
    setLogoutVisible(false);
    await setUser(null);
  };

  const setDrawerOpen = (open) => {
    onDrawerOpenChange?.(open);
  };

  const appChromeValue = useMemo(
    () => ({
      openDrawer: () => setDrawerOpen(true),
      openNotifications: () => {
        setNotificationsOpen((prev) => !prev);
        markAllRead();
      },
      unreadCount,
    }),
    [markAllRead, unreadCount]
  );

  const resetMapHome = () => {
    setActiveMapModule(null);
    setPanelState("HIDDEN");
    setPanelY(null);
    setEvac(null);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
  };

  return (
    <View style={[styles.root, themed.root]}>
      <AppChromeContext.Provider value={appChromeValue}>
        <View style={styles.content}>{children}</View>
      </AppChromeContext.Provider>

      {Platform.OS === "android" && (
        <View pointerEvents="none" style={[styles.androidNavBackdrop, themed.androidNavBackdrop]} />
      )}

      {showSearchBar && (
        <AppTopBar
          showSearch
          onSearchChange={search}
          suggestions={suggestions}
          onSelectSuggestion={(place) => {
            clear();
            navigation.navigate("AppShell", {
              screen: "Map",
              params: { place },
            });
          }}
          onMenuPress={() => setDrawerOpen(true)}
          onNotificationPress={() => {
            setNotificationsOpen((prev) => !prev);
            markAllRead();
          }}
          notificationCount={unreadCount}
        />
      )}

      {notificationsOpen && !drawerOpen && (
        <NotificationFeed
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onClear={clearNotifications}
          onResolveJoinRequest={resolveJoinRequest}
          onRefresh={refreshNotifications}
          theme={theme}
          topOffset={Math.max(insets.top + 72, 102)}
          onOpenNotification={(item) => {
            if (isGuidelineNotification(item)) {
              setNotificationsOpen(false);
              navigation.navigate("AppShell", {
                screen: "Guidelines",
                params: {
                  guidelineId: item?.guidelineId || null,
                  notificationId: item?.id || null,
                },
              });
              return true;
            }

            if (isAnnouncementNotification(item)) {
              setNotificationsOpen(false);
              navigation.navigate("AppShell", {
                screen: "Announcement",
                params: {
                  announcementId: item?.announcementId || null,
                  notificationId: item?.id || null,
                },
              });
              return true;
            }

            if (!isJoinRequestNotification(item)) return false;

            setNotificationsOpen(false);
            navigation.navigate("AppShell", {
              screen: "Connection",
              params: {
                initialTab: "manage",
                connectionId: item?.connectionId || null,
                openPendingRequests: true,
                notificationId: item?.id || null,
              },
            });
            return true;
          }}
        />
      )}

      {drawerOpen && (
        <AppDrawer
          onRequestClose={() => setDrawerOpen(false)}
          onLogout={() => {
            setDrawerOpen(false);
            setLogoutVisible(true);
          }}
          onNavigate={(routeName, params) => {
            setDrawerOpen(false);

            if (routeName === "Map" && params?.resetMap) {
              resetMapHome();
            } else if (!MAP_UI_SCREENS.has(routeName)) {
              setActiveMapModule(null);
            }

            navigation.navigate("AppShell", {
              screen: routeName,
              params,
            });
          }}
        />
      )}

      <LogoutModal
        visible={logoutVisible}
        onCancel={() => setLogoutVisible(false)}
        onConfirm={confirmLogout}
      />
    </View>
  );
}

function NotificationFeed({
  notifications,
  onClose,
  onClear,
  onResolveJoinRequest,
  onRefresh,
  theme,
  onOpenNotification,
  topOffset = 104,
}) {
  const [busyNotificationId, setBusyNotificationId] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  useEffect(() => {
    console.log(
      "[notifications] rendered ids",
      notifications.map((item) => item.id)
    );
  }, [notifications]);

  const handleResolve = async (notification, action) => {
    if (!notification?.id || busyNotificationId) return;

    try {
      setBusyNotificationId(notification.id);
      await onResolveJoinRequest?.({ notification, action });
      await onRefresh?.();
      setSelectedNotification(null);
    } catch (err) {
      console.log("[notifications] resolve failed:", err?.message);
    } finally {
      setBusyNotificationId(null);
    }
  };

  const handleNotificationPress = (item) => {
    setSelectedNotification(null);
    const handled = onOpenNotification?.(item);
    if (!handled) {
      setSelectedNotification(item);
    }
  };

  return (
    <View
      style={[
        styles.notificationPanel,
        { backgroundColor: theme.elevated, borderColor: theme.border, top: topOffset },
      ]}
    >
      <View style={styles.notificationHeader}>
        <View>
          <Text style={[styles.notificationTitle, { color: theme.text }]}>Notifications</Text>
          <Text style={[styles.notificationSubtitle, { color: theme.mutedText }]}>
            Connection and safety updates
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.notificationClose,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
          ]}
          onPress={onClose}
        >
          <Ionicons name="close" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.notificationList}>
        {notifications.length === 0 ? (
          <View style={styles.emptyNotification}>
            <Ionicons name="notifications-outline" size={24} color={theme.mutedText} />
            <Text style={[styles.emptyNotificationTitle, { color: theme.text }]}>
              No updates yet
            </Text>
            <Text style={[styles.emptyNotificationText, { color: theme.mutedText }]}>
              Connection joins, removals, and safe/not-safe updates will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((item) => {
            const showRequestActions = isJoinRequestNotification(item);

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => handleNotificationPress(item)}
              style={[
                styles.notificationItem,
                { borderTopColor: theme.border },
                showRequestActions && styles.notificationItemActionable,
                showRequestActions && {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={[styles.notificationIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name={safeNotificationIcon(item?.icon)} size={17} color={theme.primary} />
              </View>
              <View style={styles.notificationCopy}>
                <View style={styles.notificationTitleRow}>
                  <Text style={[styles.notificationItemTitle, { color: theme.text }]}>
                    {safeDisplayText(item?.title, "Notification")}
                  </Text>
                  {item.sourceLabel && (
                    <View
                      style={[
                        styles.notificationSourceChip,
                        item.official && styles.notificationSourceChipOfficial,
                      ]}
                    >
                      <Text
                        style={[
                          styles.notificationSourceText,
                          item.official && styles.notificationSourceTextOfficial,
                        ]}
                      >
                        {item.sourceLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.notificationMessage, { color: theme.mutedText }]}>
                  {safeDisplayText(item?.message, "There is a new safety update.")}
                </Text>
                {!!item.actorName && (
                  <Text style={[styles.notificationMeta, { color: theme.mutedText }]}>
                    {safeDisplayText(item.actorName, "Requester")}
                    {item.actorUsername ? ` â€¢ @${item.actorUsername}` : ""}
                    {item.connectionCode ? ` â€¢ ${item.connectionCode}` : ""}
                  </Text>
                )}
                <View style={styles.notificationFooter}>
                  <Text style={[styles.notificationTime, { color: theme.mutedText }]}>
                    {formatNotificationTime(item.createdAt)}
                  </Text>
                  <Text style={[styles.notificationOpenHint, { color: theme.primary }]}>
                    {showRequestActions
                      ? "Open in connection"
                      : isGuidelineNotification(item)
                        ? "Open guideline"
                        : "Tap to view"}
                  </Text>
                </View>
              </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {notifications.length > 0 && (
        <TouchableOpacity
          style={[
            styles.clearNotifications,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
          ]}
          onPress={onClear}
        >
          <Text style={[styles.clearNotificationsText, { color: theme.text }]}>Clear all</Text>
        </TouchableOpacity>
      )}

      <NotificationDetailModal
        notification={selectedNotification}
        visible={Boolean(selectedNotification)}
        busy={busyNotificationId === selectedNotification?.id}
        theme={theme}
        onClose={() => setSelectedNotification(null)}
        onResolve={handleResolve}
      />
    </View>
  );
}

function NotificationDetailModal({ notification, visible, busy, theme, onClose, onResolve }) {
  if (!visible || !notification) {
    return null;
  }

  const showRequestActions = isJoinRequestNotification(notification);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.notificationModalBackdrop, { backgroundColor: theme.overlay }]}>
        <View
          style={[
            styles.notificationModalCard,
            { backgroundColor: theme.modalBackground, borderColor: theme.border },
          ]}
        >
          <View style={styles.notificationModalHeader}>
            <View style={[styles.notificationModalIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons
                name={safeNotificationIcon(notification?.icon)}
                size={20}
                color={theme.primary}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.notificationModalClose,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.notificationModalTitle, { color: theme.text }]}>
            {safeDisplayText(notification?.title, "Notification")}
          </Text>
          <Text style={[styles.notificationModalMessage, { color: theme.mutedText }]}>
            {safeDisplayText(notification?.message, "There is a new safety update.")}
          </Text>

          {!!notification?.actorName && (
            <View
              style={[
                styles.notificationDetailBlock,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.notificationDetailLabel, { color: theme.mutedText }]}>
                Requester
              </Text>
              <Text style={[styles.notificationDetailValue, { color: theme.text }]}>
                {safeDisplayText(notification?.actorName, "Requester")}
              </Text>
              {!!notification?.actorUsername && (
                <Text style={[styles.notificationDetailSubvalue, { color: theme.mutedText }]}>
                  @{safeDisplayText(notification?.actorUsername, "unknown")}
                </Text>
              )}
            </View>
          )}

          {!!notification?.connectionCode && (
            <View
              style={[
                styles.notificationDetailBlock,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.notificationDetailLabel, { color: theme.mutedText }]}>
                Connection Code
              </Text>
              <Text style={[styles.notificationDetailValue, { color: theme.text }]}>
                {safeDisplayText(notification?.connectionCode, "Unavailable")}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.notificationDetailBlock,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.notificationDetailLabel, { color: theme.mutedText }]}>
              Received
            </Text>
            <Text style={[styles.notificationDetailValue, { color: theme.text }]}>
              {formatNotificationTime(notification?.createdAt)}
            </Text>
          </View>

          {showRequestActions ? (
            <View style={styles.notificationModalActions}>
              <TouchableOpacity
                style={[styles.notificationAccept, busy && styles.notificationActionDisabled]}
                onPress={() => onResolve?.(notification, "accept")}
                disabled={busy}
              >
                <Text style={styles.notificationAcceptText}>
                  {busy ? "Working..." : "Accept"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.notificationReject, busy && styles.notificationActionDisabled]}
                onPress={() => onResolve?.(notification, "reject")}
                disabled={busy}
              >
                <Text style={styles.notificationRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.notificationModalDone,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.notificationModalDoneText, { color: theme.text }]}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function safeNotificationIcon(iconName) {
  return typeof iconName === "string" && iconName.trim()
    ? iconName
    : "notifications-outline";
}

function isJoinRequestNotification(item) {
  return (
    Boolean(item?.actionable) ||
    (String(item?.type || "").toLowerCase() === "connection_request" &&
      Boolean(item?.connectionId) &&
      Boolean(item?.actorUserId) &&
      !item?.handledAt)
  );
}

function isGuidelineNotification(item) {
  const type = String(item?.type || "").toLowerCase();
  return ["guideline", "drrmo_guideline"].includes(type) && Boolean(item?.guidelineId);
}

function isAnnouncementNotification(item) {
  const type = String(item?.type || "").toLowerCase();
  return ["announcement", "mdrrmo_announcement", "drrmo_announcement"].includes(type) &&
    Boolean(item?.announcementId);
}

function formatNotificationTime(date) {
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return "Recently";
  const diff = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EEF3EF",
  },

  content: {
    flex: 1,
    position: "relative",
  },

  androidNavBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    backgroundColor: "#E6EEE7",
  },

  topOverlay: {
    position: "absolute",
    top: 68,
    left: 16,
    right: 16,
    zIndex: 6000,
    elevation: 6000,
  },

  legend: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 4,
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "40%",
  },

  legendText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },

  connector: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 8,
  },

  line: {
    height: 2,
    width: "100%",
    backgroundColor: "#e5e7eb",
    borderRadius: 1,
  },

  dotBlue: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },

  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
  },

  notificationPanel: {
    position: "absolute",
    top: 104,
    left: 16,
    right: 16,
    maxHeight: 330,
    zIndex: 6500,
    elevation: 6500,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#E1EAE4",
    padding: 14,
    shadowColor: "#0F2319",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  notificationTitle: {
    color: "#10251B",
    fontSize: 16,
    fontWeight: "900",
  },

  notificationSubtitle: {
    marginTop: 2,
    color: "#647067",
    fontSize: 11,
    fontWeight: "700",
  },

  notificationClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationList: {
    maxHeight: 230,
  },

  notificationItem: {
    flexDirection: "row",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2EF",
  },

  notificationItemActionable: {
    backgroundColor: "#F8FBF7",
    borderRadius: 16,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  notificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  notificationCopy: {
    flex: 1,
  },

  notificationItemTitle: {
    flex: 1,
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
  },

  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  notificationSourceChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  notificationSourceChipOfficial: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },

  notificationSourceText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
  },

  notificationSourceTextOfficial: {
    color: "#92400E",
  },

  notificationMessage: {
    marginTop: 3,
    color: "#526158",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },

  notificationTime: {
    marginTop: 4,
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
  },

  notificationMeta: {
    marginTop: 6,
    color: "#516353",
    fontSize: 11,
    fontWeight: "700",
  },

  notificationFooter: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  notificationActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  notificationAccept: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: "#EDF8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationAcceptText: {
    color: "#1D6B41",
    fontSize: 12,
    fontWeight: "900",
  },

  notificationReject: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationRejectText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "900",
  },

  notificationActionDisabled: {
    opacity: 0.6,
  },

  notificationOpenHint: {
    color: "#1D6B41",
    fontSize: 10,
    fontWeight: "900",
  },

  notificationModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 35, 25, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  notificationModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  notificationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  notificationModalIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationModalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationModalTitle: {
    color: "#10251B",
    fontSize: 18,
    fontWeight: "900",
  },

  notificationModalMessage: {
    marginTop: 8,
    color: "#526158",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  notificationDetailBlock: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  notificationDetailLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  notificationDetailValue: {
    marginTop: 4,
    color: "#10251B",
    fontSize: 14,
    fontWeight: "800",
  },

  notificationDetailSubvalue: {
    marginTop: 2,
    color: "#516353",
    fontSize: 12,
    fontWeight: "700",
  },

  notificationModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  notificationModalDone: {
    marginTop: 18,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationModalDoneText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900",
  },

  emptyNotification: {
    alignItems: "center",
    paddingVertical: 24,
  },

  emptyNotificationTitle: {
    marginTop: 8,
    color: "#10251B",
    fontWeight: "900",
  },

  emptyNotificationText: {
    marginTop: 4,
    color: "#647067",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },

  clearNotifications: {
    marginTop: 10,
    minHeight: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  clearNotificationsText: {
    color: "#334155",
    fontWeight: "900",
  },
});
