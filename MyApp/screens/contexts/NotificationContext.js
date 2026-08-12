import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import api from "../../lib/api";
import {
  playDangerNotificationSound,
  playNormalNotificationSound,
  playSmsNotificationSound,
  setupNotificationChannels,
  unloadNotificationSounds,
} from "../../utils/notificationSounds";
import { UserContext } from "../UserContext";

const MESSAGE_META = {
  connection_request: {
    title: "Join request",
    icon: "person-add-outline",
  },
  connection_request_sent: {
    title: "Request sent",
    icon: "paper-plane-outline",
  },
  connection_approved: {
    title: "Connection approved",
    icon: "checkmark-circle-outline",
  },
  connection_rejected: {
    title: "Request rejected",
    icon: "close-circle-outline",
  },
  connection_joined: {
    title: "Connection joined",
    icon: "person-add-outline",
  },
  connection_kicked: {
    title: "Connection removed",
    icon: "person-remove-outline",
  },
  connection_left: {
    title: "Member left",
    icon: "exit-outline",
  },
  safety_safe: {
    title: "Marked safe",
    icon: "shield-checkmark-outline",
  },
  safety_not_safe: {
    title: "Needs help",
    icon: "alert-circle-outline",
  },
  nearby_incident: {
    title: "Nearby incident",
    icon: "warning-outline",
    sourceLabel: "Incident Alert",
    official: true,
  },
  nearby_repeated_incident: {
    title: "Nearby incident warning",
    icon: "alert-circle-outline",
    sourceLabel: "Incident Alert",
    official: true,
  },
  barangay_incident_danger: {
    title: "Barangay danger warning",
    icon: "warning-outline",
    sourceLabel: "Incident Alert",
    official: true,
  },
  incident_approved: {
    title: "Incident Report Verified",
    icon: "checkmark-circle-outline",
    sourceLabel: "Incident Alert",
    official: true,
  },
  guideline: {
    title: "New guideline posted by MDRRMO",
    icon: "megaphone-outline",
    sourceLabel: "MDRRMO",
    official: true,
  },
  drrmo_guideline: {
    title: "DRRMO guideline uploaded",
    icon: "megaphone-outline",
    sourceLabel: "DRRMO",
    official: true,
  },
  announcement: {
    title: "New MDRRMO announcement",
    icon: "radio-outline",
    sourceLabel: "MDRRMO",
    official: true,
  },
  mdrrmo_announcement: {
    title: "New MDRRMO announcement",
    icon: "radio-outline",
    sourceLabel: "MDRRMO",
    official: true,
  },
  drrmo_announcement: {
    title: "New DRRMO announcement",
    icon: "radio-outline",
    sourceLabel: "DRRMO",
    official: true,
  },
  system: {
    title: "System update",
    icon: "notifications-outline",
  },
};

Notifications.setNotificationHandler?.({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAllRead: () => {},
  clearNotifications: () => {},
  refreshNotifications: () => {},
  resolveJoinRequest: () => {},
  notificationsVersion: 0,
});

function normalizeType(type) {
  return String(type || "system").toLowerCase().trim();
}

function getNotificationSoundType(item) {
  const explicit = String(item?.soundType || "").toLowerCase();
  if (explicit === "sms") return "sms";
  if (explicit === "danger") return "danger";
  if (explicit === "notification" || explicit === "normal") return "notification";

  const notificationType = String(item?.notificationType || "").toLowerCase();
  if (notificationType === "danger") return "danger";

  const type = normalizeType(item?.type);
  if (
    [
      "nearby_incident",
      "nearby_repeated_incident",
      "barangay_incident_danger",
      "route_hazard",
      "hazard_ahead",
    ].includes(type)
  ) {
    return "danger";
  }

  const priority = String(item?.priority || "").toLowerCase();
  const alertLevel = String(item?.metadata?.alertLevel || "").toLowerCase();
  if (["high", "critical", "emergency"].includes(priority) || ["high", "critical"].includes(alertLevel)) {
    return "danger";
  }

  return "notification";
}

function playNotificationSoundFor(item) {
  const soundType = getNotificationSoundType(item);
  const isDanger = soundType === "danger";
  const isSms = soundType === "sms";

  if (isDanger || isSms) {
    const isCritical =
      String(item?.priority || "").toLowerCase() === "critical" ||
      String(item?.metadata?.alertLevel || "").toLowerCase() === "critical";
    Vibration.vibrate(
      isCritical ? [0, 800, 250, 800] : isSms ? [0, 180, 120, 260] : [0, 500]
    );
  }

  if (isSms) return playSmsNotificationSound();
  return isDanger ? playDangerNotificationSound() : playNormalNotificationSound();
}

function getExpoProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    Constants?.manifest2?.extra?.eas?.projectId ||
    ""
  );
}

async function logPushRegistrationDebug(userId, payload = {}) {
  if (!userId) return;

  try {
    await api.post(`/user/${userId}/notification-token/debug`, {
      platform: Platform.OS,
      ...payload,
    });
  } catch (err) {
    console.log("[push-token-debug] send failed:", err?.message);
  }
}

async function registerExpoPushToken(userId) {
  if (!userId || Platform.OS === "web") return null;

  await logPushRegistrationDebug(userId, { stage: "start" });

  const currentPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermissions.status;

  await logPushRegistrationDebug(userId, {
    stage: "permission-current",
    status: finalStatus,
  });

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;

    await logPushRegistrationDebug(userId, {
      stage: "permission-requested",
      status: finalStatus,
    });
  }

  if (finalStatus !== "granted") {
    console.log("[push-token] permission not granted");
    return null;
  }

  if (Platform.OS === "android") {
    await setupNotificationChannels();
  }

  const projectId = getExpoProjectId();
  await logPushRegistrationDebug(userId, {
    stage: "project-id",
    projectId,
  });

  let tokenResponse = null;
  try {
    tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
  } catch (err) {
    await logPushRegistrationDebug(userId, {
      stage: "token-error",
      projectId,
      message: err?.message || String(err),
    });
    throw err;
  }
  const token = tokenResponse?.data;

  if (!token) {
    await logPushRegistrationDebug(userId, {
      stage: "token-empty",
      projectId,
    });
    console.log("[push-token] no Expo token returned");
    return null;
  }

  await logPushRegistrationDebug(userId, {
    stage: "token-created",
    projectId,
    status: "ok",
  });

  await api.post(`/user/${userId}/notification-token`, {
    token,
    platform: Platform.OS,
    deviceId: `${Platform.OS}:${token.slice(-16)}`,
  });

  console.log("[push-token] registered with backend");
  return token;
}

function shouldShowFullScreenAlert(item) {
  const priority = String(item?.priority || "").toLowerCase();
  const alertLevel = String(item?.metadata?.alertLevel || "").toLowerCase();
  return priority === "critical" || alertLevel === "critical";
}

function getNotificationListSignature(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => [
      item?.id || item?._id || "",
      item?.read ? "1" : "0",
      item?.handledAt || "",
      item?.createdAt || "",
    ].join(":"))
    .join("|");
}

function getNotificationDedupeKey(item) {
  const explicitId = item?._id || item?.id;
  if (explicitId) return `id:${String(explicitId)}`;
  if (item?.dedupeKey) return `dedupe:${String(item.dedupeKey)}`;
  if (item?.type && (item?.referenceId || item?.incidentId)) {
    return `${item.type}:${String(item.referenceId || item.incidentId)}`;
  }

  return `${item?.type || "system"}:${item?.createdAt || ""}:${item?.message || ""}`;
}

function normalizeServerNotification(item) {
  const type = normalizeType(item?.type);
  const meta = MESSAGE_META[type] || MESSAGE_META.system;
  const connectionId = item?.connectionId || null;
  const actorUserId = item?.actorUserId || null;
  const handledAt = item?.handledAt || null;
  const inferredActionable =
    type === "connection_request" &&
    Boolean(connectionId) &&
    Boolean(actorUserId) &&
    !handledAt;

  return {
    id: String(item?._id || item?.id || `${type}-${item?.createdAt || Date.now()}`),
    type,
    title: item?.title || meta.title,
    message: item?.message || "There is a new safety update.",
    icon: item?.icon || meta.icon,
    sourceLabel: item?.sourceLabel || meta.sourceLabel || null,
    source: item?.source || null,
    module: item?.module || null,
    official: Boolean(item?.official ?? meta.official),
    notificationType: item?.notificationType || null,
    priority: item?.priority || "normal",
    soundType: getNotificationSoundType(item),
    incidentId: item?.incidentId || null,
    referenceId: item?.referenceId || item?.incidentId || null,
    referenceModel: item?.referenceModel || null,
    recipientUser: item?.recipientUser || null,
    recipientUserModel: item?.recipientUserModel || null,
    dedupeKey: item?.dedupeKey || "",
    metadata: item?.metadata || {},
    read: Boolean(item?.read || item?.isRead),
    createdAt: item?.createdAt || new Date().toISOString(),
    connectionId,
    actorUserId,
    actorName: item?.actorName || "",
    actorUsername: item?.actorUsername || "",
    actorAvatar: item?.actorAvatar || "",
    connectionCode: item?.connectionCode || "",
    guidelineId: item?.guidelineId || null,
    announcementId: item?.announcementId || null,
    actionable: (Boolean(item?.actionable) || inferredActionable) && !handledAt,
    handledAt,
  };
}

