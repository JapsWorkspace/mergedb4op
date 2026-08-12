import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  GeoJSON,
  Polygon,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { getBasemapTileLayerProps } from "./map/mapBasemap";
import {
  FaBell,
  FaCalendarDays,
  FaCircleCheck,
  FaClock,
  FaClockRotateLeft,
  FaEye,
  FaEyeSlash,
  FaFilePdf,
  FaFilter,
  FaImage,
  FaLocationDot,
  FaMagnifyingGlass,
  FaMapLocationDot,
  FaPhone,
  FaShieldHalved,
  FaTrashCan,
  FaTriangleExclamation,
  FaUser,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import jaenGeoJSON from "./data/jaen.json";
import DashboardShell from "./layout/DashboardShell";
import "../components/css/IncidentReporting.css";
import { API_BASE_URL } from "../config/api";

const BASE_URL = API_BASE_URL;

const TOAST_LIMIT = 3;
const TOAST_DURATION = 10000;
const BOUNDS_BUFFER = 0.006;
const JAEN_MIN_ZOOM = 13;
const JAEN_FIT_MAX_ZOOM = 14.35;
const INCIDENT_MAP_FIT_PADDING = [6, 6];

const JAEN_CENTER = {
  lat: 15.3382,
  lng: 120.9056,
};

const jaenStyle = {
  color: "#08661f",
  weight: 2,
  opacity: 0.95,
  fill: false,
  dashArray: "6, 6",
  lineCap: "round",
};

const maskStyle = {
  stroke: false,
  fillColor: "#1f2937",
  fillOpacity: 0.16,
  fillRule: "evenodd",
  interactive: false,
};

function FitIncidentMapToJaen({ bounds, maxBounds, fitKey = 0 }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;

    let cancelled = false;

    const focusMap = () => {
      map.fitBounds(bounds, {
        padding: INCIDENT_MAP_FIT_PADDING,
        maxZoom: JAEN_FIT_MAX_ZOOM,
      });
      map.setMaxBounds(maxBounds || bounds);
    };

    focusMap();

    const refit = () => {
      if (!cancelled && map?._container) {
        map.invalidateSize();
        focusMap();
      }
    };

    const frame = window.requestAnimationFrame(refit);
    const timer = setTimeout(() => {
      if (!cancelled && map?._container) {
        map.invalidateSize();
        focusMap();
      }
    }, 300);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [bounds, fitKey, map, maxBounds]);

  return null;
}

const buildIncidentDivIcon = (tone, icon) =>
  L.divIcon({
    className: `incident-map-marker incident-map-marker--${tone}`,
    html: `<span class="incident-map-marker__inner" aria-hidden="true">${icon}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });

const incidentMapIcons = {
  fire: buildIncidentDivIcon(
    "fire",
    '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12.6 2.4c.5 2.8-.8 4.5-2.2 6.1-1.5 1.8-3.1 3.6-2.2 6.7.5 1.8 2.1 3.1 4 3.1 2.6 0 4.5-2 4.5-4.7 0-2.1-1.2-4-3.4-5.8.1 1.5-.4 2.6-1.4 3.4-.6.5-1.5.1-1.5-.7 0-1.7 2.3-3.7 2.2-8.1ZM12 22c-4.2 0-7.5-2.8-7.5-7 0-3.2 1.8-5.5 3.5-7.5 1.5-1.8 2.9-3.4 2.4-5.9-.1-.7.6-1.2 1.2-.8 5.1 3.3 8 7.3 8 12.3 0 5.2-3.7 8.9-7.6 8.9Z"/></svg>'
  ),
  flood: buildIncidentDivIcon(
    "flood",
    '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 2.2 7.4 8.6C6 10.6 5.3 12.4 5.3 14.2 5.3 18 8.2 21 12 21s6.7-3 6.7-6.8c0-1.8-.7-3.6-2.1-5.6L12 2.2Zm-3.8 12c.4 2.3 1.8 3.5 3.8 3.5 1.2 0 2.2-.4 3.1-1.2.4-.3.9-.3 1.2.1.3.4.3.9-.1 1.2-1.2 1.1-2.6 1.6-4.2 1.6-2.9 0-5-1.8-5.5-4.9-.1-.5.2-.9.7-1 .5-.1.9.2 1 .7Z"/></svg>'
  ),
  quake: buildIncidentDivIcon(
    "quake",
    '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M11.2 2h6.1l-3.2 6.2H19L9.8 22l1.7-9H6l5.2-11Z"/></svg>'
  ),
  storm: buildIncidentDivIcon(
    "storm",
    '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12.8 3a7.5 7.5 0 0 1 6.8 4.4 5.4 5.4 0 0 0-4.7-1.4 5.2 5.2 0 0 0-4.3 4.4 3.6 3.6 0 0 1-2.4-3.4C8.2 4.8 10 3 12.8 3ZM4.1 11.5a7.5 7.5 0 0 0 5.6 6.4 5.4 5.4 0 0 1-1-4.8 5.2 5.2 0 0 1 4.8-3.8 3.6 3.6 0 0 0-3.1-2.8c-2.8-.4-5.5 1.7-6.3 5Zm15.8 1a7.5 7.5 0 0 1-6.2 7.1 5.4 5.4 0 0 0 3.7-3.3 5.2 5.2 0 0 0-1.4-5.9 3.6 3.6 0 0 1 3.8.8c1.8 1.7 1.6 3.8.1 1.3Z"/></svg>'
  ),
  default: buildIncidentDivIcon("default", "!"),
};

const getIncidentMapIcon = (incident) => {
  const type = safeLower(incident?.type);
  if (type.includes("fire")) return incidentMapIcons.fire;
  if (type.includes("flood")) return incidentMapIcons.flood;
  if (type.includes("earthquake") || type.includes("quake")) {
    return incidentMapIcons.quake;
  }
  if (type.includes("typhoon") || type.includes("storm")) {
    return incidentMapIcons.storm;
  }
  return incidentMapIcons.default;
};

function getBarangayPaletteSeed(colorKey = "") {
  const normalized = safeLower(colorKey);
  if (!normalized) return 0;

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 1000003;
  }

  return hash;
}

function getBarangayColorParts(colorKey = "", fallbackIndex = 0) {
  const normalized = safeLower(colorKey);

  if (normalized === "hilera") {
    return { hue: 132, saturation: 68, lightness: 42 };
  }

  const seed = normalized ? getBarangayPaletteSeed(normalized) : fallbackIndex;
  const hue = Math.round((seed * 137.508 + 24) % 360);
  const saturationCycle = [78, 64, 86, 58];
  const lightnessCycle = [48, 60, 42, 66];
  const saturation = saturationCycle[seed % saturationCycle.length];
  const lightness = lightnessCycle[seed % lightnessCycle.length];

  return { hue, saturation, lightness };
}

function getBarangayOutlineColor(colorKey = "", fallbackIndex = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(
    colorKey,
    fallbackIndex
  );
  return `hsl(${hue}, ${Math.min(88, saturation + 8)}%, ${Math.max(34, lightness - 8)}%)`;
}

function getBarangayFillColor(colorKey = "", fallbackIndex = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(
    colorKey,
    fallbackIndex
  );
  return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.54)`;
}

const safeLower = (value) => String(value ?? "").toLowerCase().trim();

const formatNumber = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  return new Intl.NumberFormat().format(num);
};

const formatDateTime = (value) => {
  if (!value) return "Unknown date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatTimestamp = (ts) => {
  if (!ts) return "Unknown date";

  const numericTs = Number(ts);
  const date = new Date(
    numericTs > 1_000_000_000_000 ? numericTs : numericTs * 1000
  );

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const INCIDENT_PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4,
};

