import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import ViewShot from "react-native-view-shot";

import api, { getApiBaseUrl, PROD_BASE } from "../lib/api";
import {
  getSafetyDebugLocations,
  saveSafetyDebugLocation,
  turnOffSafetyDebugLocation,
  updateSafetyDebugStatus,
} from "../lib/safetyMarkingApi";
import { UserContext } from "./UserContext";
import { NotificationContext } from "./contexts/NotificationContext";
import { useTheme } from "./contexts/ThemeContext";
import jaenGeoJSON from "./data/jaen.json";
import { generateSeededJaenDebugLocation } from "./utils/safetyDebugLocation";
import { isPointInsideJaen } from "./utils/jaenBounds";
import {
  normalizeCoordinate,
  sanitizeConnectionCode,
  safeDisplayText,
} from "./utils/validation";

let assetBaseUrl = PROD_BASE;
const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=365314&color=fff&rounded=true&name=User";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const JAEN_INITIAL_REGION = {
  latitude: 15.32,
  longitude: 120.92,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const SAFETY_CONNECTIONS_CACHE_KEY = "sagipbayan.safetyMark.connections.v1";
const SAFETY_DEBUG_MARKERS_CACHE_KEY = "sagipbayan.safetyMark.debugMarkers.v1";

const OUTSIDE_JAEN_MASK = [
  { latitude: 16.2, longitude: 119.8 },
  { latitude: 16.2, longitude: 122.0 },
  { latitude: 14.4, longitude: 122.0 },
  { latitude: 14.4, longitude: 119.8 },
];

const SAFETY_STATUS_OPTIONS = [
  {
    value: "SAFE",
    label: "Safe",
    description: "I am safe",
    icon: "shield-checkmark-outline",
    endpointType: "safe",
    activeColor: "#2F855A",
    softColor: "#E8F5EC",
  },
  {
    value: "NOT_SAFE",
    label: "Not Safe",
    description: "Need help",
    icon: "warning-outline",
    endpointType: "not-safe",
    activeColor: "#B91C1C",
    softColor: "#FDECEC",
  },
];

const safeArray = (value) => (Array.isArray(value) ? value : []);
const getDebugMarkerPayload = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.markers)) return data.markers;
  if (Array.isArray(data?.users)) return data.users;
  return [];
};
const hasCoords = (location) =>
  typeof location?.lat === "number" && typeof location?.lng === "number";
const readSafetyCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log("[SafetyMark] cache read failed:", err?.message);
    return [];
  }
};

const writeSafetyCache = (key, value) => {
  AsyncStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])).catch((err) => {
    console.log("[SafetyMark] cache write failed:", err?.message);
  });
};

const isLikelyNetworkError = (err) => {
  const message = String(err?.message || "").toLowerCase();
  return (
    !err?.response ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("internet") ||
    message.includes("offline")
  );
};

function getBarangayColorParts(index = 0) {
  const hue = Math.round((index * 137.508 + 24) % 360);
  const saturationCycle = [78, 64, 86, 58];
  const lightnessCycle = [48, 60, 42, 66];
  const saturation = saturationCycle[index % saturationCycle.length];
  const lightness = lightnessCycle[index % lightnessCycle.length];

  return { hue, saturation, lightness };
}

function getBarangayOutlineColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsl(${hue}, ${Math.min(88, saturation + 8)}%, ${Math.max(34, lightness - 8)}%)`;
}

function getBarangaySoftFillColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsla(${hue}, ${saturation}%, ${Math.min(82, lightness + 10)}%, 0.11)`;
}

const toCoords = (ring) =>
  safeArray(ring)
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({
      latitude: Number(lat),
      longitude: Number(lng),
    }))
    .filter((point) => !Number.isNaN(point.latitude) && !Number.isNaN(point.longitude));

const getBoundaryHoles = (data) =>
  safeArray(data?.features).flatMap((feature) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons
      .map((poly) => toCoords(poly?.[0]))
      .filter((coords) => coords.length > 2);
  });

const renderBoundary = (data, strokeColor, strokeWidth, fillColor) =>
  safeArray(data?.features).flatMap((feature, index) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly, polyIndex) => {
      const coords = toCoords(poly?.[0]);
      if (!coords.length) return [];

      return [
        <Polygon
          key={`jaen-boundary-${index}-${polyIndex}`}
          coordinates={coords}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          fillColor={fillColor}
        />,
      ];
    });
  });

const renderBarangayBoundaryOutlines = (data) => {
  const features = safeArray(data?.features);

  return features.flatMap((feature, index) => {
    const totalFeatures = features.length || 1;
    const strokeColor = getBarangayOutlineColor(index, totalFeatures);
    const fillColor = getBarangaySoftFillColor(index, totalFeatures);
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly, polyIndex) => {
      const coords = toCoords(poly?.[0]);
      if (!coords.length) return [];

      return (
        <Polygon
          key={`safety-barangay-boundary-${index}-${polyIndex}`}
          coordinates={coords}
          strokeColor={strokeColor}
          strokeWidth={1.25}
          fillColor={fillColor}
          tappable={false}
          zIndex={12}
        />
      );
    });
  });
};

const getBoundsFromData = (data) => {
  const coords = safeArray(data?.features).flatMap((feature) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly) => toCoords(poly?.[0]));
  });

  if (!coords.length) return null;

  return coords.reduce(
    (acc, coord) => ({
      minLat: Math.min(acc.minLat, coord.latitude),
      maxLat: Math.max(acc.maxLat, coord.latitude),
      minLng: Math.min(acc.minLng, coord.longitude),
      maxLng: Math.max(acc.maxLng, coord.longitude),
    }),
    {
      minLat: coords[0].latitude,
      maxLat: coords[0].latitude,
      minLng: coords[0].longitude,
      maxLng: coords[0].longitude,
    }
  );
};

const clamp = (value, min, max) => {
  if (min > max) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
};