export function NotificationProvider({ children }) {
  const { user } = useContext(UserContext) || {};
  const [serverNotifications, setServerNotifications] = useState([]);
  const [localNotifications, setLocalNotifications] = useState([]);
  const [activeCriticalAlert, setActiveCriticalAlert] = useState(null);
  const [notificationsVersion, setNotificationsVersion] = useState(0);
  const seenServerNotificationIdsRef = useRef(new Set());
  const initialFetchCompleteRef = useRef(false);
  const registeredPushUserRef = useRef("");
  const refreshInFlightRef = useRef(null);
  const serverNotificationsSignatureRef = useRef("");

  const addNotification = useCallback((event) => {
    const type = normalizeType(event?.type);
    const meta = MESSAGE_META[type] || MESSAGE_META.system;
    const serverId = event?._id || event?.id || null;

    const notification = {
      id: serverId
        ? String(serverId)
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title: event?.title || meta.title,
      message: event?.message || "There is a new safety update.",
      icon: event?.icon || meta.icon,
      sourceLabel: event?.sourceLabel || meta.sourceLabel || null,
      source: event?.source || null,
      module: event?.module || null,
      official: Boolean(event?.official ?? meta.official),
      notificationType: event?.notificationType || null,
      priority: event?.priority || "normal",
      soundType: getNotificationSoundType(event),
      incidentId: event?.incidentId || null,
      referenceId: event?.referenceId || event?.incidentId || null,
      referenceModel: event?.referenceModel || null,
      recipientUser: event?.recipientUser || null,
      recipientUserModel: event?.recipientUserModel || null,
      dedupeKey: event?.dedupeKey || "",
      metadata: event?.metadata || {},
      read: false,
      createdAt: event?.createdAt || new Date().toISOString(),
      connectionId: event?.connectionId || null,
      actorUserId: event?.actorUserId || null,
      actorName: event?.actorName || "",
      actorUsername: event?.actorUsername || "",
      actorAvatar: event?.actorAvatar || "",
      connectionCode: event?.connectionCode || "",
      guidelineId: event?.guidelineId || null,
      announcementId: event?.announcementId || null,
      actionable: Boolean(event?.actionable),
      handledAt: event?.handledAt || null,
    };

    if (serverId) {
      seenServerNotificationIdsRef.current.add(String(serverId));
    }

    const key = getNotificationDedupeKey(notification);
    setLocalNotifications((prev) =>
      [notification, ...prev.filter((item) => getNotificationDedupeKey(item) !== key)].slice(0, 30)
    );
    playNotificationSoundFor(notification);

    if (
      shouldShowFullScreenAlert(notification) &&
      AppState.currentState === "active"
    ) {
      setActiveCriticalAlert(notification);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!user?._id) {
      setServerNotifications([]);
      serverNotificationsSignatureRef.current = "";
      return [];
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const request = api
      .get(`/user/${user._id}/notifications`)
      .then((res) => {
        const items = Array.isArray(res.data)
          ? res.data.map(normalizeServerNotification)
          : [];
        const previousIds = seenServerNotificationIdsRef.current;
        const nextIds = new Set(items.map((item) => item.id));
        const newUnreadItems = items.filter(
          (item) => !item.read && !previousIds.has(item.id)
        );
        const nextSignature = getNotificationListSignature(items);

        if (serverNotificationsSignatureRef.current !== nextSignature) {
          serverNotificationsSignatureRef.current = nextSignature;
          setServerNotifications(items);
          setNotificationsVersion((prev) => prev + 1);
        }

        seenServerNotificationIdsRef.current = nextIds;

        if (initialFetchCompleteRef.current) {
          newUnreadItems
            .slice()
            .reverse()
            .forEach((item) => playNotificationSoundFor(item));

          const criticalAlert = newUnreadItems.find(
            (item) => shouldShowFullScreenAlert(item) && AppState.currentState === "active"
          );
          if (criticalAlert) {
            setActiveCriticalAlert(criticalAlert);
          }
        } else {
          initialFetchCompleteRef.current = true;
        }

        return items;
      })
      .catch((err) => {
        console.log("[notifications] fetch failed:", err?.message);
        return [];
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    refreshInFlightRef.current = request;
    return request;
  }, [user?._id]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!user?._id || registeredPushUserRef.current === String(user._id)) return;

    let cancelled = false;
    registeredPushUserRef.current = String(user._id);

    registerExpoPushToken(user._id).catch((err) => {
      if (cancelled) return;
      registeredPushUserRef.current = "";
      console.log("[push-token] registration failed:", err?.message);
    });

    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshNotifications();
      }
    });

    return () => subscription.remove();
  }, [refreshNotifications]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      refreshNotifications();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      refreshNotifications();
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [refreshNotifications]);

  useEffect(() => {
    setLocalNotifications([]);
    seenServerNotificationIdsRef.current = new Set();
    initialFetchCompleteRef.current = false;
    registeredPushUserRef.current = "";
    refreshInFlightRef.current = null;
    serverNotificationsSignatureRef.current = "";
  }, [user?._id]);

  useEffect(() => {
    setupNotificationChannels();
    return () => {
      unloadNotificationSounds();
    };
  }, []);

  const markAllRead = useCallback(async () => {
    setLocalNotifications((prev) => prev.map((item) => ({ ...item, read: true })));

    if (!user?._id) {
      setServerNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      return;
    }

    try {
      await api.put(`/user/${user._id}/notifications/read-all`);
      await refreshNotifications();
    } catch (err) {
      console.log("[notifications] mark read failed:", err?.message);
    }
  }, [refreshNotifications, user?._id]);

  const clearNotifications = useCallback(async () => {
    setLocalNotifications([]);

    if (!user?._id) {
      setServerNotifications([]);
      return;
    }

    try {
      await api.delete(`/user/${user._id}/notifications`);
      setServerNotifications([]);
    } catch (err) {
      console.log("[notifications] clear failed:", err?.message);
    }
  }, [user?._id]);

  const resolveJoinRequest = useCallback(
    async ({ notification, action }) => {
      if (!user?._id || !notification?.connectionId || !notification?.actorUserId) {
        throw new Error("Missing request details.");
      }

      const endpoint =
        action === "accept"
          ? `/connection/approve/${notification.connectionId}/${notification.actorUserId}/${user._id}`
          : `/connection/reject/${notification.connectionId}/${notification.actorUserId}/${user._id}`;

      const response = await api.put(endpoint);
      await refreshNotifications();
      return response?.data;
    },
    [refreshNotifications, user?._id]
  );

  const notifications = useMemo(() => {
    const seen = new Set();

    return [...serverNotifications, ...localNotifications]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .filter((item) => {
        const key = getNotificationDedupeKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30);
  }, [localNotifications, serverNotifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      addNotification,
      markAllRead,
      clearNotifications,
      refreshNotifications,
      resolveJoinRequest,
      notificationsVersion,
    }),
    [
      addNotification,
      clearNotifications,
      markAllRead,
      notifications,
      refreshNotifications,
      resolveJoinRequest,
      notificationsVersion,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(activeCriticalAlert)}
        onRequestClose={() => setActiveCriticalAlert(null)}
      >
        <View style={styles.criticalBackdrop}>
          <View style={styles.criticalCard}>
            <Text style={styles.criticalKicker}>SagipBayan Critical Alert</Text>
            <Text style={styles.criticalTitle}>
              {activeCriticalAlert?.title || "Critical Alert"}
            </Text>
            <Text style={styles.criticalMessage}>
              {activeCriticalAlert?.message || "Please follow MDRRMO instructions."}
            </Text>
            <TouchableOpacity
              style={styles.criticalButton}
              onPress={() => setActiveCriticalAlert(null)}
            >
              <Text style={styles.criticalButtonText}>Acknowledge</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NotificationContext.Provider>
  );
}

const styles = StyleSheet.create({
  criticalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(127,29,29,0.86)",
    padding: 20,
  },
  criticalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 22,
  },
  criticalKicker: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  criticalTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
  },
  criticalMessage: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  criticalButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 6,
    backgroundColor: "#B91C1C",
    paddingHorizontal: 16,
  },
  criticalButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