const getIncidentCreatedTime = (incident = {}) => {
  const candidates = [
    incident.createdAt,
    incident.date,
    incident.reportedAt,
    incident.updatedAt,
  ];

  for (const value of candidates) {
    if (!value) continue;

    if (typeof value === "number") {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }

    if (typeof value === "object" && typeof value.seconds === "number") {
      return value.seconds * 1000;
    }

    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
};

const getIncidentPriority = (incident = {}) => {
  const normalized = safeLower(incident.level);

  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";

  return "unknown";
};

const getIncidentWorkflowStatus = (incident = {}) => {
  const normalized = safeLower(incident.status);

  if (normalized === "resolved") return "resolved";
  if (
    normalized === "approved" ||
    normalized === "on_process" ||
    normalized === "onprocess"
  ) {
    return "onProcess";
  }

  return "reported";
};

const isIncidentRejected = (incident = {}) => {
  const verificationStatus = safeLower(incident.verification?.status);
  const incidentStatus = safeLower(incident.status);

  return verificationStatus === "rejected" || incidentStatus === "rejected";
};

const isIncidentApprovedForQueue = (incident = {}) => {
  const verificationStatus = safeLower(incident.verification?.status);
  const workflowStatus = getIncidentWorkflowStatus(incident);

  if (isIncidentRejected(incident) || workflowStatus === "resolved") return false;

  return verificationStatus === "approved" || workflowStatus === "onProcess";
};

const sortIncidentsByPriorityThenNewest = (items = []) => {
  return [...items].sort((a, b) => {
    if (isIncidentRejected(a) !== isIncidentRejected(b)) {
      return Number(isIncidentRejected(a)) - Number(isIncidentRejected(b));
    }

    const aPriority =
      INCIDENT_PRIORITY_ORDER[getIncidentPriority(a)] ??
      INCIDENT_PRIORITY_ORDER.unknown;
    const bPriority =
      INCIDENT_PRIORITY_ORDER[getIncidentPriority(b)] ??
      INCIDENT_PRIORITY_ORDER.unknown;

    if (aPriority !== bPriority) return aPriority - bPriority;

    return getIncidentCreatedTime(b) - getIncidentCreatedTime(a);
  });
};

const getIncidentStatusLabel = (incident) => {
  const workflowStatus = getIncidentWorkflowStatus(
    typeof incident === "string" ? { status: incident } : incident
  );

  if (workflowStatus === "reported") return "Reported";
  if (workflowStatus === "onProcess") return "On Process";
  if (workflowStatus === "resolved") return "Resolved";
  return "Reported";
};

const getIncidentStatusTone = (incident) => {
  const workflowStatus = getIncidentWorkflowStatus(
    typeof incident === "string" ? { status: incident } : incident
  );

  if (workflowStatus === "reported") return "warning";
  if (workflowStatus === "onProcess") return "info";
  if (workflowStatus === "resolved") return "success";
  return "neutral";
};

const getVerificationTone = (status) => {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
};

const getSeverityLabel = (level) => {
  const normalized = safeLower(level);
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";
  return "unknown";
};

const truncateLocation = (location, max = 62) => {
  const raw = String(location || "").trim();
  if (!raw) return "Unknown location";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max).trim()}...`;
};

const getIncidentTypeAccent = (type) => {
  const normalized = safeLower(type);
  if (normalized.includes("flood")) return "flood";
  if (normalized.includes("fire")) return "fire";
  if (normalized.includes("earthquake") || normalized.includes("quake")) return "quake";
  return "general";
};

function extractOuterRings(geojson) {
  const rings = [];
  if (!geojson) return rings;

  const features =
    geojson.type === "FeatureCollection"
      ? geojson.features
      : geojson.type === "Feature"
      ? [geojson]
      : [];

  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return;

    if (geometry.type === "Polygon") {
      if (geometry.coordinates?.[0]) {
        rings.push(geometry.coordinates[0]);
      }
    }

    if (geometry.type === "MultiPolygon") {
      geometry.coordinates?.forEach((polygon) => {
        if (polygon?.[0]) {
          rings.push(polygon[0]);
        }
      });
    }
  });

  return rings;
}

function buildInverseMaskGeoJSON(geojson) {
  const outerWorldRing = [
    [-180, 90],
    [180, 90],
    [180, -90],
    [-180, -90],
    [-180, 90],
  ];

  const holes = extractOuterRings(geojson);

  return {
    type: "Feature",
    properties: { name: "Jaen Outside Mask" },
    geometry: {
      type: "Polygon",
      coordinates: [outerWorldRing, ...holes],
    },
  };
}

function isPointInsideJaen(lat, lng) {
  try {
    const clicked = turfPoint([lng, lat]);

    if (jaenGeoJSON.type === "FeatureCollection") {
      return jaenGeoJSON.features.some((feature) =>
        booleanPointInPolygon(clicked, feature)
      );
    }

    if (jaenGeoJSON.type === "Feature") {
      return booleanPointInPolygon(clicked, jaenGeoJSON);
    }

    return false;
  } catch (error) {
    console.error("Jaen polygon check failed:", error);
    return false;
  }
}

const normalizeBarangayKey = (value) =>
  safeLower(value).replace(/\s+/g, " ").trim();

const countGeometryVertices = (geometry) => {
  if (!geometry) return 0;

  if (geometry.type === "Polygon") {
    return geometry.coordinates?.flat(1)?.length || 0;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates?.flat(2)?.length || 0;
  }

  return 0;
};

const getBarangayBoundsLabel = (entry, index = 0) => {
  return (
    entry?.barangayName ||
    entry?.name ||
    entry?.properties?.barangayName ||
    entry?.properties?.name ||
    entry?.properties?.NAME ||
    entry?.properties?.adm4_en ||
    entry?.properties?.barangay ||
    entry?.features?.[0]?.properties?.barangayName ||
    entry?.features?.[0]?.properties?.name ||
    entry?.features?.[0]?.properties?.NAME ||
    entry?.features?.[0]?.properties?.adm4_en ||
    entry?.features?.[0]?.properties?.barangay ||
    `Barangay ${index + 1}`
  );
};

const getBarangayBoundsGeoJSON = (entry) => {
  if (!entry) return null;

  if (entry.type === "FeatureCollection" || Array.isArray(entry.features)) {
    const polygonFeatures = (entry.features || []).filter((feature) => {
      const type = feature?.geometry?.type;
      return type === "Polygon" || type === "MultiPolygon";
    });

    if (!polygonFeatures.length) return null;

    const chosenFeature =
      [...polygonFeatures].sort(
        (a, b) =>
          countGeometryVertices(b?.geometry) - countGeometryVertices(a?.geometry)
      )[0] || null;

    return chosenFeature
      ? {
          type: "Feature",
          properties: {
            ...(entry.properties || {}),
            ...(chosenFeature.properties || {}),
          },
          geometry: chosenFeature.geometry,
        }
      : null;
  }

  if (entry.type === "Feature") return entry;

  const geometry = entry.features?.[0]?.geometry || entry.geometry;
  if (!geometry) return null;

  return {
    type: "Feature",
    properties: entry.properties || entry.features?.[0]?.properties || {},
    geometry,
  };
};

const ringToLeafletPositions = (ring = []) =>
  ring.map(([lng, lat]) => [lat, lng]);

const geometryToLeafletPolygons = (geometry) => {
  if (!geometry) return [];

  if (geometry.type === "Polygon") {
    return [geometry.coordinates.map(ringToLeafletPositions)];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) =>
      polygon.map(ringToLeafletPositions)
    );
  }

  return [];
};

const getPolygonCenter = (polygon) => {
  try {
    return L.polygon(polygon).getBounds().getCenter();
  } catch (error) {
    return null;
  }
};

const getIncidentBarangayName = (incident = {}) => {
  return (
    incident.barangay ||
    incident.barangayName ||
    incident.reporterBarangay ||
    incident.locationBarangay ||
    ""
  );
};

const isIncidentInsideBarangay = (incident, boundsGeoJSON) => {
  const lat = Number(incident?.latitude);
  const lng = Number(incident?.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng) || !boundsGeoJSON) return false;

  try {
    return booleanPointInPolygon(turfPoint([lng, lat]), boundsGeoJSON);
  } catch (error) {
    return false;
  }
};

const getIncidentMarkerPosition = (incident, barangayBounds = []) => {
  const lat = Number(incident?.latitude);
  const lng = Number(incident?.longitude);

  if (!Number.isNaN(lat) && !Number.isNaN(lng) && isPointInsideJaen(lat, lng)) {
    return [lat, lng];
  }

  const barangayHint = normalizeBarangayKey(
    getIncidentBarangayName(incident) || incident?.location
  );

  const matchedBounds = barangayBounds.find((entry, index) => {
    const label = normalizeBarangayKey(getBarangayBoundsLabel(entry, index));
    return label && barangayHint && barangayHint.includes(label);
  });

  const geoJSON = getBarangayBoundsGeoJSON(matchedBounds);
  const geometry = geoJSON?.geometry;
  const polygons = geometryToLeafletPolygons(geometry).filter(
    (polygon) => Array.isArray(polygon?.[0]) && polygon[0].length >= 3
  );
  const center = polygons.length ? getPolygonCenter(polygons[0]) : null;

  return center ? [center.lat, center.lng] : null;
};

const getIncidentBarangayTone = (count, maxCount) => {
  if (!count) return "normal";

  const highThreshold = Math.max(3, Math.ceil(maxCount * 0.6));
  if (count >= highThreshold) return "high";
  return "active";
};

const buildIncidentBarangayStyle = ({ label = "", index, count, maxCount }) => {
  const tone = getIncidentBarangayTone(count, maxCount);

  if (tone === "high") {
    return {
      color: "#b91c1c",
      weight: 3,
      opacity: 0.96,
      fillColor: "#ef4444",
      fillOpacity: 0.48,
    };
  }

  if (tone === "active") {
    return {
      color: "#c2410c",
      weight: 2.5,
      opacity: 0.92,
      fillColor: "#f97316",
      fillOpacity: 0.34,
    };
  }

  return {
    color: getBarangayOutlineColor(label, index),
    weight: 2,
    opacity: 0.9,
    fillColor: getBarangayFillColor(label, index),
    fillOpacity: 0.42,
  };
};

function SummaryCard({ tone, icon, label, value, sub, urgent = false }) {
  return (
    <div className={`incident-summary-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="incident-summary-card-top">
        <span className="incident-summary-icon" aria-hidden="true">
          {icon}
        </span>

        {urgent && (
          <span className="incident-summary-alert-dot" title="Needs attention">
            !
          </span>
        )}
      </div>

      <div className="incident-summary-label">{label}</div>
      <div className="incident-summary-value">{value}</div>
      <div className="incident-summary-sub">{sub}</div>
    </div>
  );
}