const timeAgo = (date) => {
  if (!date) return "Last update unavailable";
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Last updated just now";
  if (mins < 60) return `Last updated ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last updated ${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `Last updated ${days} day ago`;
};

const normalizeSafetyStatusValue = (status) => {
  const normalized = String(status || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "SAFE") return "SAFE";
  if (normalized === "NOT_SAFE" || normalized === "UNSAFE") return "NOT_SAFE";
  return "UNKNOWN";
};

const getSafetyColor = (status) => {
  const normalized = normalizeSafetyStatusValue(status);
  if (normalized === "SAFE") return "#22C55E";
  if (normalized === "NOT_SAFE") return "#EF4444";
  return "#9CA3AF";
};

const getSafetyLabel = (status) => {
  const normalized = normalizeSafetyStatusValue(status);
  if (normalized === "SAFE") return "Safe";
  if (normalized === "NOT_SAFE") return "Not Safe";
  return "Unknown";
};

function resolveAvatarPath(avatar) {
  if (!avatar) return DEFAULT_AVATAR;
  if (avatar.startsWith("http")) return avatar;
  return `${assetBaseUrl}${avatar}`;
}

function NotSafeSignal({ coordinate }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setProgress(((Date.now() - startedAt) % 2000) / 2000);
    }, 50);

    return () => clearInterval(timer);
  }, []);

  const renderPulse = (pulseProgress, key) => {
    const easedProgress = Easing.out(Easing.quad)(pulseProgress);
    const radius = 60 + easedProgress * 640;
    const opacity = Math.max(0, 0.72 * (1 - pulseProgress));

    return (
      <Circle
      key={key}
      center={coordinate}
      radius={radius}
      fillColor={`rgba(239,68,68,${opacity * 0.24})`}
      strokeColor={`rgba(220,38,38,${opacity})`}
      strokeWidth={3}
      zIndex={900}
    />
    );
  };

  const secondProgress = (progress + 0.5) % 1;

  return (
    <>
      {renderPulse(progress, "first")}
      {renderPulse(secondProgress, "second")}
    </>
  );
}

function ProfileSafetyMarker({ member, coordinate }) {
  const markerCaptureRef = useRef(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [markerImageUri, setMarkerImageUri] = useState(null);
  const markerColor = member?.safetyColor || getSafetyColor(member?.safetyStatus);
  const avatarUri = avatarFailed ? null : resolveAvatarPath(member?.avatar);

  useEffect(() => {
    setAvatarFailed(false);
    setMarkerImageUri(null);
  }, [member?.avatar, markerColor]);

  const captureMarkerImage = useCallback(() => {
    // Capture the finished React view ourselves, then hand Google Maps a plain
    // PNG. This avoids react-native-maps' Android custom-view snapshot path.
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          const uri = await markerCaptureRef.current?.capture?.();
          if (uri) setMarkerImageUri(uri);
        } catch (err) {
          console.log("[SafetyMark] avatar marker capture failed:", err?.message);
        }
      });
    });
  }, []);

  const handleAvatarError = useCallback(() => {
    setAvatarFailed(true);
  }, []);

  useEffect(() => {
    if (avatarFailed) captureMarkerImage();
  }, [avatarFailed, captureMarkerImage]);

  const markerProps = {
    coordinate,
    anchor: { x: 0.5, y: 0.5 },
    zIndex: member.isCurrentUser ? 1200 : 999,
    flat: false,
  };

  if (markerImageUri) {
    return <Marker {...markerProps} image={{ uri: markerImageUri }} tracksViewChanges={false} />;
  }

  return (
    <Marker {...markerProps} tracksViewChanges>
      <ViewShot
        ref={markerCaptureRef}
        style={styles.profilePinShell}
        options={{ format: "png", quality: 1, result: "tmpfile" }}
        collapsable={false}
      >
        <View style={[styles.profilePin, { borderColor: markerColor }]} collapsable={false}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.profilePinAvatar}
              resizeMode="cover"
              fadeDuration={0}
              onLoad={captureMarkerImage}
              onError={handleAvatarError}
            />
          ) : (
            <View style={[styles.profilePinIconSurface, { backgroundColor: `${markerColor}16` }]}>
              <Ionicons name="person" size={24} color={markerColor} />
            </View>
          )}
        </View>
      </ViewShot>
    </Marker>
  );
}

function normalizeConnection(connection, currentUserId) {
  if (!connection?._id) return null;

  const creatorId = connection?.creator?._id || connection?.creator || null;

  const members = safeArray(connection.members)
    .filter((member) => member?._id)
    .map((member) => ({
      id: member._id,
      name:
        [member?.fname, member?.lname].filter(Boolean).join(" ").trim() ||
        safeDisplayText(member.username, "Unknown member"),
      username: safeDisplayText(member.username, "Unknown member"),
      avatar: resolveAvatarPath(member.avatar),
      safetyStatus: member.safetyStatus || "UNKNOWN",
      shareSafetyLocation: member.shareSafetyLocation === true,
      safetyLabel: getSafetyLabel(member.safetyStatus),
      safetyColor: getSafetyColor(member.safetyStatus),
      updatedLabel: timeAgo(member?.location?.updatedAt),
      location: hasCoords(member.location)
        ? { latitude: member.location.lat, longitude: member.location.lng }
        : null,
      insideJaen: hasCoords(member.location)
        ? isPointInsideJaen(member.location.lat, member.location.lng)
        : false,
      canKick: creatorId === currentUserId && member._id !== currentUserId,
    }));

  const pendingMembers = safeArray(connection.pendingMembers)
    .filter((member) => member?._id)
    .map((member) => ({
      id: member._id,
      name:
        [member?.fname, member?.lname].filter(Boolean).join(" ").trim() ||
        safeDisplayText(member.username, "Unknown member"),
      username: safeDisplayText(member.username, "Unknown member"),
      avatar: resolveAvatarPath(member.avatar),
    }));

  return {
    id: connection._id,
    code: safeDisplayText(connection.code, "No code"),
    isCreator: creatorId === currentUserId,
    members,
    pendingMembers,
  };
}

function normalizeDebugMarker(marker, currentUserId) {
  const coordinate = normalizeCoordinate({
    latitude: marker?.latitude,
    longitude: marker?.longitude,
  });
  const safetyStatus = normalizeSafetyStatusValue(marker?.safetyStatus);

  if (
    !marker?.userId ||
    !coordinate ||
    !isPointInsideJaen(coordinate.latitude, coordinate.longitude)
  ) {
    return null;
  }

  return {
    id: String(marker.userId),
    userId: String(marker.userId),
    username: safeDisplayText(marker.username, "Debug user"),
    avatar: marker.avatar || marker.profileImage ? resolveAvatarPath(marker.avatar || marker.profileImage) : null,
    safetyStatus,
    safetyColor: getSafetyColor(safetyStatus),
    safetyLabel: getSafetyLabel(safetyStatus),
    coordinate,
    isCurrentUser: String(marker.userId) === String(currentUserId),
    insideJaen: true,
    debugMode: true,
    updatedLabel: timeAgo(marker.updatedAt),
  };
}

function dedupeMarkersByUserId(markers) {
  const seen = new Set();

  return safeArray(markers).filter((marker) => {
    const id = String(marker?.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function applySafetyStatusToMarker(marker, safetyStatus) {
  const normalizedStatus = normalizeSafetyStatusValue(safetyStatus);

  return {
    ...marker,
    safetyStatus: normalizedStatus,
    safetyColor: getSafetyColor(normalizedStatus),
    safetyLabel: getSafetyLabel(normalizedStatus),
  };
}

function isCurrentUserMarker(marker, userId) {
  return String(marker?.userId || marker?.id || "") === String(userId || "");
}

function buildCurrentUserDebugMarker(user, safetyStatus) {
  if (!user?._id) return null;
  const normalizedStatus = normalizeSafetyStatusValue(safetyStatus);

  return {
    id: String(user._id),
    userId: String(user._id),
    username:
      [user?.fname, user?.lname].filter(Boolean).join(" ").trim() ||
      user?.username ||
      "You",
    avatar: user?.avatar ? resolveAvatarPath(user.avatar) : null,
    safetyStatus: normalizedStatus,
    safetyColor: getSafetyColor(normalizedStatus),
    safetyLabel: getSafetyLabel(normalizedStatus),
    coordinate: generateSeededJaenDebugLocation(user._id),
    isCurrentUser: true,
    insideJaen: true,
    debugMode: true,
    shareSafetyLocation: true,
  };
}

function createSafetyThemeStyles(theme) {
  return StyleSheet.create({
    floatingTabButton: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    floatingTabButtonActive: {
      backgroundColor: theme.buttonPrimary,
      borderColor: theme.buttonPrimary,
    },
    floatingTabText: {
      color: theme.subtext,
    },
    floatingTabTextActive: {
      color: theme.buttonText,
    },
    panel: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    panelDragZone: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    dragHandleWrap: {
      backgroundColor: theme.panel,
    },
    dragHandle: {
      backgroundColor: theme.border,
    },
    sheetIntro: {
      backgroundColor: theme.panel,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    section: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    surfaceCard: {
      backgroundColor: theme.surfaceAlt || theme.card,
      borderColor: theme.border,
    },
    softCard: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    input: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      color: theme.text,
    },
    secondaryButton: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    dangerButton: {
      backgroundColor: theme.danger === "#EF4444" ? "rgba(239,68,68,0.14)" : `${theme.danger}22`,
      borderColor: theme.danger,
    },
    modalBackdrop: {
      backgroundColor: theme.overlay,
    },
    modalCard: {
      backgroundColor: theme.modalBackground,
      borderColor: theme.border,
    },
    text: {
      color: theme.text,
    },
    subtext: {
      color: theme.subtext,
    },
    primaryText: {
      color: theme.primary,
    },
  });
}

function MetricCard({ label, value, tone = "neutral", theme }) {
  const toneColor =
    tone === "safe" ? getSafetyColor("SAFE") : tone === "danger" ? getSafetyColor("NOT_SAFE") : theme.border;

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: theme.card, borderColor: toneColor },
      ]}
    >
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.subtext }]}>{label}</Text>
    </View>
  );
}

function SafetyStatusToggle({ value, disabled, onChange, theme }) {
  return (
    <View style={[styles.statusToggleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.statusToggleHeader}>
        <View style={styles.statusToggleTitleWrap}>
          <Text style={[styles.statusToggleEyebrow, { color: theme.primary }]}>Updated Safety Status</Text>
          <Text style={[styles.statusToggleTitle, { color: theme.text }]}>Mark your current condition</Text>
        </View>

        <View
          style={[
            styles.statusToggleCurrentBadge,
            { backgroundColor: `${getSafetyColor(value)}16` },
          ]}
        >
          <View
            style={[
              styles.statusToggleCurrentDot,
              { backgroundColor: getSafetyColor(value) },
            ]}
          />
          <Text
            style={[
              styles.statusToggleCurrentText,
              { color: getSafetyColor(value) },
            ]}
          >
            {getSafetyLabel(value)}
          </Text>
        </View>
      </View>

      <View style={styles.statusToggleRow}>
        {SAFETY_STATUS_OPTIONS.map((option) => {
          const active = value === option.value;

          return (
            <Pressable
              key={option.value}
              disabled={disabled}
              onPress={() => onChange(option)}
              style={({ pressed }) => [
                styles.statusToggleButton,
                {
                  backgroundColor: active ? option.activeColor : theme.card,
                  borderColor: active ? option.activeColor : theme.border,
                  opacity: disabled ? 0.68 : pressed ? 0.86 : 1,
                  transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
                },
              ]}
            >
              <View
                style={[
                  styles.statusToggleIconWrap,
                  {
                    backgroundColor: active ? "rgba(255,255,255,0.18)" : theme.surfaceAlt,
                  },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={active ? "#FFFFFF" : option.activeColor}
                />
              </View>

              <View style={styles.statusToggleButtonCopy}>
                <Text
                  style={[
                    styles.statusToggleButtonText,
                    { color: active ? theme.buttonText : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.statusToggleButtonSubtext,
                    { color: active ? "rgba(255,255,255,0.78)" : theme.subtext },
                  ]}
                  numberOfLines={1}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SafetyMark() {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme } = useTheme();
  const themed = useMemo(() => createSafetyThemeStyles(theme), [theme]);
  const { user, setUser } = useContext(UserContext);
  const { refreshNotifications, notificationsVersion } = useContext(NotificationContext);
  const mapRef = useRef(null);
  const isClampingRegionRef = useRef(false);
  const debugPollRef = useRef(null);

  const [connections, setConnections] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [activeTab, setActiveTab] = useState("status");
  const [localSafetyStatus, setLocalSafetyStatus] = useState(
    normalizeSafetyStatusValue(user?.safetyStatus || "SAFE")
  );
  const [safetyDebugMode, setSafetyDebugMode] = useState(false);
  const [debugMarkers, setDebugMarkers] = useState([]);
  const [debugSyncing, setDebugSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [mongoBarangays, setMongoBarangays] = useState(null);
  const [liveGpsLocation, setLiveGpsLocation] = useState(null);
  const [, setAssetBaseVersion] = useState(0);
  const [joinRequestModalVisible, setJoinRequestModalVisible] = useState(false);
  const [joinRequestModalMessage, setJoinRequestModalMessage] = useState(
    "Wait for the approval of the admin."
  );
  const isSafetyLocationSharingEnabled = user?.shareSafetyLocation === true;

  const panelExpandedTop = SCREEN_HEIGHT * 0.44;
  const panelCollapsedTop = SCREEN_HEIGHT * 0.74;
  const panelTop = useRef(new Animated.Value(panelCollapsedTop)).current;
  const panelTopValue = useRef(panelCollapsedTop);
  const dragStartTop = useRef(panelCollapsedTop);

  useEffect(() => {
    let mounted = true;

    getApiBaseUrl()
      .then((baseUrl) => {
        if (!mounted || !baseUrl) return;
        assetBaseUrl = baseUrl;
        setAssetBaseVersion((version) => version + 1);
      })
      .catch(() => {
        if (!mounted) return;
        assetBaseUrl = PROD_BASE;
        setAssetBaseVersion((version) => version + 1);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const id = panelTop.addListener(({ value }) => {
      panelTopValue.current = value;
    });
    return () => panelTop.removeListener(id);
  }, [panelTop]);

  useEffect(() => {
    let mounted = true;

    api
      .get("/api/barangays/collection")
      .then((res) => {
        if (!mounted) return;

        const features = safeArray(res.data).flatMap((collection) =>
          safeArray(collection?.features)
        );

        setMongoBarangays({
          type: "FeatureCollection",
          features,
        });

        setIsOffline(false);
        console.log("[SafetyMark] barangay boundaries fetched:", features.length);
      })
      .catch((err) => {
        if (isLikelyNetworkError(err)) setIsOffline(true);
        console.log("[SafetyMark] barangay boundary fetch failed:", err?.message);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const snapPanel = useCallback(
    (toValue) => {
      Animated.spring(panelTop, {
        toValue,
        useNativeDriver: false,
        damping: 24,
        stiffness: 180,
        mass: 0.8,
      }).start();
    },
    [panelTop]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        panelTop.stopAnimation((value) => {
          panelTopValue.current = value;
          dragStartTop.current = value;
        });
      },
      onPanResponderMove: (_, g) => {
        const nextTop = clamp(
          dragStartTop.current + g.dy,
          panelExpandedTop,
          panelCollapsedTop
        );
        panelTopValue.current = nextTop;
        panelTop.setValue(nextTop);
      },
      onPanResponderRelease: (_, g) => {
        const currentTop = clamp(
          dragStartTop.current + g.dy,
          panelExpandedTop,
          panelCollapsedTop
        );
        panelTopValue.current = currentTop;
        panelTop.setValue(currentTop);
      },
      onPanResponderTerminate: () => {
        const currentTop = clamp(panelTopValue.current, panelExpandedTop, panelCollapsedTop);
        panelTopValue.current = currentTop;
        panelTop.setValue(currentTop);
      },
    })
  ).current;

  useEffect(() => {
    setLocalSafetyStatus(normalizeSafetyStatusValue(user?.safetyStatus || "SAFE"));
  }, [user?.safetyStatus]);

  useEffect(() => {
    const initialTab = route?.params?.initialTab;
    const targetConnectionId = route?.params?.connectionId;
    const shouldOpenPendingRequests = Boolean(route?.params?.openPendingRequests);
    const notificationId = route?.params?.notificationId;

    if (!initialTab && !targetConnectionId && !shouldOpenPendingRequests && !notificationId) {
      return;
    }

    if (initialTab) {
      setActiveTab(initialTab);
    }

    if (targetConnectionId) {
      setSelectedConnectionId(targetConnectionId);
    }

    snapPanel(panelExpandedTop);

    navigation.setParams({
      initialTab: undefined,
      connectionId: undefined,
      openPendingRequests: undefined,
      notificationId: undefined,
    });
  }, [
    navigation,
    panelExpandedTop,
    route?.params?.connectionId,
    route?.params?.initialTab,
    route?.params?.notificationId,
    route?.params?.openPendingRequests,
    snapPanel,
  ]);

  const fetchConnections = useCallback(async () => {
    if (!user?._id) {
      setConnections([]);
      return [];
    }

    try {
      const res = await api.get(`/connection/user/${user._id}`);
      const rawConnections = safeArray(res.data);
      const nextConnections = rawConnections
        .map((item) => normalizeConnection(item, user._id))
        .filter(Boolean);

      setConnections(nextConnections);
      setIsOffline(false);
      writeSafetyCache(SAFETY_CONNECTIONS_CACHE_KEY, rawConnections);
      return nextConnections;
    } catch (err) {
      if (!isLikelyNetworkError(err)) throw err;

      setIsOffline(true);
      const cachedConnections = (await readSafetyCache(SAFETY_CONNECTIONS_CACHE_KEY))
        .map((item) => normalizeConnection(item, user._id))
        .filter(Boolean);

      if (cachedConnections.length) {
        setConnections(cachedConnections);
      }

      console.log("[SafetyMark] connection fetch failed, using cached data:", err?.message);
      return cachedConnections;
    }
  }, [user?._id]);

  const fetchDebugMarkers = useCallback(async () => {
    try {
      const res = await getSafetyDebugLocations();
      const rawMarkers = getDebugMarkerPayload(res?.data);
      const nextMarkers = dedupeMarkersByUserId(
        rawMarkers
          .map((item) => normalizeDebugMarker(item, user?._id))
          .filter(Boolean)
      );
      console.log("[markers] fetched:", rawMarkers.length);
      console.log("[markers] fetched count:", nextMarkers.length);
      console.log("[markers] userIds:", nextMarkers.map((marker) => marker.id));
      console.log("[markers] users:", nextMarkers.map((marker) => marker.id));
      console.log(
        "[markers] statuses:",
        nextMarkers.map((marker) => ({
          userId: marker.id,
          safetyStatus: marker.safetyStatus,
        }))
      );
      setIsOffline(false);
      setDebugMarkers(nextMarkers);
      writeSafetyCache(SAFETY_DEBUG_MARKERS_CACHE_KEY, rawMarkers);
      console.log("[markers] refetched:", nextMarkers.length);
      return nextMarkers;
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        setIsOffline(true);
        const cachedMarkers = dedupeMarkersByUserId(
          (await readSafetyCache(SAFETY_DEBUG_MARKERS_CACHE_KEY))
            .map((item) => normalizeDebugMarker(item, user?._id))
            .filter(Boolean)
        );

        if (cachedMarkers.length) {
          setDebugMarkers(cachedMarkers);
        }

        console.log("[SafetyMark] debug marker fetch failed, using cached data:", err?.message);
        return cachedMarkers;
      }

      console.log("[SafetyMark] debug marker fetch failed:", err?.message);
      return [];
    }
  }, [user?._id]);

  const syncOwnDebugLocation = useCallback(
    async (status = localSafetyStatus) => {
      if (!user?._id) return null;

      const coordinate = generateSeededJaenDebugLocation(user._id);
      console.log("[debug-location] current user:", user._id);
      console.log("[debug-location] generated coordinate:", coordinate);

      const payload = {
        userId: user._id,
        username:
          [user?.fname, user?.lname].filter(Boolean).join(" ").trim() ||
          user?.username ||
          "User",
        avatar: user?.avatar || "",
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        safetyStatus: status,
        debugMode: true,
      };

      const res = await saveSafetyDebugLocation(payload);
      console.log("[debug-location] saved to backend:", {
        userId: res?.data?.marker?.userId,
        latitude: res?.data?.marker?.latitude,
        longitude: res?.data?.marker?.longitude,
        debugMode: res?.data?.marker?.debugMode,
      });
      return res?.data?.marker || null;
    },
    [localSafetyStatus, user]
  );

  const refreshAll = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      await Promise.all([fetchConnections(), fetchDebugMarkers()]);
    } catch (err) {
      if (isLikelyNetworkError(err)) setIsOffline(true);
      console.log("[SafetyMark] refresh failed:", err?.message);
    } finally {
      setLoading(false);
    }
  }, [fetchConnections, fetchDebugMarkers, user?._id]);

  const applyLocalSafetyStatus = useCallback(
    async (nextStatus) => {
      const normalizedStatus = normalizeSafetyStatusValue(nextStatus);
      setLocalSafetyStatus(normalizedStatus);

      setDebugMarkers((items) => {
        const updatedItems = items.map((item) =>
          isCurrentUserMarker(item, user?._id)
            ? applySafetyStatusToMarker(item, normalizedStatus)
            : item
        );

        if (updatedItems.some((item) => isCurrentUserMarker(item, user?._id))) {
          return updatedItems;
        }

        const localMarker = buildCurrentUserDebugMarker(user, normalizedStatus);
        return localMarker ? dedupeMarkersByUserId([localMarker, ...updatedItems]) : updatedItems;
      });
      setDebugMarkers((items) => {
        console.log("[markers] local state updated:", items);
        return items;
      });

      if (user?._id && setUser) {
        await setUser({
          ...user,
          safetyStatus: normalizedStatus,
          safetyUpdatedAt: new Date().toISOString(),
        });
      }

      console.log("[status] changed to:", normalizedStatus);
      console.log("[safety-status] local marker status:", {
        userId: user?._id,
        safetyStatus: normalizedStatus,
        color: getSafetyColor(normalizedStatus),
      });
    },
    [setUser, user]
  );

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll])
  );

  useEffect(() => {
    if (
      safetyDebugMode ||
      !user?._id ||
      !isSafetyLocationSharingEnabled ||
      Platform.OS === "web"
    ) {
      setLiveGpsLocation(null);
      return undefined;
    }

    let mounted = true;
    let subscription = null;

    async function startLiveGpsLocation() {
      try {
        const Location = await import("expo-location");
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!mounted) return;

        if (permission.status !== "granted") {
          console.log("[debug-location] live GPS permission denied");
          return;
        }

        const applyPosition = async (position) => {
          const coordinate = normalizeCoordinate({
            latitude: position?.coords?.latitude,
            longitude: position?.coords?.longitude,
          });

          if (!coordinate || !mounted) return;

          setLiveGpsLocation(coordinate);

          try {
            await api.put(`/user/location/${user._id}`, {
              lat: coordinate.latitude,
              lng: coordinate.longitude,
            });
          } catch (err) {
            console.log("[debug-location] live GPS backend sync failed:", err?.message);
          }
        };

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await applyPosition(current);

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 15,
          },
          applyPosition
        );
      } catch (err) {
        console.log("[debug-location] live GPS failed:", err?.message);
      }
    }

    startLiveGpsLocation();

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [isSafetyLocationSharingEnabled, safetyDebugMode, user?._id]);

  useEffect(() => {
    if (!safetyDebugMode || !user?._id) return undefined;

    fetchDebugMarkers();
    debugPollRef.current = setInterval(fetchDebugMarkers, 3000);

    return () => {
      if (debugPollRef.current) {
        clearInterval(debugPollRef.current);
        debugPollRef.current = null;
      }
    };
  }, [fetchDebugMarkers, safetyDebugMode, user?._id]);

  useEffect(() => {
    if (!safetyDebugMode || !user?._id) return;

    syncOwnDebugLocation(localSafetyStatus)
      .then(fetchDebugMarkers)
      .catch((err) => {
        console.log("[SafetyMark] debug status sync failed:", err?.message);
      });
  }, [fetchDebugMarkers, localSafetyStatus, safetyDebugMode, syncOwnDebugLocation, user?._id]);

  useEffect(() => {
    if (!user?._id) return;
    refreshAll();
  }, [notificationsVersion, refreshAll, user?._id]);

  const selectedConnection =
    connections.find((item) => item.id === selectedConnectionId) || connections[0] || null;

  useEffect(() => {
    if (!connections.length) {
      setSelectedConnectionId(null);
      return;
    }

    if (!selectedConnectionId || !connections.some((item) => item.id === selectedConnectionId)) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  const pendingRequests = useMemo(
    () =>
      connections.flatMap((connection) =>
        connection.isCreator
          ? connection.pendingMembers.map((member) => ({
              connectionId: connection.id,
              connectionCode: connection.code,
              member,
            }))
          : []
      ),
    [connections]
  );

  const allPeople = useMemo(() => {
    const seen = new Map();

    connections.forEach((connection) => {
      connection.members.forEach((member) => {
        if (!seen.has(member.id)) {
          seen.set(member.id, {
            ...member,
            connectionCodes: [connection.code],
          });
        } else {
          seen.get(member.id).connectionCodes.push(connection.code);
        }
      });
    });

    return Array.from(seen.values());
  }, [connections]);

  const memberCount = useMemo(() => {
    const ids = new Set([user?._id].filter(Boolean));
    allPeople.forEach((member) => ids.add(member.id));
    return ids.size;
  }, [allPeople, user?._id]);

  const safeCount = useMemo(() => {
    const others = allPeople.filter(
      (member) => member.id !== user?._id && member.safetyStatus === "SAFE"
    ).length;
    return others + (localSafetyStatus === "SAFE" ? 1 : 0);
  }, [allPeople, localSafetyStatus, user?._id]);

  const notSafeCount = useMemo(() => {
    const others = allPeople.filter(
      (member) => member.id !== user?._id && member.safetyStatus === "NOT_SAFE"
    ).length;
    return others + (localSafetyStatus === "NOT_SAFE" ? 1 : 0);
  }, [allPeople, localSafetyStatus, user?._id]);

  const jaenBoundary = useMemo(
    () => renderBoundary(jaenGeoJSON, "#365314", 2.2, "transparent"),
    []
  );

  const barangayBoundarySource = useMemo(
    () =>
      safeArray(mongoBarangays?.features).length
        ? mongoBarangays
        : jaenGeoJSON,
    [mongoBarangays]
  );

  const barangayBoundaryOutlines = useMemo(
    () => renderBarangayBoundaryOutlines(barangayBoundarySource),
    [barangayBoundarySource]
  );

  const jaenFocusMask = useMemo(() => {
    const holes = getBoundaryHoles(jaenGeoJSON);
    return (
      <Polygon
        coordinates={OUTSIDE_JAEN_MASK}
        holes={holes}
        strokeColor="rgba(15,23,42,0)"
        fillColor="rgba(15,23,42,0.26)"
      />
    );
  }, []);

  const jaenBounds = useMemo(() => getBoundsFromData(jaenGeoJSON), []);

  useEffect(() => {
    if (!safetyDebugMode) return;
    const debugCoordinate = generateSeededJaenDebugLocation(user?._id);

    mapRef.current?.animateToRegion(
      {
        ...debugCoordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      320
    );
  }, [safetyDebugMode, user?._id]);

  const visibleMembersOnMap = useMemo(() => {
    const insideMembers = allPeople
      .map((member) => {
        if (member.shareSafetyLocation !== true) return null;

        const coordinate = normalizeCoordinate(member.location);
        if (!coordinate || !member.insideJaen) return null;

        return {
          ...member,
          coordinate,
        };
      })
      .filter(Boolean);

    if (safetyDebugMode) {
      const serverMarkers = dedupeMarkersByUserId(
        debugMarkers
          .map((marker) => ({
            ...(isCurrentUserMarker(marker, user?._id)
              ? applySafetyStatusToMarker(marker, localSafetyStatus)
              : marker),
            isCurrentUser: isCurrentUserMarker(marker, user?._id),
          }))
      );
      const hasCurrentUser = serverMarkers.some(
        (marker) => isCurrentUserMarker(marker, user?._id)
      );

      if (hasCurrentUser || !user?._id) {
        return serverMarkers;
      }

      return dedupeMarkersByUserId([
        buildCurrentUserDebugMarker(user, localSafetyStatus),
        ...serverMarkers,
      ].filter(Boolean));
    }

    const userCoordinate = liveGpsLocation || normalizeCoordinate(user?.location);
    const shouldShowCurrentUser =
      isSafetyLocationSharingEnabled &&
      userCoordinate &&
      isPointInsideJaen(userCoordinate.latitude, userCoordinate.longitude);
    const currentUserFallbackCoordinate = user?._id
      ? generateSeededJaenDebugLocation(user._id)
      : null;

    if ((shouldShowCurrentUser || currentUserFallbackCoordinate) && user?._id) {
      const currentUserMarker = {
        id: user?._id || "me",
        username: user?.username || "You",
        avatar: user?.avatar ? resolveAvatarPath(user.avatar) : null,
        safetyStatus: localSafetyStatus,
        safetyColor: getSafetyColor(localSafetyStatus),
        safetyLabel: getSafetyLabel(localSafetyStatus),
        coordinate: shouldShowCurrentUser ? userCoordinate : currentUserFallbackCoordinate,
        isCurrentUser: true,
        insideJaen: Boolean(shouldShowCurrentUser || currentUserFallbackCoordinate),
        debugMode: !shouldShowCurrentUser,
        privateOnly: !shouldShowCurrentUser,
      };

      return [
        currentUserMarker,
        ...insideMembers.filter((member) => member.id !== currentUserMarker.id),
      ];
    }

    if (insideMembers.length) return insideMembers;

    return [];
  }, [
    allPeople,
    debugMarkers,
    isSafetyLocationSharingEnabled,
    liveGpsLocation,
    localSafetyStatus,
    safetyDebugMode,
    user,
  ]);

  useEffect(() => {
    console.log(
      "[debug-location] rendered markers:",
      visibleMembersOnMap.map((member) => ({
        id: member.id,
        debugMode: Boolean(member.debugMode),
        isCurrentUser: Boolean(member.isCurrentUser),
        privateOnly: Boolean(member.privateOnly),
        sharing: member.shareSafetyLocation === true,
        latitude: member.coordinate?.latitude,
        longitude: member.coordinate?.longitude,
      }))
    );
    if (user?._id) {
      const hasCurrentUserMarker = visibleMembersOnMap.some(
        (member) => isCurrentUserMarker(member, user._id)
      );
      console.log("[debug-location] current user marker visible:", hasCurrentUserMarker);
    }
  }, [user?._id, visibleMembersOnMap]);

  const selectedConnectionMembers = useMemo(
    () => safeArray(selectedConnection?.members),
    [selectedConnection]
  );

  const activeTabMeta = useMemo(() => {
    if (activeTab === "manage") {
      return {
        title: "Manage Connections",
        subtitle: "Switch groups, handle requests, and manage membership.",
      };
    }

    if (activeTab === "join") {
      return {
        title: "Join or Create",
        subtitle: "Use a code to join another group or start a new one.",
      };
    }

    return {
      title: selectedConnection ? `Connection ${selectedConnection.code}` : "Connection Status",
      subtitle: selectedConnection
        ? `${selectedConnectionMembers.length} members in this group`
        : "Choose a group to inspect safety updates.",
    };
  }, [activeTab, selectedConnection, selectedConnectionMembers.length]);

  const handleRegionChangeComplete = useCallback(
    (region) => {
      if (isClampingRegionRef.current) {
        isClampingRegionRef.current = false;
        return;
      }

      const latitudeDelta = Math.min(region.latitudeDelta, JAEN_INITIAL_REGION.latitudeDelta);
      const longitudeDelta = Math.min(
        region.longitudeDelta,
        JAEN_INITIAL_REGION.longitudeDelta
      );

      let latitude = region.latitude;
      let longitude = region.longitude;

      if (jaenBounds) {
        const latInset = latitudeDelta / 2;
        const lngInset = longitudeDelta / 2;

        latitude = clamp(
          region.latitude,
          jaenBounds.minLat + latInset,
          jaenBounds.maxLat - latInset
        );
        longitude = clamp(
          region.longitude,
          jaenBounds.minLng + lngInset,
          jaenBounds.maxLng - lngInset
        );
      }

      if (
        latitudeDelta !== region.latitudeDelta ||
        longitudeDelta !== region.longitudeDelta ||
        latitude !== region.latitude ||
        longitude !== region.longitude
      ) {
        isClampingRegionRef.current = true;
        mapRef.current?.animateToRegion(
          {
            ...region,
            latitude,
            longitude,
            latitudeDelta,
            longitudeDelta,
          },
          140
        );
      }
    },
    [jaenBounds]
  );

  const handleToggleDebugMode = async () => {
    if (!user?._id || debugSyncing) return;

    const nextValue = !safetyDebugMode;
    console.log("[debug-markers] toggle pressed:", {
      userId: user._id,
      nextValue,
    });
    setDebugSyncing(true);

    try {
      if (nextValue) {
        const coordinate = generateSeededJaenDebugLocation(user._id);
        const localMarker = buildCurrentUserDebugMarker(user, localSafetyStatus);
        setSafetyDebugMode(true);
        if (localMarker) {
          setDebugMarkers((items) =>
            dedupeMarkersByUserId([
              localMarker,
              ...items.filter((item) => !isCurrentUserMarker(item, user._id)),
            ])
          );
        }
        await syncOwnDebugLocation(localSafetyStatus);
        await fetchDebugMarkers();
        mapRef.current?.animateToRegion(
          {
            ...coordinate,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          320
        );
      } else {
        setSafetyDebugMode(false);
        await turnOffSafetyDebugLocation(user._id);
        setLiveGpsLocation(null);
        setDebugMarkers((items) =>
          items.filter((item) => !isCurrentUserMarker(item, user._id))
        );
        await fetchDebugMarkers();
      }
    } catch (err) {
      if (nextValue) {
        setSafetyDebugMode(true);
        console.log("[debug-location] sync failed, keeping local debug mode on:", {
          message: err?.response?.data?.message || err?.message,
        });
        Alert.alert(
          "Debug Mode Local Only",
          err?.response?.data?.message ||
            "Debug Mode stayed ON locally, but backend sync failed. Restart the backend to share markers with other devices."
        );
      } else {
        setSafetyDebugMode(true);
        Alert.alert(
          "Debug Sync Failed",
          err?.response?.data?.message || "Failed to turn off debug marker."
        );
      }
    } finally {
      setDebugSyncing(false);
    }
  };

  const handleCreateConnection = async () => {
    if (!user?._id) return;

    try {
      const res = await api.post(`/connection/create/${user._id}`);
      await refreshAll();
      await refreshNotifications();
      Alert.alert(
        "Connection Created",
        res?.data?.code
          ? `Connection code: ${res.data.code}`
          : res?.data?.message || "Connection created successfully."
      );
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to create connection.");
    }
  };

  const handleJoinConnection = async () => {
    if (!user?._id) return;
    const code = sanitizeConnectionCode(joinCode);

    if (!code || code.length < 4) {
      Alert.alert("Missing Info", "Enter a connection code.");
      return;
    }

    try {
      const res = await api.post(`/connection/join/${user._id}`, {
        code,
      });
      setJoinCode("");
      await refreshAll();
      await refreshNotifications();
      setJoinRequestModalMessage(
        res?.data?.message || "Wait for the approval of the admin."
      );
      setJoinRequestModalVisible(true);
    } catch (err) {
      const message =
        err?.response?.data?.message || "Invalid or expired connection code.";

      if (
        message === "Your join request is already pending approval." ||
        message === "You are already a member of this connection."
      ) {
        setJoinRequestModalMessage(message);
        setJoinRequestModalVisible(true);
        await refreshAll();
        await refreshNotifications();
        return;
      }

      Alert.alert("Join Failed", message);
    }
  };

  const handleSafetyUpdate = async (nextStatus, endpoint, errorMessage) => {
    if (!user?._id) return;
    const normalizedStatus = normalizeSafetyStatusValue(nextStatus);

    console.log("[status update]", normalizedStatus);
    await applyLocalSafetyStatus(normalizedStatus);

    try {
      const res = await updateSafetyDebugStatus(user._id, normalizedStatus);
      const updatedMarker = normalizeDebugMarker(res?.data?.marker, user._id);

      if (updatedMarker) {
        setDebugMarkers((items) => {
          const nextMarkers = dedupeMarkersByUserId([
            applySafetyStatusToMarker(updatedMarker, normalizedStatus),
            ...items.filter((item) => !isCurrentUserMarker(item, user._id)),
          ]);
          console.log("[markers after update]", nextMarkers);
          return nextMarkers;
        });
      } else if (safetyDebugMode) {
        await syncOwnDebugLocation(normalizedStatus);
      }

      const fetchedMarkers = await fetchDebugMarkers();
      console.log("[markers after update]", fetchedMarkers);
      await applyLocalSafetyStatus(normalizedStatus);

      api
        .put(endpoint, {
          message: normalizedStatus === "SAFE" ? "I am safe" : "Need help",
        })
        .then(refreshNotifications)
        .catch((err) => {
          console.log("[safety-status] notification sync failed:", err?.message);
        });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || errorMessage);
    }
  };

  const handleToggleSafetyStatus = async (option) => {
    if (!option?.value || !user?._id) return;

    await handleSafetyUpdate(
      option.value,
      `/connection/${option.endpointType}/${user._id}`,
      `Failed to mark ${option.label.toUpperCase()}.`
    );
  };

  const handleLeaveConnection = async (connectionId) => {
    if (!user?._id) return;
    try {
      const res = await api.delete(`/connection/leave/${user._id}/${connectionId}`);
      await refreshAll();
      await refreshNotifications();
      Alert.alert("Connection Updated", res?.data?.message || "You left the connection.");
    } catch (err) {
      Alert.alert("Error", "Failed to leave connection.");
    }
  };

  const handleDeleteConnection = (connectionId) => {
    if (!user?._id) return;

    Alert.alert(
      "Delete Connection",
      "This will permanently remove the connection and all members.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.delete(`/connection/delete/${connectionId}/${user._id}`);
              await refreshAll();
              await refreshNotifications();
              Alert.alert(
                "Connection Deleted",
                res?.data?.message || "Connection deleted successfully."
              );
            } catch (err) {
              Alert.alert("Error", "Failed to delete connection.");
            }
          },
        },
      ]
    );
  };

  const handleKickMember = (connectionId, memberId, username) => {
    if (!user?._id) return;

    Alert.alert("Remove Member", `Remove ${username} from this connection?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Kick",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await api.put(`/connection/kick/${connectionId}/${memberId}/${user._id}`);
            await refreshAll();
            await refreshNotifications();
            Alert.alert(
              "Member Removed",
              res?.data?.message || "Member has been removed from the connection."
            );
          } catch (err) {
            Alert.alert("Error", "Failed to remove member.");
          }
        },
      },
    ]);
  };

  const handleApproveRequest = async (connectionId, memberId) => {
    if (!user?._id) return;
    try {
      const res = await api.put(`/connection/approve/${connectionId}/${memberId}/${user._id}`);
      await refreshAll();
      await refreshNotifications();
      Alert.alert("Request Approved", res?.data?.message || "Member approved.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to approve request.");
    }
  };

  const handleRejectRequest = async (connectionId, memberId) => {
    if (!user?._id) return;
    try {
      const res = await api.put(`/connection/reject/${connectionId}/${memberId}/${user._id}`);
      await refreshAll();
      await refreshNotifications();
      Alert.alert("Request Rejected", res?.data?.message || "Member rejected.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to reject request.");
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={JAEN_INITIAL_REGION}
        mapType="standard"
        loadingEnabled
        loadingBackgroundColor="#E9EFE8"
        loadingIndicatorColor="#0B7F55"
        minZoomLevel={11}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {jaenFocusMask}
        {barangayBoundaryOutlines}
        {jaenBoundary}
        {visibleMembersOnMap.map((member) =>
          member.coordinate &&
          normalizeSafetyStatusValue(member.safetyStatus) === "NOT_SAFE" ? (
            <NotSafeSignal
              key={`not-safe-signal-${member.id}`}
              coordinate={member.coordinate}
            />
          ) : null
        )}
        {visibleMembersOnMap.map((member) =>
          member.coordinate ? (
            <ProfileSafetyMarker
              key={`${member.debugMode ? "debug" : "live"}-${member.id}-${member.safetyStatus}-${member.safetyColor}`}
              member={member}
              coordinate={member.coordinate}
            />
          ) : null
        )}
      </MapView>

      {isOffline && (
        <View style={styles.offlineBanner} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
          <Text style={styles.offlineBannerText}>No internet connection - showing saved map data</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.panelLayer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.panel, themed.panel, { top: panelTop }]}>
          <View style={[styles.panelDragZone, themed.panelDragZone]} {...panResponder.panHandlers}>
            <View style={[styles.dragHandleWrap, themed.dragHandleWrap]}>
              <View style={[styles.dragHandle, themed.dragHandle]} />
            </View>
            <View style={styles.sheetTabRow}>
              <Pressable
                style={[
                  styles.sheetTabButton,
                  themed.floatingTabButton,
                  activeTab === "status" && themed.floatingTabButtonActive,
                ]}
                onPress={() => setActiveTab("status")}
              >
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={activeTab === "status" ? theme.buttonText : theme.subtext}
                />
                <Text
                  style={[
                    styles.sheetTabText,
                    themed.floatingTabText,
                    activeTab === "status" && themed.floatingTabTextActive,
                  ]}
                >
                  Status
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.sheetTabButton,
                  themed.floatingTabButton,
                  activeTab === "manage" && themed.floatingTabButtonActive,
                ]}
                onPress={() => setActiveTab("manage")}
              >
                <Ionicons
                  name="git-network-outline"
                  size={16}
                  color={activeTab === "manage" ? theme.buttonText : theme.subtext}
                />
                <Text
                  style={[
                    styles.sheetTabText,
                    themed.floatingTabText,
                    activeTab === "manage" && themed.floatingTabTextActive,
                  ]}
                >
                  Manage
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.sheetTabButton,
                  themed.floatingTabButton,
                  activeTab === "join" && themed.floatingTabButtonActive,
                ]}
                onPress={() => setActiveTab("join")}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={activeTab === "join" ? theme.buttonText : theme.subtext}
                />
                <Text
                  style={[
                    styles.sheetTabText,
                    themed.floatingTabText,
                    activeTab === "join" && themed.floatingTabTextActive,
                  ]}
                >
                  Join
                </Text>
              </Pressable>
            </View>
            <View style={[styles.sheetIntro, themed.sheetIntro]}>
              <View style={styles.sheetIntroCopy}>
                <Text style={[styles.sheetIntroTitle, themed.text]}>{activeTabMeta.title}</Text>
                <Text style={[styles.sheetIntroSubtitle, themed.subtext]}>{activeTabMeta.subtitle}</Text>
              </View>
              <View
                style={[
                  styles.sheetIntroChip,
                  { backgroundColor: `${getSafetyColor(localSafetyStatus)}18` },
                ]}
              >
                <Text
                  style={[
                    styles.sheetIntroChipText,
                    { color: getSafetyColor(localSafetyStatus) },
                  ]}
                >
                  {getSafetyLabel(localSafetyStatus)}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.panelContent}
          >
            <View style={[styles.profileCard, themed.card]}>
              <Image
                source={{ uri: resolveAvatarPath(user?.avatar) }}
                style={styles.profileAvatar}
              />
              <View style={styles.profileCopy}>
                <Text style={[styles.profileName, themed.text]}>{user?.username || "Resident"}</Text>
                <Text style={[styles.profileMeta, themed.subtext]}>
                  {connections.length} connection{connections.length === 1 ? "" : "s"}
                </Text>
              </View>
              <View
                style={[
                  styles.profileStatus,
                  { backgroundColor: `${getSafetyColor(localSafetyStatus)}18` },
                ]}
              >
                <Text
                  style={[
                    styles.profileStatusText,
                    { color: getSafetyColor(localSafetyStatus) },
                  ]}
                >
                  {getSafetyLabel(localSafetyStatus)}
                </Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.debugCard,
                themed.softCard,
                safetyDebugMode && styles.debugCardActive,
                debugSyncing && styles.debugCardDisabled,
              ]}
              disabled={debugSyncing}
              onPress={handleToggleDebugMode}
            >
              <Ionicons
                name={safetyDebugMode ? "bug" : "bug-outline"}
                size={18}
                color={safetyDebugMode ? "#FFFFFF" : theme.primary}
              />
              <Text
                style={[
                  styles.debugCardText,
                  themed.primaryText,
                  safetyDebugMode && styles.debugCardTextActive,
                ]}
              >
                {safetyDebugMode
                  ? "Debug Mode ON: synced demo markers are visible"
                  : "Debug Mode OFF: real location visibility is followed"}
              </Text>
            </Pressable>

            <SafetyStatusToggle
              value={localSafetyStatus}
              disabled={loading}
              onChange={handleToggleSafetyStatus}
              theme={theme}
            />

            <View style={styles.metricsRow}>
              <MetricCard label="Members" value={memberCount} theme={theme} />
              <MetricCard label="Safe" value={safeCount} tone="safe" theme={theme} />
              <MetricCard label="Not Safe" value={notSafeCount} tone="danger" theme={theme} />
            </View>

            {activeTab === "status" && (
              <View style={[styles.section, themed.section]}>
                {connections.length === 0 ? (
                  <View style={[styles.emptyStateCard, themed.softCard]}>
                    <Text style={[styles.emptyStateTitle, themed.text]}>No active connections yet</Text>
                    <Text style={[styles.emptyText, themed.subtext]}>
                      Join or create a group to start seeing your people here.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.pickerShell, themed.input]}>
                      <Picker
                        selectedValue={selectedConnection?.id || ""}
                        onValueChange={(value) => setSelectedConnectionId(value)}
                        style={[styles.picker, themed.text]}
                        dropdownIconColor={theme.text}
                      >
                        {connections.map((connection) => (
                          <Picker.Item
                            key={connection.id}
                            label={`Connection ${connection.code}`}
                            value={connection.id}
                          />
                        ))}
                      </Picker>
                    </View>

                    <View style={[styles.statusSummary, themed.softCard]}>
                      <View style={styles.statusSummaryTop}>
                        <Text style={[styles.statusSummaryEyebrow, themed.primaryText]}>Selected group</Text>
                        <View style={[styles.statusSummaryCount, themed.surfaceCard]}>
                          <Text style={[styles.statusSummaryCountValue, themed.text]}>
                            {selectedConnectionMembers.length}
                          </Text>
                          <Text style={[styles.statusSummaryCountLabel, themed.subtext]}>people</Text>
                        </View>
                      </View>
                      <Text style={[styles.statusSummaryTitle, themed.text]}>
                        {selectedConnection?.code || "Connection"}
                      </Text>
                      <Text style={[styles.statusSummaryMeta, themed.subtext]}>
                        {selectedConnectionMembers.length} members in this group
                      </Text>
                    </View>

                    <View style={styles.memberListCard}>
                      <View style={styles.listSectionHeader}>
                        <Text style={[styles.listSectionTitle, themed.text]}>People in this group</Text>
                        <Text style={[styles.listSectionMeta, themed.subtext]}>
                          Live safety and location updates
                        </Text>
                      </View>
                      {selectedConnectionMembers.map((member) => (
                        <View key={member.id} style={[styles.personRow, themed.card]}>
                          <View style={styles.personCopy}>
                            <Text style={[styles.personName, themed.text]}>{member.username}</Text>
                            <View style={styles.personStatusRow}>
                              <View
                                style={[
                                  styles.personStatusDotInline,
                                  { backgroundColor: member.safetyColor },
                                ]}
                              />
                              <View style={[styles.personStatus, themed.surfaceCard]}>
                                <Text
                                  style={[
                                    styles.personStatusText,
                                    { color: member.safetyColor },
                                  ]}
                                >
                                  {member.safetyLabel}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.personMeta, themed.subtext]}>
                              {!member.shareSafetyLocation
                                ? "Location sharing disabled"
                                : member.insideJaen || !member.location
                                ? member.updatedLabel
                                : "Outside the boundary of Jaen"}
                            </Text>
                          </View>
                          <View style={styles.personAvatarWrap}>
                            <Image source={{ uri: member.avatar }} style={styles.personAvatar} />
                            <View
                              style={[
                                styles.personAvatarDot,
                                {
                                  backgroundColor: member.safetyColor,
                                  borderColor: theme.card,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {activeTab === "manage" && (
              <View style={[styles.section, themed.section]}>
                <View style={styles.sectionLead}>
                  <Text style={[styles.sectionTitle, themed.text]}>Manage Connections</Text>
                  <Text style={[styles.sectionHint, themed.subtext]}>
                    Browse your groups and manage leave or delete actions.
                  </Text>
                </View>

                {connections.length === 0 ? (
                  <View style={[styles.emptyStateCard, themed.softCard]}>
                    <Text style={[styles.emptyStateTitle, themed.text]}>No active connections yet</Text>
                    <Text style={[styles.emptyText, themed.subtext]}>
                      Your connection list will appear here once you join or create one.
                    </Text>
                  </View>
                ) : (
                  connections.map((connection) => {
                    const active = selectedConnection?.id === connection.id;
                    return (
                      <View key={connection.id} style={[styles.connectionCard, themed.card]}>
                        <View style={styles.connectionCardHead}>
                          <View style={styles.connectionCardCopy}>
                            <Text style={[styles.connectionCardTitle, themed.text]}>
                              Connection {connection.code}
                            </Text>
                            <Text style={[styles.connectionCardMeta, themed.subtext]}>
                              {connection.members.length} members
                            </Text>
                          </View>
                          {active && (
                            <View style={styles.currentChip}>
                              <Text style={styles.currentChipText}>Current</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.connectionCardActions}>
                          <Pressable
                            style={styles.connectionActionPrimary}
                            onPress={() => {
                              setSelectedConnectionId(connection.id);
                              setActiveTab("status");
                            }}
                          >
                            <Text style={styles.connectionActionPrimaryText}>View</Text>
                          </Pressable>

                          {connection.isCreator ? (
                            <Pressable
                              style={styles.connectionActionDanger}
                              onPress={() => handleDeleteConnection(connection.id)}
                            >
                              <Text style={styles.connectionActionDangerText}>Delete</Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              style={[styles.connectionActionNeutral, themed.secondaryButton]}
                              onPress={() => handleLeaveConnection(connection.id)}
                            >
                              <Text style={[styles.connectionActionNeutralText, themed.text]}>Leave</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                {pendingRequests.length > 0 && (
                  <View style={[styles.pendingList, themed.card]}>
                    <View style={styles.sectionLead}>
                      <Text style={[styles.subsectionTitle, themed.text]}>Pending Requests</Text>
                      <Text style={[styles.sectionHint, themed.subtext]}>
                        Approve or reject people waiting to join your connection.
                      </Text>
                    </View>
                    {pendingRequests.map(({ connectionId, connectionCode, member }) => (
                      <View key={`${connectionId}-${member.id}`} style={[styles.pendingRow, themed.card]}>
                        <Image source={{ uri: member.avatar }} style={styles.pendingAvatar} />
                        <View style={styles.pendingCopy}>
                          <Text style={[styles.pendingName, themed.text]}>{member.name}</Text>
                          <Text style={[styles.pendingMeta, themed.subtext]}>
                            @{member.username} • Request for {connectionCode}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.approveButton,
                            {
                              backgroundColor: `${theme.primary}22`,
                              borderColor: theme.primary,
                            },
                          ]}
                          onPress={() => handleApproveRequest(connectionId, member.id)}
                        >
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.rejectButton,
                            {
                              backgroundColor: `${theme.danger}22`,
                              borderColor: theme.danger,
                            },
                          ]}
                          onPress={() => handleRejectRequest(connectionId, member.id)}
                        >
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {activeTab === "join" && (
              <View style={[styles.section, themed.section]}>
                <View style={styles.sectionLead}>
                  <Text style={[styles.sectionTitle, themed.text]}>Join / Create</Text>
                  <Text style={[styles.sectionHint, themed.subtext]}>
                    Use a code to join another group or create a new one.
                  </Text>
                </View>

                <View style={[styles.formCard, themed.card]}>
                  <Text style={[styles.formLabel, themed.text]}>Connection code</Text>
                  <TextInput
                    style={[styles.input, themed.input]}
                    value={joinCode}
                    onChangeText={(value) =>
                      setJoinCode(sanitizeConnectionCode(value))
                    }
                    placeholder="Enter connection code"
                    placeholderTextColor={theme.subtext}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                  />
                  <Pressable style={styles.joinButton} onPress={handleJoinConnection}>
                    <Text style={styles.joinButtonText}>Join Connection</Text>
                  </Pressable>
                </View>

                <View style={[styles.formCard, themed.card]}>
                  <Text style={[styles.formLabel, themed.text]}>Start a new group</Text>
                  <Text style={[styles.formHint, themed.subtext]}>
                    Create a connection and invite people using the generated code.
                  </Text>
                  <Pressable style={[styles.createWideButton, themed.secondaryButton]} onPress={handleCreateConnection}>
                    <Text style={[styles.createWideButtonText, themed.primaryText]}>Create New Connection</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <Modal
        visible={joinRequestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinRequestModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, themed.modalBackdrop]}>
          <View style={[styles.modalCard, themed.modalCard]}>
            <View style={[styles.modalIconWrap, themed.softCard]}>
              <Ionicons name="checkmark-circle" size={34} color="#1D6B41" />
            </View>
            <Text style={[styles.modalTitle, themed.text]}>Request Sent</Text>
            <Text style={[styles.modalMessage, themed.subtext]}>
              {joinRequestModalMessage}
            </Text>
            <Pressable
              style={styles.modalButton}
              onPress={() => setJoinRequestModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#E9EFE8",
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  offlineBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 126 : 104,
    left: 16,
    right: 16,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    zIndex: 14,
    elevation: 14,
  },

  offlineBannerText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  profilePinShell: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    zIndex: 2000,
    elevation: 12,
  },

  profilePin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    overflow: "hidden",
    shadowColor: "#12281A",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  profilePinAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },

  profilePinIconSurface: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  profilePinLabel: {
    position: "absolute",
    top: 51,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },

  profilePinLabelText: {
    color: "#10251B",
    fontSize: 9,
    fontWeight: "900",
  },

  panelLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  sheetTabRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 12,
  },

  sheetTabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: "rgba(251,253,250,0.98)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  sheetTabText: {
    color: "#536755",
    fontSize: 12,
    fontWeight: "800",
  },

  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#F9FCF8",
    shadowColor: "#12281A",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },

  panelDragZone: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#F9FCF8",
  },

  dragHandleWrap: {
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#BFCBB7",
  },

  panelContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 8,
  },

  sheetIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },

  sheetIntroCopy: {
    flex: 1,
  },

  sheetIntroTitle: {
    color: "#1C2B1F",
    fontSize: 18,
    fontWeight: "800",
  },

  sheetIntroSubtitle: {
    marginTop: 4,
    color: "#738174",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
  },

  sheetIntroChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetIntroChipText: {
    fontSize: 11,
    fontWeight: "800",
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#F3F8F1",
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#DCE7D8",
  },

  profileCopy: {
    flex: 1,
  },

  profileName: {
    color: "#1E2D22",
    fontSize: 16,
    fontWeight: "800",
  },

  profileMeta: {
    marginTop: 3,
    color: "#66756B",
    fontSize: 11,
    fontWeight: "600",
  },

  profileStatus: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  profileStatusText: {
    fontSize: 12,
    fontWeight: "800",
  },

  debugCard: {
    minHeight: 46,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#EEF8EA",
    borderWidth: 1,
    borderColor: "#CFE3C6",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  debugCardActive: {
    backgroundColor: "#365314",
    borderColor: "#365314",
  },

  debugCardDisabled: {
    opacity: 0.7,
  },

  debugCardText: {
    flex: 1,
    color: "#365314",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

  debugCardTextActive: {
    color: "#FFFFFF",
  },

  statusToggleCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE9D8",
    shadowColor: "#12281A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  statusToggleHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  statusToggleTitleWrap: {
    flex: 1,
  },

  statusToggleEyebrow: {
    color: "#365314",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  statusToggleTitle: {
    marginTop: 4,
    color: "#1C2B1F",
    fontSize: 14,
    fontWeight: "800",
  },

  statusToggleCurrentBadge: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusToggleCurrentDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },

  statusToggleCurrentText: {
    fontSize: 11,
    fontWeight: "900",
  },

  statusToggleRow: {
    flexDirection: "row",
    gap: 10,
  },

  statusToggleButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statusToggleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  statusToggleButtonCopy: {
    flex: 1,
  },

  statusToggleButtonText: {
    fontSize: 13,
    fontWeight: "900",
  },

  statusToggleButtonSubtext: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
  },

  section: {
    marginTop: 14,
    paddingVertical: 4,
  },

  sectionLead: {
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#203125",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },

  sectionHint: {
    marginTop: 2,
    color: "#66756B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  metricCard: {
    flex: 1,
    minHeight: 66,
    borderRadius: 18,
    backgroundColor: "#F8FAF7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2EC",
  },

  metricCardSafe: {
    backgroundColor: "#E2F2E4",
  },

  metricCardDanger: {
    backgroundColor: "#FCE7E7",
  },

  metricValue: {
    color: "#1E2D22",
    fontSize: 16,
    fontWeight: "800",
  },

  metricLabel: {
    marginTop: 4,
    color: "#66756B",
    fontSize: 10,
    fontWeight: "700",
  },

  createPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: "#365314",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  createPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  pickerShell: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F8FAF7",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EEF2EC",
  },

  picker: {
    color: "#203125",
  },

  statusSummary: {
    marginBottom: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#426838",
  },

  statusSummaryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  statusSummaryEyebrow: {
    color: "rgba(248,251,247,0.72)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0,
  },

  statusSummaryCount: {
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },

  statusSummaryCountValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  statusSummaryCountLabel: {
    marginTop: 2,
    color: "rgba(248,251,247,0.78)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  statusSummaryTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  statusSummaryMeta: {
    marginTop: 5,
    color: "rgba(248,251,247,0.8)",
    fontSize: 11,
    fontWeight: "600",
  },

  connectionCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EADF",
  },

  connectionCardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  connectionCardCopy: {
    flex: 1,
  },

  connectionCardTitle: {
    color: "#203125",
    fontSize: 14,
    fontWeight: "800",
  },

  connectionCardMeta: {
    marginTop: 3,
    color: "#66756B",
    fontSize: 12,
  },

  currentChip: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: "#DCEBDC",
    alignItems: "center",
    justifyContent: "center",
  },

  currentChipText: {
    color: "#315943",
    fontSize: 11,
    fontWeight: "800",
  },

  connectionCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  connectionActionPrimary: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "#3D5C36",
    alignItems: "center",
    justifyContent: "center",
  },

  connectionActionPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  connectionActionDanger: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "#FBEEEE",
    alignItems: "center",
    justifyContent: "center",
  },

  connectionActionDangerText: {
    color: "#991B1B",
    fontWeight: "800",
  },

  connectionActionNeutral: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "#F3F6F1",
    alignItems: "center",
    justifyContent: "center",
  },

  connectionActionNeutralText: {
    color: "#385040",
    fontWeight: "800",
  },

  connectionTabs: {
    gap: 10,
    paddingBottom: 8,
  },

  connectionChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#EEF4EB",
    borderWidth: 1,
    borderColor: "#D7E2D3",
    alignItems: "center",
    justifyContent: "center",
  },

  connectionChipActive: {
    backgroundColor: "#365314",
    borderColor: "#365314",
  },

  connectionChipText: {
    color: "#365314",
    fontWeight: "700",
  },

  connectionChipTextActive: {
    color: "#FFFFFF",
  },

  pendingList: {
    marginTop: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EADF",
  },

  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },

  pendingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#DCE7D8",
    overflow: "hidden",
  },

  pendingCopy: {
    flex: 1,
  },

  pendingName: {
    color: "#203125",
    fontWeight: "800",
  },

  pendingMeta: {
    marginTop: 2,
    color: "#66756B",
    fontSize: 12,
  },

  approveButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#EDF6EE",
    alignItems: "center",
    justifyContent: "center",
  },

  approveButtonText: {
    color: "#1D6B41",
    fontSize: 12,
    fontWeight: "800",
  },

  rejectButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FBEEEE",
    alignItems: "center",
    justifyContent: "center",
  },

  rejectButtonText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "800",
  },

  input: {
    borderWidth: 1,
    borderColor: "#E3EAE0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#FFFFFF",
    color: "#203125",
  },

  joinButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#3D5C36",
    alignItems: "center",
    justifyContent: "center",
  },

  joinButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  createWideButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#F3F6F1",
    alignItems: "center",
    justifyContent: "center",
  },

  createWideButtonText: {
    color: "#365314",
    fontWeight: "800",
  },

  subsectionTitle: {
    color: "#203125",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },

  listSectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  listSectionTitle: {
    color: "#203125",
    fontSize: 16,
    fontWeight: "800",
  },

  listSectionMeta: {
    marginTop: 4,
    color: "#708071",
    fontSize: 11,
    fontWeight: "600",
  },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#F7FBF6",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DFE9DC",
  },

  personAvatarWrap: {
    position: "relative",
    width: 54,
    height: 54,
    borderRadius: 27,
    marginLeft: 8,
    overflow: "visible",
  },

  personAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#DCE7D8",
    overflow: "hidden",
  },

  personAvatarDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  personCopy: {
    flex: 1,
    alignItems: "flex-start",
  },

  personName: {
    color: "#203125",
    fontSize: 14,
    fontWeight: "800",
  },

  personMeta: {
    marginTop: 6,
    color: "#738174",
    fontSize: 11,
    lineHeight: 16,
  },

  personStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },

  personStatusDotInline: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },

  personStatus: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF3E7",
  },

  personStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  personKick: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },

  personKickText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "800",
  },

  safetyActions: {
    flexDirection: "row",
    gap: 10,
  },

  memberListCard: {
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },

  safetyPanel: {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EADF",
  },

  safetyPanelHeader: {
    marginBottom: 12,
  },

  safetyPanelTitle: {
    color: "#1F2E22",
    fontSize: 15,
    fontWeight: "800",
  },

  safetyPanelSubtitle: {
    marginTop: 4,
    color: "#6F7E72",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
  },

  safeButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#2F7F47",
    alignItems: "center",
    justifyContent: "center",
  },

  safeButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  notSafeButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#C25151",
    alignItems: "center",
    justifyContent: "center",
  },

  notSafeButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  connectionControls: {
    marginTop: 12,
  },

  formCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EADF",
  },

  formLabel: {
    color: "#1F2E22",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },

  formHint: {
    color: "#6F7E72",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
    marginBottom: 12,
  },

  emptyStateCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EADF",
  },

  emptyStateTitle: {
    color: "#203125",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },

  secondaryDanger: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryDangerText: {
    color: "#991B1B",
    fontWeight: "800",
  },

  secondaryNeutral: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "#F6F8F5",
    borderWidth: 1,
    borderColor: "#D7E2D3",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryNeutralText: {
    color: "#385040",
    fontWeight: "800",
  },

  emptyText: {
    color: "#738176",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.34)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  modalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#EDF8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  modalTitle: {
    color: "#203125",
    fontSize: 20,
    fontWeight: "800",
  },

  modalMessage: {
    marginTop: 8,
    marginBottom: 18,
    color: "#66756B",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },

  modalButton: {
    minWidth: 120,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#365314",
    alignItems: "center",
    justifyContent: "center",
  },

  modalButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