export default function IncidentReport() {
  const navigate = useNavigate();
  const detailsRef = useRef(null);
  const basemapTileProps = useMemo(() => getBasemapTileLayerProps(), []);
  const notificationTimersRef = useRef({});
  const thresholdSignatureRef = useRef("");

  const [incidents, setIncidents] = useState([]);
  const [barangayBounds, setBarangayBounds] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [statusMap, setStatusMap] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loadingPage, setLoadingPage] = useState(true);

  const [landingIncidentMode, setLandingIncidentMode] = useState("all");
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [incidentActionModal, setIncidentActionModal] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historySummary, setHistorySummary] = useState({
    total: 0,
    resolved: 0,
    deleted: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");

  const [search, setSearch] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");

  useEffect(() => {
    const storedRole = localStorage.getItem("role");
    if (!storedRole) navigate("/");
  }, [navigate]);

  useEffect(() => {
    const timers = notificationTimersRef.current;

    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const pushNotification = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setNotifications((prev) =>
      [{ id, message, type }, ...prev].slice(0, TOAST_LIMIT)
    );

    if (notificationTimersRef.current[id]) {
      clearTimeout(notificationTimersRef.current[id]);
    }

    notificationTimersRef.current[id] = setTimeout(() => {
      setNotifications((prev) =>
        prev.filter((notification) => notification.id !== id)
      );
      delete notificationTimersRef.current[id];
    }, TOAST_DURATION);
  }, []);

  const removeNotification = useCallback((id) => {
    if (notificationTimersRef.current[id]) {
      clearTimeout(notificationTimersRef.current[id]);
      delete notificationTimersRef.current[id];
    }

    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id)
    );
  }, []);

  const getNotificationIcon = useCallback((type) => {
    if (type === "success") return "✓";
    if (type === "error" || type === "warning") return "!";
    return "i";
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/incident/getIncidents`, {
        withCredentials: true,
      });

      const payload = Array.isArray(res.data) ? res.data : [];
      setIncidents(payload);
    } catch (error) {
      console.error("Fetch incidents error:", error);
      pushNotification("Failed to load incident reports.", "error");
    } finally {
      setLoadingPage(false);
    }
  }, [pushNotification]);

  const fetchBarangayBounds = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/barangays/bounds`, {
        withCredentials: true,
      });

      const payload = Array.isArray(res.data) ? res.data : [];
      setBarangayBounds(payload);
    } catch (error) {
      console.error("Fetch barangay bounds error:", error);
      setBarangayBounds([]);
    }
  }, []);

  const fetchLandingIncidentMode = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/public-site`, {
        withCredentials: true,
      });
      const source = res?.data?.data || res?.data || {};
      const nextMode =
        source?.incidentFeedMode === "resolved-only" ? "resolved-only" : "all";
      setLandingIncidentMode(nextMode);
    } catch (error) {
      console.error("Fetch incident landing mode error:", error);
      setLandingIncidentMode("all");
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    fetchBarangayBounds();
    fetchLandingIncidentMode();
  }, [fetchIncidents, fetchBarangayBounds, fetchLandingIncidentMode]);

  const fetchIncidentHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const params = new URLSearchParams();
      if (historyFilter !== "all") params.set("filter", historyFilter);
      if (historySearch.trim()) params.set("search", historySearch.trim());

      const res = await axios.get(`${BASE_URL}/incident/history?${params.toString()}`, {
        withCredentials: true,
      });

      setHistoryItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setHistorySummary(
        res.data?.summary || {
          total: 0,
          resolved: 0,
          deleted: 0,
        }
      );
    } catch (error) {
      console.error("Fetch incident history error:", error);
      setHistoryItems([]);
      setHistorySummary({
        total: 0,
        resolved: 0,
        deleted: 0,
      });
      pushNotification("Failed to load incident history.", "error");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilter, historySearch, pushNotification]);

  useEffect(() => {
    if (!historyOpen) return;
    fetchIncidentHistory();
  }, [fetchIncidentHistory, historyOpen]);

  const jaenBounds = useMemo(() => {
    if (!jaenGeoJSON) return null;
    return L.geoJSON(jaenGeoJSON).getBounds();
  }, []);

  const allowedBounds = useMemo(() => {
    if (!jaenBounds) return null;

    return L.latLngBounds([
      [
        jaenBounds.getSouthWest().lat - BOUNDS_BUFFER,
        jaenBounds.getSouthWest().lng - BOUNDS_BUFFER,
      ],
      [
        jaenBounds.getNorthEast().lat + BOUNDS_BUFFER,
        jaenBounds.getNorthEast().lng + BOUNDS_BUFFER,
      ],
    ]);
  }, [jaenBounds]);

  const initialMapCenter = useMemo(() => {
    if (!jaenBounds) return [JAEN_CENTER.lat, JAEN_CENTER.lng];

    const center = jaenBounds.getCenter();
    return [center.lat, center.lng];
  }, [jaenBounds]);

  const maskGeoJSON = useMemo(() => buildInverseMaskGeoJSON(jaenGeoJSON), []);

  const selectedIncident = useMemo(() => {
    return (
      incidents.find((item) => String(item._id) === String(selectedIncidentId)) ||
      null
    );
  }, [incidents, selectedIncidentId]);

  const summary = useMemo(() => {
    const total = incidents.length;

    const reported = incidents.filter(
      (item) => getIncidentWorkflowStatus(item) === "reported"
    ).length;

    const onProcess = incidents.filter(
      (item) => getIncidentWorkflowStatus(item) === "onProcess"
    ).length;

    const resolved = incidents.filter(
      (item) => getIncidentWorkflowStatus(item) === "resolved"
    ).length;

    const highSeverity = incidents.filter((item) =>
      ["critical", "high"].includes(getIncidentPriority(item))
    ).length;

    const aiPending = incidents.filter(
      (item) => (item.verification?.status || "pending") === "pending"
    ).length;

    return {
      total,
      reported,
      onProcess,
      resolved,
      highSeverity,
      aiPending,
    };
  }, [incidents]);

  useEffect(() => {
    const signature = [
      summary.highSeverity > 0 ? "high-severity" : "",
      summary.reported >= 4 ? "many-reported" : "",
      summary.aiPending >= 3 ? "ai-backlog" : "",
    ]
      .filter(Boolean)
      .join("|");

    if (!signature || thresholdSignatureRef.current === signature) return;

    thresholdSignatureRef.current = signature;

    if (summary.highSeverity > 0) {
      pushNotification(
        `${formatNumber(summary.highSeverity)} high-severity incident(s) detected.`,
        "error"
      );
    }

    if (summary.reported >= 4) {
      pushNotification(
        `${formatNumber(summary.reported)} incidents are still waiting for active handling.`,
        "warning"
      );
    }

    if (summary.aiPending >= 3) {
      pushNotification(
        `${formatNumber(summary.aiPending)} incidents still need AI/manual review.`,
        "warning"
      );
    }
  }, [pushNotification, summary]);

  const getAIReviewSummary = useCallback((verification = {}) => {
    const status = verification.status || "pending";
    const confidence = Number(verification.confidence ?? 0);

    const matchedLabels = Array.isArray(verification.matchedLabels)
      ? verification.matchedLabels
      : [];

    const labels = Array.isArray(verification.labels) ? verification.labels : [];
    const metadata = verification.metadata || {};
    const reasoning = String(verification.reasoning || "").trim();

    const allLabels = [...matchedLabels, ...labels].filter(Boolean);
    const labelsText = allLabels.length
      ? allLabels.join(", ")
      : "No detected labels";

    let inferredVerdict = "Needs manual review.";

    if (status === "approved") {
      inferredVerdict = "Approved by AI.";
    } else if (status === "rejected") {
      inferredVerdict = "Rejected by AI.";
    } else if (confidence >= 70 && allLabels.length > 0) {
      inferredVerdict = "Likely valid incident.";
    } else if (confidence > 0 && allLabels.length > 0) {
      inferredVerdict = "Partially matched incident indicators.";
    }

    return {
      status,
      confidence,
      score: Number(verification.score ?? confidence ?? 0),
      verdict: inferredVerdict,
      matchText:
        matchedLabels.length > 0
          ? matchedLabels.join(", ")
          : "No detected labels",
      metaText: [
        metadata.hasGPS ? "GPS present" : "no GPS",
        metadata.isRecent ? "recent" : "not recent",
        metadata.isWithinArea ? "within Jaen" : "outside Jaen / unknown area",
      ].join(" • "),
      reasoning:
        reasoning ||
        "No AI reasoning data was returned yet. Manual review is still required.",
      labelsText,
      metadata,
    };
  }, []);

  const baseFilteredIncidents = useMemo(() => {
    const term = safeLower(search);

    let list = [...incidents];

    if (term) {
      list = list.filter((item) => {
        const ai = getAIReviewSummary(item.verification);

        return (
          safeLower(item.type).includes(term) ||
          safeLower(item.level).includes(term) ||
          safeLower(item.location).includes(term) ||
          safeLower(item.description).includes(term) ||
          safeLower(item.usernames).includes(term) ||
          safeLower(item.phone).includes(term) ||
          safeLower(ai.status).includes(term) ||
          safeLower(ai.verdict).includes(term)
        );
      });
    }

    if (incidentStatusFilter !== "all") {
      list = list.filter((item) => {
        const status = getIncidentWorkflowStatus(item);
        return status === incidentStatusFilter;
      });
    }

        if (verificationFilter !== "all") {
      list = list.filter((item) => {
        const status = item.verification?.status || "pending";
        return status === verificationFilter;
      });
    }

    return list;
  }, [
    getAIReviewSummary,
    incidentStatusFilter,
    incidents,
    search,
    verificationFilter,
  ]);

  const activeQueueIncidents = useMemo(() => {
    const visibleActive = baseFilteredIncidents.filter((item) => {
      const workflowStatus = getIncidentWorkflowStatus(item);
      return workflowStatus !== "resolved" && !isIncidentApprovedForQueue(item);
    });

    return sortIncidentsByPriorityThenNewest(visibleActive);
  }, [baseFilteredIncidents]);

  const approvedQueueIncidents = useMemo(() => {
    const approved = baseFilteredIncidents.filter(
      (item) => isIncidentApprovedForQueue(item)
    );

    return sortIncidentsByPriorityThenNewest(approved);
  }, [baseFilteredIncidents]);

  const visibleMapIncidents = useMemo(() => {
    return sortIncidentsByPriorityThenNewest(
      baseFilteredIncidents.filter(
        (item) => getIncidentWorkflowStatus(item) !== "resolved"
      )
    );
  }, [baseFilteredIncidents]);

  const incidentCountsByBarangay = useMemo(() => {
    const counts = new Map();

    visibleMapIncidents.forEach((incident) => {
      const directBarangay = normalizeBarangayKey(getIncidentBarangayName(incident));

      if (directBarangay) {
        counts.set(directBarangay, (counts.get(directBarangay) || 0) + 1);
        return;
      }

      const matchedBounds = barangayBounds.find((bounds) =>
        isIncidentInsideBarangay(incident, getBarangayBoundsGeoJSON(bounds))
      );

      if (!matchedBounds) return;

      const matchedName = normalizeBarangayKey(
        getBarangayBoundsLabel(matchedBounds)
      );

      if (matchedName) {
        counts.set(matchedName, (counts.get(matchedName) || 0) + 1);
      }
    });

    return counts;
  }, [barangayBounds, visibleMapIncidents]);

  const maxIncidentBarangayCount = useMemo(() => {
    return Math.max(0, ...Array.from(incidentCountsByBarangay.values()));
  }, [incidentCountsByBarangay]);

  const selectionCandidates = useMemo(() => {
    const seen = new Set();
    return [...activeQueueIncidents, ...approvedQueueIncidents, ...visibleMapIncidents].filter(
      (item) => {
        const key = String(item?._id || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }
    );
  }, [activeQueueIncidents, approvedQueueIncidents, visibleMapIncidents]);

  useEffect(() => {
    if (!selectionCandidates.length) {
      setSelectedIncidentId(null);
      return;
    }

    if (!selectedIncidentId) {
      setSelectedIncidentId(selectionCandidates[0]._id);
      return;
    }

    const stillVisible = selectionCandidates.some(
      (item) => String(item._id) === String(selectedIncidentId)
    );

    if (!stillVisible) {
      setSelectedIncidentId(selectionCandidates[0]._id);
    }
  }, [selectionCandidates, selectedIncidentId]);

  const handleQueueSelect = useCallback((incidentId) => {
    setSelectedIncidentId(incidentId);

    setTimeout(() => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }, []);

  const handleStatusChange = async (incidentId, nextStatus) => {
    try {
      const incident = incidents.find((item) => item._id === incidentId);

      await axios.put(
        `${BASE_URL}/incident/updateStatus/${incidentId}`,
        { status: nextStatus },
        { withCredentials: true }
      );

      await axios.post(
        `${BASE_URL}/history/registerHistory`,
        {
          action: "STATUS_UPDATE",
          placeName: incident?.location,
          details: incident?.description,
        },
        { withCredentials: true }
      );

      setIncidents((prev) =>
        prev.map((item) =>
          item._id === incidentId ? { ...item, status: nextStatus } : item
        )
      );

      setStatusMap((prev) => ({ ...prev, [incidentId]: nextStatus }));

      pushNotification(
        `Incident status updated to ${getIncidentStatusLabel(nextStatus)}.`,
        "success"
      );
    } catch (error) {
      console.error("Update status error:", error);
      pushNotification("Failed to update incident status.", "error");
    }
  };

  const handleVerifyOverride = async (incidentId, nextStatus) => {
    try {
      const normalizedStatus = safeLower(nextStatus);
      const rootBaseUrl = String(BASE_URL || "").replace(/\/+$/, "");
      const primaryUrl = `${rootBaseUrl}/incident/updateVerification/${incidentId}`;
      const fallbackUrl = `${rootBaseUrl.replace(/\/api$/i, "")}/api/incident/updateVerification/${incidentId}`;

      let res = null;
      try {
        res = await axios.put(
          primaryUrl,
          { status: normalizedStatus },
          { withCredentials: true }
        );
      } catch (primaryError) {
        const primaryStatus = primaryError?.response?.status;

        if (primaryStatus === 404) {
          res = await axios.put(
            fallbackUrl,
            { status: normalizedStatus },
            { withCredentials: true }
          );
        } else {
          throw primaryError;
        }
      }

      const updatedIncident = res?.data?.incident;

      if (updatedIncident) {
        setIncidents((prev) =>
          prev.map((item) => (item._id === incidentId ? updatedIncident : item))
        );
      } else {
        setIncidents((prev) =>
          prev.map((item) =>
            item._id === incidentId
              ? {
                  ...item,
                  verification: {
                    ...(item.verification || {}),
                    status: normalizedStatus,
                  },
                }
              : item
          )
        );
      }

      pushNotification(
  normalizedStatus === "approved"
    ? "AI approved. Incident is now visible on mobile map."
    : `AI verification marked as ${normalizedStatus}.`,
  normalizedStatus === "approved" ? "success" : "warning"
);
    } catch (error) {
      console.error("Update AI verification error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to update AI verification.",
        "error"
      );
    }
  };

  const handleReverify = async (incidentId) => {
    try {
      const res = await axios.put(
        `${BASE_URL}/incident/reverify/${incidentId}`,
        {},
        { withCredentials: true }
      );

      const updatedIncident =
        res?.data?.incident ||
        res?.data?.data ||
        res?.data ||
        null;

      if (updatedIncident && updatedIncident._id) {
        setIncidents((prev) =>
          prev.map((item) => (item._id === incidentId ? updatedIncident : item))
        );
      } else {
        await fetchIncidents();
      }

      pushNotification("AI re-verification completed.", "info");
    } catch (error) {
      console.error("Reverify error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to re-verify incident image.",
        "error"
      );
    }
  };

  const handleDelete = async (incidentId) => {
    const incident = incidents.find((item) => item._id === incidentId);

    try {
      await axios.post(
        `${BASE_URL}/history/registerHistory`,
        {
          action: "DELETE",
          placeName: incident?.location,
          details: incident?.description,
        },
        { withCredentials: true }
      );

      await axios.delete(`${BASE_URL}/incident/delete/${incidentId}`, {
        withCredentials: true,
      });

      setIncidents((prev) => prev.filter((item) => item._id !== incidentId));

      setStatusMap((prev) => {
        const copy = { ...prev };
        delete copy[incidentId];
        return copy;
      });

      pushNotification("Incident report deleted.", "warning");
    } catch (error) {
      console.error("Delete incident error:", error);
      pushNotification("Failed to delete incident report.", "error");
    }
  };

  const openIncidentActionModal = (type, incident) => {
    if (!incident?._id) return;
    setIncidentActionModal({
      type,
      incidentId: incident._id,
      incidentType: incident.type || "Incident",
    });
  };

  const closeIncidentActionModal = () => {
    setIncidentActionModal(null);
  };

  const confirmIncidentAction = async () => {
    if (!incidentActionModal?.incidentId) return;

    const { type, incidentId } = incidentActionModal;

    if (type === "delete") {
      await handleDelete(incidentId);
    }

    if (type === "onProcess") {
      await handleStatusChange(incidentId, "onProcess");
    }

    if (type === "resolved") {
      await handleStatusChange(incidentId, "resolved");
    }

    closeIncidentActionModal();
  };

  const handleExportIncidentPdf = useCallback(
    (incidentId) => {
      if (!incidentId) {
        pushNotification("Select an incident first before exporting PDF.", "warning");
        return;
      }

      const exportUrl = `${BASE_URL}/incident/export-pdf/${incidentId}`;
      window.open(exportUrl, "_blank", "noopener,noreferrer");
    },
    [pushNotification]
  );

  const handleLandingIncidentModeToggle = useCallback(async () => {
    const nextMode =
      landingIncidentMode === "resolved-only" ? "all" : "resolved-only";

    try {
      await axios.put(
        `${BASE_URL}/api/public-site/incident-feed-mode`,
        { mode: nextMode },
        { withCredentials: true }
      );

      setLandingIncidentMode(nextMode);
      pushNotification(
        nextMode === "resolved-only"
          ? "Landing page now shows resolved incidents only."
          : "Landing page now shows all incidents.",
        "success"
      );
    } catch (error) {
      console.error("Incident landing mode toggle error:", error);
      pushNotification(
        error?.response?.data?.message ||
          "Failed to update landing incident visibility mode.",
        "error"
      );
    }
  }, [landingIncidentMode, pushNotification]);

  const renderNotifications = () => {
    if (!notifications.length) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
      <div className="notification-stack" role="status" aria-live="polite">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            className={`notification-toast ${notification.type}`}
            onClick={() => removeNotification(notification.id)}
          >
            <span className="notification-icon" aria-hidden="true">
              {getNotificationIcon(notification.type)}
            </span>
            <span className="notification-text">{notification.message}</span>
          </button>
        ))}
      </div>,
      document.body
    );
  };

  const renderImageModal = () => {
    if (!imagePreviewOpen || !selectedIncident?.image?.fileUrl) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        className="incident-image-modal"
        onClick={() => setImagePreviewOpen(false)}
      >
        <div
          className="incident-image-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="incident-image-close"
            onClick={() => setImagePreviewOpen(false)}
          >
            ×
          </button>

          <img
            src={selectedIncident.image.fileUrl}
            alt="incident full preview"
          />
        </div>
      </div>,
      document.body
    );
  };

  const renderHistoryModal = () => {
    if (!historyOpen) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        className="incident-history-modal"
        onClick={() => setHistoryOpen(false)}
      >
        <div
          className="incident-history-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="incident-history-modal-head">
            <div>
              <span className="incident-history-kicker">Records</span>
              <h3>Incident History</h3>
              <p>Review resolved and deleted incident records without leaving the queue.</p>
            </div>

            <button
              type="button"
              className="incident-history-close"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close incident history"
            >
              ×
            </button>
          </div>

          <div className="incident-history-summary">
            <div className="incident-history-stat">
              <span>Total</span>
              <strong>{formatNumber(historySummary.total)}</strong>
            </div>
            <div className="incident-history-stat">
              <span>Resolved</span>
              <strong>{formatNumber(historySummary.resolved)}</strong>
            </div>
            <div className="incident-history-stat">
              <span>Deleted</span>
              <strong>{formatNumber(historySummary.deleted)}</strong>
            </div>
          </div>

          <div className="incident-history-toolbar">
            <label className="incident-history-field">
              <span>Status</span>
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              >
                <option value="all">All records</option>
                <option value="resolved">Resolved</option>
                <option value="deleted">Deleted</option>
              </select>
            </label>

            <label className="incident-history-field incident-history-field-search">
              <span>Search</span>
              <input
                type="text"
                placeholder="Search location, type, actor..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </label>
          </div>

          <div className="incident-history-list">
            {historyLoading ? (
              <div className="incident-history-empty">
                <strong>Loading incident history...</strong>
                <span>Checking resolved and deleted records.</span>
              </div>
            ) : historyItems.length ? (
              historyItems.map((item) => (
                <article
                  key={item._id}
                  className={`incident-history-item incident-history-item-${item.eventType}`}
                >
                  <div className="incident-history-item-top">
                    <div>
                      <h4>{item.type || "Incident"}</h4>
                      <p>{item.location || "Unknown location"}</p>
                    </div>

                    <span className={`mini-status ${item.eventType === "deleted" ? "danger" : "success"}`}>
                      {item.eventType}
                    </span>
                  </div>

                  <div className="incident-history-item-meta">
                    <span>{item.level || "-"}</span>
                    <span>{item.actorName || "System"} • {item.actorRole || "system"}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>

                  <p className="incident-history-item-copy">
                    {item.description || "No additional details available."}
                  </p>
                </article>
              ))
            ) : (
              <div className="incident-history-empty">
                <strong>No incident history found</strong>
                <span>Try another filter or wait for more resolved or deleted records.</span>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderIncidentActionModal = () => {
    if (!incidentActionModal) return null;
    if (typeof document === "undefined") return null;

    const isDelete = incidentActionModal.type === "delete";
    const isOnProcess = incidentActionModal.type === "onProcess";
    const actionLabel = isDelete
      ? "Delete Incident"
      : isOnProcess
      ? "Mark On Process"
      : "Mark Resolved";
    const actionCopy = isDelete
      ? "This will remove the incident record from the active system view."
      : isOnProcess
      ? "This will move the incident into the on process workflow state."
      : "This will mark the incident as resolved and remove it from the active queue.";

    return createPortal(
      <div
        className="incident-action-modal"
        onClick={closeIncidentActionModal}
      >
        <div
          className="incident-action-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="incident-action-modal-head">
            <div>
              <span className="incident-history-kicker">Confirm Action</span>
              <h3>{actionLabel}</h3>
              <p>
                {actionCopy} Incident:{" "}
                <strong>{incidentActionModal.incidentType}</strong>
              </p>
            </div>

            <button
              type="button"
              className="incident-history-close"
              onClick={closeIncidentActionModal}
            >
              ×
            </button>
          </div>

          <div className="incident-action-modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={closeIncidentActionModal}
            >
              Cancel
            </button>

            <button
              type="button"
              className={isDelete ? "delete-row-btn" : "incident-action-confirm-btn"}
              onClick={confirmIncidentAction}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (loadingPage) {
    return (
      <DashboardShell variant="drrmo">
        <div className="incident-dashboard-page">
          <div className="incident-loading-state">
            <div className="incident-loading-card">
              <span className="incident-loading-spinner" aria-hidden="true" />
              <div>
                <strong>Loading incident reporting</strong>
                <span>Preparing queue, map, and detail review panel.</span>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const activeIncident = selectedIncident || selectionCandidates[0] || null;
  const activeAI = getAIReviewSummary(activeIncident?.verification || {});
  const activeStatus = getIncidentWorkflowStatus({
    status: statusMap[activeIncident?._id] ?? activeIncident?.status,
  });
  const activePriority = getIncidentPriority(activeIncident || {});
  const activeReportedAt = formatDateTime(
    activeIncident?.createdAt ||
      activeIncident?.updatedAt ||
      activeIncident?.date ||
      activeIncident?.reportedAt
  );

  return (
    <DashboardShell variant="drrmo">
        <div className="incident-dashboard-page">
          {renderNotifications()}
          {renderImageModal()}
          {renderHistoryModal()}
          {renderIncidentActionModal()}

        <section className="incident-dashboard-header">
          <div className="incident-dashboard-heading">
            <div className="eyebrow">
              <FaMapLocationDot aria-hidden="true" />
              Operations
            </div>
            <h1>Incident Reporting</h1>
            <p>
              Monitor reports, review mapped incidents, validate AI output, and
              keep details lower and clearer for DRRMO operations.
            </p>
          </div>

            <div className="incident-dashboard-actions">
              <button
                type="button"
                className="ghost-btn incident-history-header-btn"
                onClick={() => setHistoryOpen(true)}
              >
                <FaClockRotateLeft aria-hidden="true" />
                Incident History
              </button>
              <button
                type="button"
                className={`ghost-btn public-toggle-header-btn bulk-public-btn ${
                landingIncidentMode === "resolved-only" ? "is-on" : "is-off"
              }`}
              onClick={handleLandingIncidentModeToggle}
              title="Toggle incident visibility mode for public landing page"
            >
              {landingIncidentMode === "resolved-only" ? (
                <FaEyeSlash aria-hidden="true" />
              ) : (
                <FaEye aria-hidden="true" />
              )}
              {landingIncidentMode === "resolved-only"
                ? "Resolved On Landing"
                : "All Incidents On Landing"}
            </button>
          </div>
        </section>

        <section className="incident-summary-grid">
          <SummaryCard
            tone="accent"
            icon={<FaBell />}
            label="Total Incidents"
            value={formatNumber(summary.total)}
            sub="All reports currently loaded"
          />

          <SummaryCard
            tone="warning"
            icon={<FaClock />}
            label="Reported"
            value={formatNumber(summary.reported)}
            sub="Waiting for active handling"
            urgent={summary.reported >= 4}
          />

          <SummaryCard
            tone="muted"
            icon={<FaClockRotateLeft />}
            label="On Process"
            value={formatNumber(summary.onProcess)}
            sub="Currently being worked on"
          />

          <SummaryCard
            tone="success"
            icon={<FaCircleCheck />}
            label="Resolved"
            value={formatNumber(summary.resolved)}
            sub="Closed incident reports"
          />

          <SummaryCard
            tone="danger"
            icon={<FaTriangleExclamation />}
            label="High Severity"
            value={formatNumber(summary.highSeverity)}
            sub="Needs visible priority"
            urgent={summary.highSeverity > 0}
          />

          <SummaryCard
            tone="warning"
            icon={<FaShieldHalved />}
            label="AI Pending"
            value={formatNumber(summary.aiPending)}
            sub="Manual AI review required"
            urgent={summary.aiPending >= 3}
          />
        </section>

        <section className="incident-top-filters">
          <label className="incident-filter-field">
            <span>
              <FaMagnifyingGlass aria-hidden="true" />
              Search
            </span>
            <input
              type="text"
              placeholder="Search incident type, location, user, phone, or AI state"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="incident-filter-field">
            <span>
              <FaFilter aria-hidden="true" />
              Status
            </span>
            <select
              value={incidentStatusFilter}
              onChange={(e) => setIncidentStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="reported">Reported</option>
              <option value="onProcess">On Process</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>

                    <label className="incident-filter-field">
            <span>
              <FaWandMagicSparkles aria-hidden="true" />
              AI Review
            </span>
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
            >
              <option value="all">All review states</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </section>

        <section className="incident-main-layout incident-three-panel-layout">
          <aside className="incident-left-panel">
            <div className="panel-head">
              <div>
                <h2>Active Incident Queue</h2>
                <p>Priority-first queue for newly reported incidents.</p>
                <div className="incident-queue-legend incident-priority-legend">
                  <span className="mini-status priority-critical">critical</span>
                  <span className="mini-status priority-high">high</span>
                  <span className="mini-status priority-medium">medium</span>
                  <span className="mini-status priority-low">low</span>
                </div>
              </div>
            </div>

            <div className="incident-queue-list">
              {activeQueueIncidents.length ? (
                activeQueueIncidents.map((incident) => {
                  const ai = getAIReviewSummary(incident.verification);
                  const priority = getIncidentPriority(incident);

                  return (
                    <button
                      key={incident._id}
                      type="button"
                      className={`incident-queue-card queue-priority-${priority} ${
                        String(selectedIncidentId) === String(incident._id)
                          ? "selected"
                          : ""
                      } status-${getIncidentWorkflowStatus(incident)}`}
                      onClick={() => handleQueueSelect(incident._id)}
                    >
                      <div className="incident-queue-top">
                        <div>
                          <div className="incident-queue-title">
                            {incident.type || "Incident"}
                          </div>

                          <div className="incident-queue-subtitle">
                            <FaCalendarDays aria-hidden="true" />
                            {formatDateTime(
                              incident.createdAt ||
                                incident.updatedAt ||
                                incident.date ||
                                incident.reportedAt
                            )}
                          </div>
                        </div>

                        <div className="incident-queue-badge-stack">
                          <span
                            className={`mini-status ai-tag ${getVerificationTone(
                              ai.status
                            )}`}
                          >
                            AI {ai.status || "pending"}
                          </span>
                        </div>
                      </div>

                      <div className="incident-queue-meta">
                        <span className={`mini-status priority-chip priority-${priority}`}>
                          {priority}
                        </span>
                      </div>

                      <div className="incident-queue-foot">
                        <span
                          className={`mini-status ${getVerificationTone(ai.status)}`}
                        >
                          AI {ai.status || "pending"} • {getSeverityLabel(incident.level)}
                        </span>
                        <span className="mini-neutral-badge">
                          {truncateLocation(incident.location)}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="empty-state-card">
                  <div>
                    <span className="empty-state-icon">
                      <FaBell />
                    </span>
                    <strong>No incidents found</strong>
                    <span>Adjust filters or wait for new reports to appear.</span>
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className="incident-map-panel">
            <div className="panel-head">
              <div>
                <h2>Incident Map</h2>
              </div>
            </div>

            <div className="incident-map-stage">
              <MapContainer
                center={initialMapCenter}
                zoom={JAEN_MIN_ZOOM}
                minZoom={JAEN_MIN_ZOOM}
                maxZoom={18}
                zoomSnap={0.25}
                zoomDelta={0.5}
                maxBounds={allowedBounds || undefined}
                maxBoundsViscosity={1.0}
                style={{ height: "100%", width: "100%" }}
              >
                <FitIncidentMapToJaen
                  bounds={jaenBounds}
                  maxBounds={allowedBounds}
                  fitKey={barangayBounds.length}
                />
                <TileLayer {...basemapTileProps} />

                <GeoJSON data={maskGeoJSON} style={maskStyle} />
                <GeoJSON data={jaenGeoJSON} style={jaenStyle} />

                {Array.isArray(barangayBounds) &&
                  barangayBounds.map((item, index) => {
                    const geoJSON = getBarangayBoundsGeoJSON(item);
                    const geo = geoJSON?.geometry;
                    if (!geo) return null;

                    const label = getBarangayBoundsLabel(item, index);
                    const count =
                      incidentCountsByBarangay.get(normalizeBarangayKey(label)) ||
                      0;
                    const tone = getIncidentBarangayTone(
                      count,
                      maxIncidentBarangayCount
                    );
                    const polygons = geometryToLeafletPolygons(geo).filter(
                      (polygon) =>
                        Array.isArray(polygon?.[0]) && polygon[0].length >= 3
                    );

                    if (!polygons.length) return null;

                    return polygons.map((polygon, polygonIndex) => (
                      <Polygon
                        key={`${item._id || label || index}-${polygonIndex}`}
                        positions={polygon}
                        pathOptions={buildIncidentBarangayStyle({
                          label,
                          index,
                          count,
                          maxCount: maxIncidentBarangayCount,
                        })}
                      >
                        <Tooltip
                          permanent
                          direction="center"
                          interactive={false}
                          className={`incident-barangay-bound-label is-${tone}`}
                          opacity={0.98}
                          position={getPolygonCenter(polygon) || undefined}
                        >
                          <span className="incident-barangay-bound-label__text">
                            {label}
                          </span>
                          {count > 0 && (
                            <span className="incident-barangay-bound-label__count">
                              {count}
                            </span>
                          )}
                        </Tooltip>
                      </Polygon>
                    ));
                  })}

                {visibleMapIncidents.map((incident) => {
                  const position = getIncidentMarkerPosition(
                    incident,
                    barangayBounds
                  );

                  if (!position) return null;

                  return (
                    <Marker
                      key={incident._id}
                      position={position}
                      icon={getIncidentMapIcon(incident)}
                      eventHandlers={{
                        click: () => handleQueueSelect(incident._id),
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                        <div className="incident-tooltip">
                          <strong>
                            {String(incident.type || "Incident").toUpperCase()}
                          </strong>
                          <br />
                          Status: {getIncidentStatusLabel(incident)}
                          <br />
                          Severity: {incident.level || "-"}
                          <br />
                          {incident.location || "-"}
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </section>

          <aside className="incident-right-panel">
            <div className="panel-head">
              <div>
                <h2>Approved Queue</h2>
                <p>Approved incidents stay here while DRRMO updates their workflow status.</p>
                <div className="incident-queue-legend incident-workflow-legend">
                  <span className="mini-status warning">reported</span>
                  <span className="mini-status info">on process</span>
                  <span className="mini-status success">resolved</span>
                </div>
              </div>
            </div>

            <div className="incident-approved-list">
              {approvedQueueIncidents.length ? (
                approvedQueueIncidents.map((incident) => {
                  const ai = getAIReviewSummary(incident.verification);

                  return (
                    <button
                      key={incident._id}
                      type="button"
                      className={`incident-queue-card incident-approved-card ${
                        String(selectedIncidentId) === String(incident._id)
                          ? "selected"
                          : ""
                      } status-${getIncidentWorkflowStatus(incident)}`}
                      onClick={() => handleQueueSelect(incident._id)}
                    >
                      <div className="incident-queue-top">
                        <div>
                          <div className="incident-queue-title">
                            {incident.type || "Incident"}
                          </div>

                          <div className="incident-queue-subtitle">
                            <FaCalendarDays aria-hidden="true" />
                            {formatDateTime(
                              incident.createdAt ||
                                incident.updatedAt ||
                                incident.date ||
                                incident.reportedAt
                            )}
                          </div>
                        </div>

                        <div className="incident-queue-badge-stack">
                          <span
                            className={`mini-status ai-tag ${getVerificationTone(
                              ai.status
                            )}`}
                          >
                            AI {ai.status || "pending"}
                          </span>
                        </div>
                      </div>

                      <div className="incident-queue-foot">
                        <span className="mini-neutral-badge">
                          {truncateLocation(incident.location)}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="empty-state-card incident-approved-empty">
                  <div>
                    <span className="empty-state-icon">
                      <FaCircleCheck />
                    </span>
                    <strong>No approved incidents</strong>
                    <span>Approved or on-process incidents will appear here.</span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </section>

        <section
          className={`incident-details-panel incident-review-panel ${
            activeIncident
              ? `incident-review-${getIncidentTypeAccent(activeIncident.type)}`
              : ""
          }`}
          ref={detailsRef}
        >
          <div className="incident-details-body incident-unified-body">
            {activeIncident ? (
              <div className="incident-command-shell">
                <div className="incident-command-header">
                  <div className="incident-command-head-main">
                    <div className="incident-review-icon-wrap">
                      {safeLower(activeIncident.type).includes("fire") ? (
                        <FaTriangleExclamation aria-hidden="true" />
                      ) : safeLower(activeIncident.type).includes("earthquake") ? (
                        <FaMapLocationDot aria-hidden="true" />
                      ) : (
                        <FaBell aria-hidden="true" />
                      )}
                    </div>

                    <div className="incident-command-copy">
                      <div className="incident-command-badges">
                        <span className={`mini-status priority-chip priority-${activePriority}`}>
                          {activePriority}
                        </span>
                        <span className={`mini-status ${getIncidentStatusTone(activeIncident)}`}>
                          {getIncidentStatusLabel(activeIncident)}
                        </span>
                        <span className={`mini-status ${getVerificationTone(activeAI.status)}`}>
                          AI {activeAI.status}
                        </span>
                      </div>

                      <h3>{activeIncident.type || "Incident"}</h3>

                      <p className="incident-command-subline">
                        <FaLocationDot aria-hidden="true" />
                        <span>{activeIncident.location || "Unknown location"}</span>
                        <span className="incident-command-dot">•</span>
                        <FaCalendarDays aria-hidden="true" />
                        <span>{activeReportedAt}</span>
                      </p>
                    </div>
                  </div>

                  <div className="incident-command-actions">
                    <button
                      type="button"
                      className="ghost-btn export-incident-btn"
                      onClick={() => handleExportIncidentPdf(activeIncident?._id)}
                      disabled={!activeIncident?._id}
                    >
                      <FaFilePdf aria-hidden="true" />
                      Export PDF
                    </button>
                  </div>
                </div>

                <div className="incident-command-body">
                  <div className="incident-command-left">
                    <section className="incident-command-card incident-command-evidence">
                      <div className="incident-command-card-head">
                        <div>
                          <h4>Evidence</h4>
                        </div>
                      </div>

                      {activeIncident.image?.fileUrl ? (
                        <>
                          <button
                            type="button"
                            className="incident-image-preview-button"
                            onClick={() => setImagePreviewOpen(true)}
                          >
                            <img
                              src={activeIncident.image.fileUrl}
                              alt="incident preview"
                              className="incident-preview-image"
                            />
                          </button>

                          <div className="incident-image-preview-hint">
                            <FaImage aria-hidden="true" />
                            Click image to review larger
                          </div>
                        </>
                      ) : (
                        <div className="incident-no-image-card">
                          <span className="empty-state-icon">
                            <FaImage aria-hidden="true" />
                          </span>
                          <strong>No image uploaded</strong>
                          <span>This report has no attached image evidence.</span>
                        </div>
                      )}

                      <div className="incident-evidence-ai-block">
                        <div className="incident-command-card-head incident-command-head-split">
                          <div>
                            <h4>AI Verification</h4>
                          </div>

                          <span
                            className={`mini-status ${getVerificationTone(activeAI.status)}`}
                          >
                            {activeAI.status}
                          </span>
                        </div>

                        <div className="incident-ai-summary-card">
                          <div className="incident-ai-verdict-row">
                            <strong>{activeAI.verdict}</strong>
                            <span className="ai-score-pill">Score {activeAI.score}</span>
                          </div>

                          <div className="incident-ai-detail-grid">
                            <div>
                              <span>Match</span>
                              <strong>{activeAI.matchText}</strong>
                            </div>

                            <div>
                              <span>Labels</span>
                              <strong>{activeAI.labelsText}</strong>
                            </div>

                            <div>
                              <span>Metadata</span>
                              <strong>{activeAI.metaText}</strong>
                            </div>
                          </div>

                          <p className="incident-ai-reasoning">{activeAI.reasoning}</p>
                        </div>

                        <div className="status-action-grid ai-action-grid">
                          <button
                            type="button"
                            className={`status-action-btn available ${
                              activeAI.status === "approved" ? "active" : ""
                            }`}
                            onClick={() =>
                              handleVerifyOverride(activeIncident._id, "approved")
                            }
                          >
                            <FaCircleCheck aria-hidden="true" />
                            Approve AI
                          </button>

                          <button
                            type="button"
                            className={`status-action-btn full ${
                              activeAI.status === "rejected" ? "active" : ""
                            }`}
                            onClick={() =>
                              handleVerifyOverride(activeIncident._id, "rejected")
                            }
                          >
                            <FaTriangleExclamation aria-hidden="true" />
                            Reject AI
                          </button>

                          <button
                            type="button"
                            className="status-action-btn limited"
                            onClick={() => handleReverify(activeIncident._id)}
                          >
                            <FaWandMagicSparkles aria-hidden="true" />
                            Re-Verify
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="incident-command-right">
                    <section className="incident-command-card incident-command-sidecard">
                      <div className="incident-command-side-block">
                        <div className="incident-command-card-head">
                          <div>
                            <h4>Report Summary</h4>
                            <p>Quick incident facts for review.</p>
                          </div>
                        </div>

                        <div className="incident-summary-grid incident-summary-grid-compact">
                          <div className="incident-summary-row incident-summary-row-inline">
                            <span className="incident-summary-label">
                              <FaUser aria-hidden="true" />
                              Reporter
                            </span>
                            <strong>{activeIncident.usernames || "-"}</strong>
                          </div>

                          <div className="incident-summary-row incident-summary-row-inline">
                            <span className="incident-summary-label">
                              <FaPhone aria-hidden="true" />
                              Phone
                            </span>
                            <strong>{activeIncident.phone || "-"}</strong>
                          </div>

                          <div className="incident-summary-row incident-summary-row-wide">
                            <span className="incident-summary-label">
                              <FaLocationDot aria-hidden="true" />
                              Location
                            </span>
                            <strong>{activeIncident.location || "-"}</strong>
                          </div>

                          <div className="incident-summary-row incident-summary-row-inline">
                            <span className="incident-summary-label">Latitude</span>
                            <strong>{activeIncident.latitude || "-"}</strong>
                          </div>

                          <div className="incident-summary-row incident-summary-row-inline">
                            <span className="incident-summary-label">Longitude</span>
                            <strong>{activeIncident.longitude || "-"}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="incident-command-side-block incident-command-action-block">
                        <div
                          className="top-response-actions incident-command-workflow-actions"
                          aria-label="Response status"
                        >
                          {["onProcess", "resolved"].map((status) => (
                            <button
                              key={status}
                              type="button"
                              className={`top-response-btn ${status} ${
                                activeStatus === status ? "active" : ""
                              }`}
                              onClick={() => openIncidentActionModal(status, activeIncident)}
                            >
                              {status === "onProcess" && (
                                <FaClockRotateLeft aria-hidden="true" />
                              )}
                              {status === "resolved" && (
                                <FaCircleCheck aria-hidden="true" />
                              )}
                              {getIncidentStatusLabel(status)}
                            </button>
                          ))}
                        </div>

                        <div className="incident-delete-row incident-command-danger">
                          <button
                            type="button"
                            className="delete-row-btn review-delete-btn"
                            onClick={() => openIncidentActionModal("delete", activeIncident)}
                          >
                            <FaTrashCan aria-hidden="true" />
                            Delete Incident
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="incident-command-footer-meta">
                  <span>
                    <strong>Created:</strong> {activeReportedAt}
                  </span>
                  <span>
                    <strong>Updated:</strong>{" "}
                    {formatDateTime(activeIncident.updatedAt)}
                  </span>
                  <span>
                    <strong>Image Time:</strong>{" "}
                    {activeAI.metadata?.timestamp
                      ? formatTimestamp(activeAI.metadata.timestamp)
                      : "Unknown date"}
                  </span>
                  <span>
                    <strong>Device:</strong> {activeAI.metadata?.device || "-"}
                  </span>
                  <span>
                    <strong>GPS:</strong>{" "}
                    {activeAI.metadata?.hasGPS ? "Present" : "No GPS"}
                  </span>
                  <span>
                    <strong>Area:</strong>{" "}
                    {activeAI.metadata?.isWithinArea
                      ? "Within Jaen"
                      : "Unknown / outside"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="incident-empty-detail incident-review-empty">
                <div>
                  <span className="empty-state-icon">
                    <FaBell aria-hidden="true" />
                  </span>
                  <strong>No selected incident</strong>
                  <span>
                    Select a report from the queue or adjust your filters to show
                    available incidents.
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
