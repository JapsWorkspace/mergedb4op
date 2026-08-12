import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaArchive,
  FaBed,
  FaBuilding,
  FaChevronDown,
  FaChevronUp,
  FaCheckCircle,
  FaClipboardList,
  FaEdit,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaFilePdf,
  FaFilter,
  FaGlobeAsia,
  FaHistory,
  FaListUl,
  FaMapMarkedAlt,
  FaPlus,
  FaSearch,
  FaSortAmountDown,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaUserFriends,
} from "react-icons/fa";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

import DashboardShell from "./layout/DashboardShell";
import EvacMap from "./map/Map";
import "../components/css/EManagement.css";
import { API_BASE_URL } from "../config/api";

const BASE_URL = API_BASE_URL;

const TOAST_LIMIT = 3;
const TOAST_DURATION = 10000;
const MAX_SEARCH_LENGTH = 80;
const MAX_EVAC_NAME_LENGTH = 60;
const MAX_LOCATION_LENGTH = 90;
const MAX_REMARKS_LENGTH = 280;
const MAX_CAPACITY_VALUE = 1000000;
const MAX_FLOOR_AREA_VALUE = 1000000;

const initialFormState = {
  name: "",
  location: "",
  barangayId: "",
  barangayName: "",
  latitude: null,
  longitude: null,
  capacityIndividual: "",
  capacityFamily: "",
  bedCapacity: "",
  floorArea: "",
  femaleCR: false,
  maleCR: false,
  commonCR: false,
  potableWater: false,
  nonPotableWater: false,
  isPermanent: false,
  isCovidFacility: false,
  showOnLanding: true,
  remarks: "",
};

const sanitizeText = (value) => String(value ?? "").trim();
const safeLower = (value) => String(value ?? "").toLowerCase().trim();
const trimLongTokens = (value, maxTokenLength = 28) =>
  String(value ?? "")
    .split(/(\s+)/)
    .map((token) => (/\s+/.test(token) ? token : token.slice(0, maxTokenLength)))
    .join("");
const clampRepeatedPunctuation = (value) =>
  String(value ?? "").replace(/([!?.,:;'"#&/%()+$-])\1{2,}/g, "$1$1");
const sanitizeInputText = (value, maxLength) =>
  clampRepeatedPunctuation(
    trimLongTokens(String(value ?? "").normalize("NFKC"), 24)
  )
    .replace(/[^A-Za-z0-9\s.,()/#&-]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, maxLength);
const sanitizeRemarksText = (value, maxLength) =>
  clampRepeatedPunctuation(
    trimLongTokens(String(value ?? "").normalize("NFKC").replace(/\r/g, ""), 42)
  )
    .replace(/[^A-Za-z0-9\s.,()/#&:;!?'"%+$\-\n]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ ]*\n[ ]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxLength);
const sanitizeDigitsOnly = (value, maxLength = 7) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, maxLength);
const sanitizeDecimalValue = (value, maxWhole = 7, maxFraction = 2) => {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  const [wholeRaw, ...fractionParts] = cleaned.split(".");
  const whole = wholeRaw.slice(0, maxWhole);
  const fraction = fractionParts.join("").slice(0, maxFraction);
  if (!cleaned.includes(".")) return whole;
  return `${whole}.${fraction}`;
};

const formatNumber = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  return new Intl.NumberFormat().format(num);
};

const numberOrZero = (value) => {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
};

const deriveCapacityStatusFromOccupancy = (currentOccupants, capacityIndividual) => {
  const current = Number(currentOccupants || 0);
  const capacity = Number(capacityIndividual || 0);
  if (capacity > 0 && current >= capacity) return "full";
  if (capacity > 0 && Math.round((current / capacity) * 100) >= 75) {
    return "limited";
  }
  return "available";
};

const normalizeBarangayKey = (value) =>
  safeLower(value).replace(/\s+/g, " ").trim();

const getBoundsBarangayName = (entry) =>
  sanitizeText(
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
      entry?.features?.[0]?.properties?.barangay
  );

const getBoundsGeoJSON = (entry) => {
  if (!entry) return null;

  if (entry.type === "FeatureCollection") {
    const polygonFeatures = (entry.features || []).filter((feature) => {
      const type = feature?.geometry?.type;
      return type === "Polygon" || type === "MultiPolygon";
    });

    if (!polygonFeatures.length) return null;

    return {
      type: "FeatureCollection",
      features: polygonFeatures,
    };
  }

  if (entry.type === "Feature") return entry;

  if (Array.isArray(entry.features)) {
    return {
      type: "FeatureCollection",
      features: entry.features,
    };
  }

  if (entry.geometry) {
    return {
      type: "Feature",
      properties: entry.properties || {},
      geometry: entry.geometry,
    };
  }

  return null;
};

const isPointInsideBounds = (lat, lng, geojson) => {
  if (lat === null || lng === null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return false;
  }

  if (!geojson) return false;

  try {
    const clicked = turfPoint([Number(lng), Number(lat)]);

    if (geojson.type === "FeatureCollection") {
      return geojson.features.some((feature) =>
        booleanPointInPolygon(clicked, feature)
      );
    }

    if (geojson.type === "Feature") {
      return booleanPointInPolygon(clicked, geojson);
    }
  } catch (error) {
    console.error("Barangay bounds match failed:", error);
  }

  return false;
};

const getStoredRole = () => localStorage.getItem("role") || "";
const getStoredUserId = () => localStorage.getItem("userId") || "";
const getStoredBarangayName = () =>
  localStorage.getItem("barangayName") ||
  localStorage.getItem("username") ||
  "";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getStatusClass = (status) => {
  const normalized = safeLower(status);
  if (normalized === "available") return "available";
  if (normalized === "limited") return "limited";
  return "full";
};

const getHistoryAccentClass = (action) => {
  const normalized = safeLower(action);
  if (["add", "create"].includes(normalized)) return "success";
  if (["update", "edit", "status_update", "allocate"].includes(normalized))
    return "warning";
  if (["delete", "archive", "remove"].includes(normalized)) return "danger";
  return "neutral";
};

const getCapacityPressureLabel = (summary) => {
  if (!summary?.totalPlaces) return "No active capacity data";
  if (summary.availableCount === 0) return "Critical capacity pressure";
  if (summary.fullCount >= Math.ceil(summary.totalPlaces / 2)) {
    return "High capacity pressure";
  }
  if (summary.fullCount > 0 || summary.limitedCount > 0) {
    return "Monitoring required";
  }
  return "Operationally ready";
};

function SummaryCard({ tone, icon, label, value, sub, urgent = false }) {
  return (
    <div className={`summary-card ${tone || "muted"} ${urgent ? "urgent" : ""}`}>
      <div className="summary-card-top">
        <span className="summary-icon" aria-hidden="true">
          {icon}
        </span>
        {urgent && (
          <span className="summary-alert-dot" title="Needs attention">
            !
          </span>
        )}
      </div>
      <div>
        <div className="summary-label">{label}</div>
        <div className="summary-value">{value}</div>
        {sub ? <div className="summary-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

function MapLegend({ inline = false }) {
  return (
    <div
      className={`map-legend-card ${inline ? "map-legend-card-inline" : ""}`}
      aria-label="Map legend"
    >
      {!inline && <div className="map-legend-title">Map Legend</div>}
      <div className="map-legend-items">
        <div className="map-legend-item">
          <span className="map-legend-dot available" />
          <span>Available</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-dot limited" />
          <span>Limited</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-dot full" />
          <span>Full</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-dot archived" />
          <span>Archived</span>
        </div>
      </div>
    </div>
  );
}

export default function EManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const nameRef = useRef(null);
  const evacPageTopRef = useRef(null);
  const notificationTimersRef = useRef({});
  const occupancyAutoSaveTimerRef = useRef(null);

  const [places, setPlaces] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [me, setMe] = useState(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingSave, setLoadingSave] = useState(false);
  const [landingToggleLoading, setLandingToggleLoading] = useState(false);
  const [bulkLandingLoading, setBulkLandingLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("all");
  const [sortBy, setSortBy] = useState("capacity");
  const [placeView, setPlaceView] = useState("active");

  const [selectedBarangayName, setSelectedBarangayName] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [panelView, setPanelView] = useState("areas");
  const [mobileTaskPanelOpen, setMobileTaskPanelOpen] = useState(true);
  const [recentStatusUpdate, setRecentStatusUpdate] = useState(null);

  const [occupancyDraft, setOccupancyDraft] = useState({
  currentOccupants: "0",
  currentFamilies: "0",
  occupiedBeds: "0",
});

const [savingOccupancy, setSavingOccupancy] = useState(false);

  const [notifications, setNotifications] = useState([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [barangayLocked, setBarangayLocked] = useState(false);
  const [bulkPublicAction, setBulkPublicAction] = useState(null);
  const [pickMode, setPickMode] = useState(false);
  const [markerLabelsVisible, setMarkerLabelsVisible] = useState(true);

  const [barangayBounds, setBarangayBounds] = useState([]);
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});

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

  useEffect(() => {
    const timers = notificationTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const getInventoryStyleNotificationIcon = useCallback((type) => {
    if (type === "success") return "\u2713";
    if (type === "error" || type === "warning") return "!";
    return "i";
  }, []);

  const storedRole = getStoredRole();
  const storedUserId = getStoredUserId();

  const routeSaysBarangay = location.pathname.startsWith("/barangay");
  const meRole = me?.role || "";

  const isBarangayRole =
    routeSaysBarangay ||
    safeLower(storedRole) === "barangay" ||
    safeLower(meRole) === "barangay";

  const isPrivilegedOps =
    !isBarangayRole &&
    (safeLower(storedRole) === "admin" ||
      safeLower(storedRole) === "drrmo" ||
      safeLower(meRole) === "admin" ||
      safeLower(meRole) === "drrmo");

  const canAddArea = isPrivilegedOps || isBarangayRole;

  const localUserId = me?._id || storedUserId || "";
  const localBarangayName = me?.barangayName || getStoredBarangayName() || "";

  const normalizeBarangayItem = useCallback((item) => {
    const id = item?._id || item?.id || item?.barangayId || item?.value || "";
    const name =
      item?.barangayName ||
      item?.name ||
      item?.barangay ||
      item?.username ||
      item?.email ||
      item?.label ||
      "";

    return {
      _id: String(id || ""),
      name: String(name || ""),
      raw: item,
    };
  }, []);

  const matchedBarangayBounds = useMemo(() => {
    if (!barangayBounds.length) return null;

    const match = barangayBounds.find((b) => {
      return (
        normalizeBarangayKey(getBoundsBarangayName(b)) ===
        normalizeBarangayKey(localBarangayName)
      );
    });

    return match || null;
  }, [barangayBounds, localBarangayName]);

  const buildEvacQueryParams = useCallback(() => {
    const params = {};

    if (!isBarangayRole) {
      const selectedBarangay = barangayFilter !== "all" ? barangayFilter : "";
      if (selectedBarangay) params.barangayName = selectedBarangay;
    }

    if (statusFilter !== "all") params.status = statusFilter;
    if (sanitizeText(search)) params.search = sanitizeText(search);

    return params;
  }, [isBarangayRole, barangayFilter, statusFilter, search]);

  const buildFallbackMe = useCallback(() => {
    const role = safeLower(storedRole);
    return {
      _id: storedUserId || "",
      role: role || "",
      barangayName: getStoredBarangayName() || "",
      username: localStorage.getItem("username") || "",
      name: localStorage.getItem("name") || "",
    };
  }, [storedRole, storedUserId]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/barangays/me`, {
        withCredentials: true,
      });

      const payload = res.data || null;
      setMe(payload);
      return payload;
    } catch (error) {
      const status = error?.response?.status;

      if (status === 404 || status === 401) {
        const fallback = buildFallbackMe();
        setMe(fallback);
        return fallback;
      }

      console.error("Fetch me error:", error);
      const fallback = buildFallbackMe();
      setMe(fallback);
      return fallback;
    }
  }, [buildFallbackMe]);

  const fetchPlaces = useCallback(async (overrideParams = null) => {
    try {
      const params = { archived: "all", ...(overrideParams || {}) };
      const res = await axios.get(`${BASE_URL}/evacs`, {
        withCredentials: true,
        params,
      });

      const payload = Array.isArray(res.data) ? res.data : [];
      setPlaces(payload);
      return payload;
    } catch (error) {
      console.error("Fetch places error:", error);
      setPlaces([]);
      return [];
    }
  }, []);

  const fetchAllPlaces = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/evacs`, {
        withCredentials: true,
        params: { archived: "all" },
      });

      const payload = Array.isArray(res.data) ? res.data : [];
      setAllPlaces(payload);
      return payload;
    } catch (error) {
      console.error("Fetch all places error:", error);
      setAllPlaces([]);
      return [];
    }
  }, []);

  const fetchBarangays = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/barangays`, {
        withCredentials: true,
      });

      const raw = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.barangays)
        ? res.data.barangays
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];

      const mapped = raw
        .map(normalizeBarangayItem)
        .filter((item) => item._id && item.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setBarangays(mapped);
      return mapped;
    } catch (error) {
      console.error("Fetch barangays error:", error);
      setBarangays([]);
      return [];
    }
  }, [normalizeBarangayItem]);

  const fetchBarangayBounds = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/barangays/bounds`, {
        withCredentials: true,
      });

      console.log("BARANGAY BOUNDS:", res.data);
      const payload = Array.isArray(res.data) ? res.data : [];
      setBarangayBounds(payload);
      return payload;
    } catch (error) {
      console.error("Fetch barangay bounds error:", error);
      setBarangayBounds([]);
      return [];
    }
  }, []);

  const fetchHistory = useCallback(async (overrideParams = null) => {
    try {
      const params = overrideParams || {};
      const res = await axios.get(`${BASE_URL}/evacs/history/logs`, {
        withCredentials: true,
        params,
      });

      const payload = Array.isArray(res.data) ? res.data : [];
      setHistory(payload);
      return payload;
    } catch (error) {
      console.error("Fetch history error:", error);
      setHistory([]);
      return [];
    }
  }, []);

  const fetchAnalytics = useCallback(async (overrideParams = null) => {
    try {
      const params = overrideParams || {};
      const res = await axios.get(`${BASE_URL}/evacs/analytics/summary`, {
        withCredentials: true,
        params,
      });

      setAnalytics(res.data || null);
      return res.data || null;
    } catch (error) {
      console.error("Fetch analytics error:", error);
      setAnalytics(null);
      return null;
    }
  }, []);

  const exportPlacesPdf = useCallback(async () => {
    try {
      const pdfUrl = `${BASE_URL}/evacs/export-pdf`;
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      pushNotification("Opening evacuation places PDF...", "info");
    } catch (error) {
      console.error("Export evacuation PDF error:", error);
      pushNotification("Failed to open evacuation places PDF.", "error");
    }
  }, [pushNotification]);

  const fetchAllData = useCallback(async () => {
    setLoadingPage(true);
    try {
      await Promise.all([
        fetchMe(),
        fetchPlaces(),
        fetchAllPlaces(),
        fetchBarangays(),
        fetchBarangayBounds(),
        fetchHistory(),
        fetchAnalytics(),
      ]);
    } catch (error) {
      console.error("Fetch all EManagement data error:", error);
    } finally {
      setLoadingPage(false);
    }
  }, [
    fetchMe,
    fetchPlaces,
    fetchAllPlaces,
    fetchBarangays,
    fetchBarangayBounds,
    fetchHistory,
    fetchAnalytics,
  ]);

  useEffect(() => {
    const role = getStoredRole();
    if (!role && !routeSaysBarangay) {
      navigate("/");
      return;
    }
    fetchAllData();
  }, [fetchAllData, navigate, routeSaysBarangay]);

  useEffect(() => {
    if ((showAddForm || showEditForm) && nameRef.current) {
      const timer = setTimeout(() => {
        nameRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showAddForm, showEditForm]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target?.isContentEditable;

      if (e.key === "Escape" && !isField) {
        if (showAddForm) setShowAddForm(false);
        if (showEditForm) setShowEditForm(false);
        if (showArchiveConfirm) setShowArchiveConfirm(false);
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        if (pickMode) setPickMode(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAddForm, showEditForm, showArchiveConfirm, showDeleteConfirm, pickMode]);

  useEffect(() => {
    document.body.style.cursor = pickMode ? "crosshair" : "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [pickMode]);

  useEffect(() => {
    if (!recentStatusUpdate) return undefined;

    const timer = setTimeout(() => {
      setRecentStatusUpdate(null);
    }, 3200);

    return () => clearTimeout(timer);
  }, [recentStatusUpdate]);

  const resolveOwnBarangay = useCallback(() => {
    if (!barangays.length) {
      if (localBarangayName) {
        return {
          _id: localUserId || "",
          name: localBarangayName,
          raw: {},
        };
      }
      return null;
    }

    const own = barangays.find((item) => {
      const idMatch = localUserId && String(item._id) === String(localUserId);

      const nameMatch =
        normalizeBarangayKey(item.name) ===
          normalizeBarangayKey(localBarangayName) ||
        normalizeBarangayKey(item.raw?.barangayName) ===
          normalizeBarangayKey(localBarangayName) ||
        normalizeBarangayKey(item.raw?.username) ===
          normalizeBarangayKey(localBarangayName);

      return idMatch || nameMatch;
    });

    if (own) return own;

    if (localBarangayName) {
      return {
        _id: localUserId || "",
        name: localBarangayName,
        raw: {},
      };
    }

    return null;
  }, [barangays, localUserId, localBarangayName]);

  const barangayNameById = useMemo(() => {
    const map = new Map();
    barangays.forEach((item) => {
      if (item?._id && item?.name) {
        map.set(String(item._id), item.name);
      }
    });
    return map;
  }, [barangays]);

  const resolvePlaceBarangayName = useCallback(
    (place) => {
      const directName = sanitizeText(place?.barangayName);
      if (directName) return directName;

      const placeBarangayId = place?.barangayId ? String(place.barangayId) : "";
      if (placeBarangayId && barangayNameById.has(placeBarangayId)) {
        return barangayNameById.get(placeBarangayId) || "";
      }

      return "";
    },
    [barangayNameById]
  );

  const visiblePlacesBase = useMemo(() => {
    const sourceList =
      Array.isArray(allPlaces) && allPlaces.length
        ? allPlaces
        : Array.isArray(places)
        ? places
        : [];

    if (!isBarangayRole) return sourceList;

    return sourceList.filter((place) => {
      const resolvedBarangayName = resolvePlaceBarangayName(place);
      const sameBarangayId =
        localUserId && String(place?.barangayId) === String(localUserId);

      const sameBarangayName =
        localBarangayName &&
        normalizeBarangayKey(resolvedBarangayName) ===
          normalizeBarangayKey(localBarangayName);

      return sameBarangayId || sameBarangayName;
    });
  }, [
    allPlaces,
    places,
    isBarangayRole,
    localUserId,
    localBarangayName,
    resolvePlaceBarangayName,
  ]);

  const computedPlaces = useMemo(() => {
    return visiblePlacesBase.map((place) => ({
      ...place,
      barangayName: resolvePlaceBarangayName(place),
      totalCapacity:
        Number(place?.capacityIndividual || 0) +
        Number(place?.capacityFamily || 0) +
        Number(place?.bedCapacity || 0),
      facilitiesCount: [
        place?.femaleCR,
        place?.maleCR,
        place?.commonCR,
        place?.potableWater,
        place?.nonPotableWater,
      ].filter(Boolean).length,
    }));
  }, [visiblePlacesBase, resolvePlaceBarangayName]);

  const activePlaces = useMemo(
    () => computedPlaces.filter((place) => !place?.isArchived),
    [computedPlaces]
  );

  const archivedPlaces = useMemo(
    () => computedPlaces.filter((place) => Boolean(place?.isArchived)),
    [computedPlaces]
  );

  const barangayCards = useMemo(() => {
    if (isBarangayRole) return [];

    const sourceList = Array.isArray(computedPlaces) ? computedPlaces : [];
    const map = new Map();

    sourceList.forEach((place) => {
      const key = resolvePlaceBarangayName(place) || "Unknown Barangay";

      if (!map.has(key)) {
        map.set(key, {
          barangayName: key,
          placesCount: 0,
          archivedCount: 0,
          availableCount: 0,
          limitedCount: 0,
          fullCount: 0,
        });
      }

      const entry = map.get(key);
      if (place?.isArchived) {
        entry.archivedCount += 1;
        return;
      }

      entry.placesCount += 1;

      if (safeLower(place?.capacityStatus) === "available") {
        entry.availableCount += 1;
      }
      if (safeLower(place?.capacityStatus) === "limited") {
        entry.limitedCount += 1;
      }
      if (safeLower(place?.capacityStatus) === "full") {
        entry.fullCount += 1;
      }
    });

    const cards = Array.from(map.values()).sort((a, b) =>
      a.barangayName.localeCompare(b.barangayName)
    );

    const term = safeLower(search);
    if (!term) return cards;

    return cards.filter((item) =>
      safeLower(item.barangayName).includes(term)
    );
  }, [computedPlaces, isBarangayRole, resolvePlaceBarangayName, search]);

    useEffect(() => {
    if (isBarangayRole) {
      setSelectedBarangayName(localBarangayName || "");
      return;
    }

    const availableNames = barangayCards.map((item) => item.barangayName);

    if (!availableNames.length) {
      setSelectedBarangayName("");
      return;
    }

    if (barangayFilter !== "all") {
      setSelectedBarangayName(barangayFilter);
      return;
    }

    if (
      !selectedBarangayName ||
      !availableNames.includes(selectedBarangayName)
    ) {
      setSelectedBarangayName("");
    }
  }, [
    barangayCards,
    isBarangayRole,
    localBarangayName,
    selectedBarangayName,
    barangayFilter,
  ]);

  const filteredPlaces = useMemo(() => {
    const sourceList = placeView === "archived" ? archivedPlaces : activePlaces;
    let list = [...sourceList];
    const term = safeLower(search);

    if (term) {
      list = list.filter((place) => {
        return (
          safeLower(place?.name).includes(term) ||
          safeLower(place?.location).includes(term) ||
          safeLower(place?.barangayName).includes(term) ||
          safeLower(place?.remarks).includes(term)
        );
      });
    }

    if (statusFilter !== "all") {
      list = list.filter(
        (place) => safeLower(place?.capacityStatus) === safeLower(statusFilter)
      );
    }

    if (!isBarangayRole && barangayFilter !== "all") {
      list = list.filter(
        (place) =>
          normalizeBarangayKey(place?.barangayName) ===
          normalizeBarangayKey(barangayFilter)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "capacity") {
        return Number(b.totalCapacity || 0) - Number(a.totalCapacity || 0);
      }

      if (sortBy === "status") {
        const order = { available: 1, limited: 2, full: 3 };
        return (
          (order[safeLower(a.capacityStatus)] || 99) -
          (order[safeLower(b.capacityStatus)] || 99)
        );
      }

      if (sortBy === "barangay") {
        return safeLower(a.barangayName).localeCompare(
          safeLower(b.barangayName)
        );
      }

      return safeLower(a.name).localeCompare(safeLower(b.name));
    });

    return list;
  }, [
    activePlaces,
    archivedPlaces,
    search,
    statusFilter,
    barangayFilter,
    isBarangayRole,
    sortBy,
    placeView,
  ]);

  useEffect(() => {
    if (!filteredPlaces.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId) {
      setSelectedId(filteredPlaces[0]?._id || null);
      return;
    }

    const stillExists = filteredPlaces.some(
      (place) => String(place._id) === String(selectedId)
    );

    if (!stillExists) {
      setSelectedId(filteredPlaces[0]?._id || null);
    }
  }, [filteredPlaces, selectedId]);

  const selectedPlace = useMemo(() => {
    return (
      filteredPlaces.find((item) => String(item._id) === String(selectedId)) ||
      null
    );
  }, [filteredPlaces, selectedId]);

  const scrollEvacuationToTop = useCallback(() => {
    const target = evacPageTopRef.current;
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const selectedPlaceHistory = useMemo(() => {
    if (!selectedPlace) return [];

    return history.filter((item) => {
      return (
        safeLower(item?.placeName) === safeLower(selectedPlace?.name) ||
        (item?.evacPlaceId &&
          String(item.evacPlaceId) === String(selectedPlace?._id))
      );
    });
  }, [history, selectedPlace]);

  const overallSummary = useMemo(() => {
    const totalPlaces = activePlaces.length;
    const availableCount = activePlaces.filter(
      (item) => safeLower(item.capacityStatus) === "available"
    ).length;
    const limitedCount = activePlaces.filter(
      (item) => safeLower(item.capacityStatus) === "limited"
    ).length;
    const fullCount = activePlaces.filter(
      (item) => safeLower(item.capacityStatus) === "full"
    ).length;

    return {
      totalPlaces,
      availableCount,
      limitedCount,
      fullCount,
      archivedCount: archivedPlaces.length,
    };
  }, [activePlaces, archivedPlaces.length]);

  const summary = useMemo(() => {
    const sourceList = placeView === "archived" ? archivedPlaces : activePlaces;
    const baseList =
      !isBarangayRole && barangayFilter !== "all"
        ? sourceList.filter(
            (item) =>
              normalizeBarangayKey(item.barangayName) ===
              normalizeBarangayKey(barangayFilter)
          )
        : sourceList;
    const archivedBaseList =
      !isBarangayRole && barangayFilter !== "all"
        ? archivedPlaces.filter(
            (item) =>
              normalizeBarangayKey(item.barangayName) ===
              normalizeBarangayKey(barangayFilter)
          )
        : isBarangayRole
        ? archivedPlaces.filter(
            (item) =>
              normalizeBarangayKey(item.barangayName) ===
              normalizeBarangayKey(localBarangayName)
          )
        : archivedPlaces;

    const totalPlaces = baseList.length;
    const availableCount = baseList.filter(
      (item) => safeLower(item.capacityStatus) === "available"
    ).length;
    const limitedCount = baseList.filter(
      (item) => safeLower(item.capacityStatus) === "limited"
    ).length;
    const fullCount = baseList.filter(
      (item) => safeLower(item.capacityStatus) === "full"
    ).length;

    const totalIndividualCapacity = baseList.reduce(
      (sum, item) => sum + Number(item.capacityIndividual || 0),
      0
    );
    const totalFamilyCapacity = baseList.reduce(
      (sum, item) => sum + Number(item.capacityFamily || 0),
      0
    );
    const totalBedCapacity = baseList.reduce(
      (sum, item) => sum + Number(item.bedCapacity || 0),
      0
    );

    return {
      totalPlaces,
      availableCount,
      limitedCount,
      fullCount,
      archivedCount: archivedBaseList.length,
      totalIndividualCapacity,
      totalFamilyCapacity,
      totalBedCapacity,
    };
  }, [
    activePlaces,
    archivedPlaces,
    placeView,
    isBarangayRole,
    barangayFilter,
    localBarangayName,
  ]);

  const effectiveAnalytics = useMemo(() => {
    void analytics;
    return summary;
  }, [analytics, summary]);

  const warningInsights = useMemo(() => {
    const alerts = [];

    if (
      effectiveAnalytics?.availableCount === 0 &&
      effectiveAnalytics?.totalPlaces > 0
    ) {
      alerts.push({
        tone: "danger",
        title: "No available evacuation areas",
        text: "All tracked evacuation areas are currently limited or full.",
      });
    }

    if (effectiveAnalytics?.fullCount > 0) {
      alerts.push({
        tone: "warning",
        title: "Full evacuation areas detected",
        text: `${formatNumber(
          effectiveAnalytics.fullCount
        )} evacuation area(s) are marked full and may need reallocation support.`,
      });
    }

    if (
      effectiveAnalytics?.totalPlaces > 0 &&
      effectiveAnalytics?.fullCount >=
        Math.ceil(effectiveAnalytics.totalPlaces / 2)
    ) {
      alerts.push({
        tone: "danger",
        title: "High occupancy pressure",
        text: "Half or more of the evacuation areas are already full.",
      });
    }

    return alerts;
  }, [effectiveAnalytics]);

  const updateFormField = useCallback((name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  const clearFormError = useCallback((name) => {
    setFormErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleTextFieldChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      clearFormError(name);
      if (name === "remarks") {
        updateFormField(name, sanitizeRemarksText(value, MAX_REMARKS_LENGTH));
        return;
      }

      const maxLengthMap = {
        name: MAX_EVAC_NAME_LENGTH,
        location: MAX_LOCATION_LENGTH,
      };

      updateFormField(
        name,
        sanitizeInputText(value, maxLengthMap[name] || MAX_LOCATION_LENGTH)
      );
    },
    [clearFormError, updateFormField]
  );

  const handleNumericFieldChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      clearFormError(name);
      if (value === "") {
        updateFormField(name, "");
        return;
      }

      if (name === "floorArea") {
        updateFormField(name, sanitizeDecimalValue(value));
        return;
      }

      updateFormField(name, sanitizeDigitsOnly(value));
    },
    [clearFormError, updateFormField]
  );

  const resolveBarangayForCoordinates = useCallback(
    (lat, lng) => {
      const matchedBounds = barangayBounds.find((entry) =>
        isPointInsideBounds(lat, lng, getBoundsGeoJSON(entry))
      );

      if (!matchedBounds) return null;

      const matchedName = getBoundsBarangayName(matchedBounds);
      const matchedBarangay =
        barangays.find(
          (item) =>
            normalizeBarangayKey(item.name) === normalizeBarangayKey(matchedName)
        ) || null;

      return {
        barangayId:
          matchedBarangay?._id ||
          matchedBounds?._id ||
          matchedBounds?.barangayId ||
          "",
        barangayName: matchedBarangay?.name || matchedName || "",
      };
    },
    [barangayBounds, barangays]
  );

  const syncBarangayForCoordinates = useCallback(
    (lat, lng) => {
      if (showEditForm || isBarangayRole) return null;

      const matchedBarangay = resolveBarangayForCoordinates(lat, lng);
      setBarangayLocked(Boolean(matchedBarangay?.barangayName));

      setFormData((prev) => ({
        ...prev,
        barangayId: matchedBarangay?.barangayId || "",
        barangayName: matchedBarangay?.barangayName || "",
      }));

      return matchedBarangay;
    },
    [showEditForm, isBarangayRole, resolveBarangayForCoordinates]
  );

  const handleLatitudeChange = useCallback(
    (e) => {
      const value = e.target.value.trim();
      clearFormError("latitude");
      clearFormError("longitude");
      if (value === "") {
        updateFormField("latitude", null);
        if (!showEditForm && !isBarangayRole) {
          setBarangayLocked(false);
          setFormData((prev) => ({
            ...prev,
            barangayId: "",
            barangayName: "",
          }));
        }
        return;
      }
      const num = Number(value);
      if (!Number.isNaN(num)) {
        updateFormField("latitude", num);
        if (formData.longitude !== null && formData.longitude !== "") {
          syncBarangayForCoordinates(num, Number(formData.longitude));
        }
      }
    },
    [clearFormError, updateFormField, formData.longitude, showEditForm, isBarangayRole, syncBarangayForCoordinates]
  );

  const handleLongitudeChange = useCallback(
    (e) => {
      const value = e.target.value.trim();
      clearFormError("latitude");
      clearFormError("longitude");
      if (value === "") {
        updateFormField("longitude", null);
        if (!showEditForm && !isBarangayRole) {
          setBarangayLocked(false);
          setFormData((prev) => ({
            ...prev,
            barangayId: "",
            barangayName: "",
          }));
        }
        return;
      }
      const num = Number(value);
      if (!Number.isNaN(num)) {
        updateFormField("longitude", num);
        if (formData.latitude !== null && formData.latitude !== "") {
          syncBarangayForCoordinates(Number(formData.latitude), num);
        }
      }
    },
    [clearFormError, updateFormField, formData.latitude, showEditForm, isBarangayRole, syncBarangayForCoordinates]
  );

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setFormErrors({});
    setBarangayLocked(false);
  }, []);

  const cancelPickMode = useCallback(() => {
    setPickMode(false);
    pushNotification("Map selection cancelled.", "info");
  }, [pushNotification]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setBarangayFilter("all");
    setSortBy("capacity");
    setPanelView("areas");
    setMobileTaskPanelOpen(true);
  }, []);

  const handleBarangaySelect = useCallback((name) => {
    setBarangayFilter(name);
    setSelectedBarangayName(name === "all" ? "" : name);
    setSelectedId(null);
    setMobileTaskPanelOpen(true);
  }, []);

  const handleStartPick = useCallback(() => {
    if (!canAddArea) return;

    const baseForm = { ...initialFormState };

    if (isBarangayRole) {
      const ownBarangay = resolveOwnBarangay();

      if (ownBarangay) {
        baseForm.barangayId = ownBarangay._id;
        baseForm.barangayName = ownBarangay.name;
      } else if (localBarangayName) {
        baseForm.barangayName = localBarangayName;
      }
    } else if (barangayFilter !== "all") {
      const matchedBarangay =
        barangays.find(
          (item) =>
            normalizeBarangayKey(item.name) ===
            normalizeBarangayKey(barangayFilter)
        ) || null;

      if (matchedBarangay) {
        baseForm.barangayId = matchedBarangay._id;
        baseForm.barangayName = matchedBarangay.name;
      } else {
        baseForm.barangayName = barangayFilter;
      }
    }

    setFormData(baseForm);
    setBarangayLocked(false);
    setShowAddForm(false);
    setShowEditForm(false);
    setPickMode(true);
    pushNotification(
      "Pick a point on the map or cancel if this was accidental.",
      "info"
    );
  }, [
    canAddArea,
    isBarangayRole,
    resolveOwnBarangay,
    localBarangayName,
    barangayFilter,
    barangays,
    pushNotification,
  ]);

  const openEditModal = useCallback(() => {
    if (!selectedPlace) return;

    setFormData({
      name: selectedPlace.name || "",
      location: selectedPlace.location || "",
      barangayId: selectedPlace.barangayId || "",
      barangayName: selectedPlace.barangayName || "",
      latitude:
        selectedPlace.latitude === null || selectedPlace.latitude === undefined
          ? null
          : Number(selectedPlace.latitude),
      longitude:
        selectedPlace.longitude === null || selectedPlace.longitude === undefined
          ? null
          : Number(selectedPlace.longitude),
      capacityIndividual: String(selectedPlace.capacityIndividual || ""),
      capacityFamily: String(selectedPlace.capacityFamily || ""),
      bedCapacity: String(selectedPlace.bedCapacity || ""),
      floorArea: String(selectedPlace.floorArea || ""),
      femaleCR: Boolean(selectedPlace.femaleCR),
      maleCR: Boolean(selectedPlace.maleCR),
      commonCR: Boolean(selectedPlace.commonCR),
      potableWater: Boolean(selectedPlace.potableWater),
      nonPotableWater: Boolean(selectedPlace.nonPotableWater),
      isPermanent: Boolean(selectedPlace.isPermanent),
      isCovidFacility: Boolean(selectedPlace.isCovidFacility),
      showOnLanding:
        selectedPlace.showOnLanding === undefined
          ? true
          : Boolean(selectedPlace.showOnLanding),
      remarks: selectedPlace.remarks || "",
    });

    setShowAddForm(false);
    setBarangayLocked(false);
    setShowEditForm(true);
  }, [selectedPlace]);

  const normalizeMapArgs = (...args) => {
    let locationLabel = "";
    let lat = null;
    let lng = null;
    let barangayId = "";
    let barangayName = "";

    if (args.length === 1 && args[0]?.latlng) {
      lat = args[0].latlng.lat;
      lng = args[0].latlng.lng;
      locationLabel =
        args[0].label || args[0].location || args[0].locationLabel || "";
    } else if (args.length === 1 && typeof args[0] === "object") {
      lat = Number(args[0]?.lat);
      lng = Number(args[0]?.lng);
      locationLabel =
        args[0]?.label || args[0]?.location || args[0]?.locationLabel || "";
      barangayId = String(args[0]?.barangayId || "");
      barangayName = sanitizeText(args[0]?.barangayName || "");
    } else if (args.length >= 3) {
      locationLabel = args[0];
      lat = Number(args[1]);
      lng = Number(args[2]);
    } else if (args.length >= 2) {
      lat = Number(args[0]);
      lng = Number(args[1]);
    }

    return {
      locationLabel: sanitizeText(locationLabel),
      lat,
      lng,
      barangayId,
      barangayName,
    };
  };

  const flyTo = useCallback((lat, lng, zoom = 17) => {
    if (
      lat === null ||
      lng === null ||
      lat === undefined ||
      lng === undefined
    ) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("emap:flyTo", {
        detail: { lat, lng, zoom },
      })
    );
  }, []);

  const handleMapSelectLocation = useCallback(
    (...args) => {
      const {
        locationLabel,
        lat,
        lng,
        barangayId: providedBarangayId,
        barangayName: providedBarangayName,
      } = normalizeMapArgs(...args);

      if (
        lat === null ||
        lng === null ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      ) {
        return;
      }

      if (pickMode) {
        const matchedBarangay =
          (providedBarangayName || providedBarangayId) ?
            {
              barangayId: providedBarangayId,
              barangayName: providedBarangayName,
            }
          : resolveBarangayForCoordinates(lat, lng);

        setFormData((prev) => ({
          ...prev,
          location: locationLabel || prev.location,
          latitude: lat,
          longitude: lng,
          barangayId: matchedBarangay?.barangayId || "",
          barangayName: matchedBarangay?.barangayName || "",
        }));
        setBarangayLocked(Boolean(matchedBarangay?.barangayName));
        setPickMode(false);
        setShowAddForm(true);
        flyTo(lat, lng, 18);
        pushNotification(
          matchedBarangay?.barangayName
            ? `Location selected. Barangay locked to ${matchedBarangay.barangayName}.`
            : "Location selected. Please choose the barangay before saving.",
          matchedBarangay?.barangayName ? "success" : "info"
        );
      }
    },
    [pickMode, flyTo, pushNotification, resolveBarangayForCoordinates]
  );

  useEffect(() => {
    if (!selectedPlace) return;

    const lat = Number(selectedPlace.latitude);
    const lng = Number(selectedPlace.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    flyTo(lat, lng, 17);
  }, [selectedPlace, flyTo]);

  const validateForm = useCallback(() => {
    const cleanName = sanitizeInputText(formData.name, MAX_EVAC_NAME_LENGTH).trim();
    const cleanLocation = sanitizeInputText(
      formData.location,
      MAX_LOCATION_LENGTH
    ).trim();
    const cleanRemarks = sanitizeRemarksText(
      formData.remarks,
      MAX_REMARKS_LENGTH
    ).trim();
    const capacityIndividual = Number(formData.capacityIndividual || 0);
    const capacityFamily = Number(formData.capacityFamily || 0);
    const bedCapacity = Number(formData.bedCapacity || 0);
    const floorArea = Number(formData.floorArea || 0);

    const nextErrors = {};

    if (!cleanName) nextErrors.name = "Evacuation area name is required.";
    if (!cleanLocation) nextErrors.location = "Location is required.";
    if (!formData.barangayId && !sanitizeText(formData.barangayName)) {
      nextErrors.barangay = "Barangay is required.";
    }

    if (formData.latitude === null || formData.longitude === null) {
      nextErrors.latitude = "Latitude and longitude are required.";
      nextErrors.longitude = "Latitude and longitude are required.";
    } else {
      if (Number(formData.latitude) < -90 || Number(formData.latitude) > 90) {
        nextErrors.latitude = "Latitude must be between -90 and 90.";
      }

      if (Number(formData.longitude) < -180 || Number(formData.longitude) > 180) {
        nextErrors.longitude = "Longitude must be between -180 and 180.";
      }
    }

    if (
      formData.capacityIndividual !== "" &&
      (capacityIndividual <= 0 || capacityIndividual > MAX_CAPACITY_VALUE)
    ) {
      nextErrors.capacityIndividual = `Individual capacity must be between 1 and ${formatNumber(MAX_CAPACITY_VALUE)}.`;
    }

    if (
      formData.capacityFamily !== "" &&
      (capacityFamily <= 0 || capacityFamily > MAX_CAPACITY_VALUE)
    ) {
      nextErrors.capacityFamily = `Family capacity must be between 1 and ${formatNumber(MAX_CAPACITY_VALUE)}.`;
    }

    if (
      formData.bedCapacity !== "" &&
      (bedCapacity <= 0 || bedCapacity > MAX_CAPACITY_VALUE)
    ) {
      nextErrors.bedCapacity = `Bed capacity must be between 1 and ${formatNumber(MAX_CAPACITY_VALUE)}.`;
    }

    if (
      formData.floorArea !== "" &&
      (floorArea <= 0 || floorArea > MAX_FLOOR_AREA_VALUE)
    ) {
      nextErrors.floorArea = `Floor area must be between 1 and ${formatNumber(MAX_FLOOR_AREA_VALUE)}.`;
    }

    if (cleanRemarks.length > MAX_REMARKS_LENGTH) {
      nextErrors.remarks = `Remarks must be ${MAX_REMARKS_LENGTH} characters or less.`;
    }

    if (isBarangayRole) {
      const ownBarangay = resolveOwnBarangay();
      const ownBarangayName = ownBarangay?.name || localBarangayName;

      if (!sanitizeText(ownBarangayName)) {
        nextErrors.barangay = "Unable to determine the logged-in barangay. Please log in again.";
      }
    }

    const firstError = Object.values(nextErrors)[0];
    setFormErrors(nextErrors);
    if (firstError) {
      pushNotification(firstError, "error");
      return false;
    }

    return true;
  }, [
    formData,
    isBarangayRole,
    resolveOwnBarangay,
    localBarangayName,
    pushNotification,
  ]);

  const buildPayload = useCallback(() => {
    const barangayRecord =
      barangays.find(
        (item) =>
          String(item._id) === String(formData.barangayId) ||
          normalizeBarangayKey(item.name) ===
            normalizeBarangayKey(formData.barangayName)
      ) || null;

    const ownBarangay = resolveOwnBarangay();

    const finalBarangayId = isBarangayRole
      ? ownBarangay?._id || localUserId || ""
      : formData.barangayId || barangayRecord?._id || localUserId || "";

    const finalBarangayName = isBarangayRole
      ? ownBarangay?.name || localBarangayName || ""
      : formData.barangayName || barangayRecord?.name || localBarangayName || "";

    return {
      name: sanitizeInputText(formData.name, MAX_EVAC_NAME_LENGTH).trim(),
      location: sanitizeInputText(formData.location, MAX_LOCATION_LENGTH).trim(),
      barangayId: finalBarangayId,
      barangayName: sanitizeText(finalBarangayName),
      latitude: Number(formData.latitude),
      longitude: Number(formData.longitude),
      capacityIndividual: numberOrZero(formData.capacityIndividual),
      capacityFamily: numberOrZero(formData.capacityFamily),
      bedCapacity: numberOrZero(formData.bedCapacity),
      floorArea: numberOrZero(formData.floorArea),
      femaleCR: Boolean(formData.femaleCR),
      maleCR: Boolean(formData.maleCR),
      commonCR: Boolean(formData.commonCR),
      potableWater: Boolean(formData.potableWater),
      nonPotableWater: Boolean(formData.nonPotableWater),
      isPermanent: Boolean(formData.isPermanent),
      isCovidFacility: Boolean(formData.isCovidFacility),
      showOnLanding: isBarangayRole ? false : Boolean(formData.showOnLanding),
      remarks: sanitizeRemarksText(formData.remarks, MAX_REMARKS_LENGTH).trim(),
    };
  }, [
    barangays,
    formData,
    isBarangayRole,
    resolveOwnBarangay,
    localUserId,
    localBarangayName,
  ]);

  const refreshDataAfterMutation = useCallback(async () => {
    const params = buildEvacQueryParams();
    await Promise.all([
      fetchPlaces(params),
      fetchAllPlaces(),
      fetchHistory(params),
      fetchAnalytics(params),
      fetchBarangayBounds(),
    ]);
  }, [
    buildEvacQueryParams,
    fetchPlaces,
    fetchAllPlaces,
    fetchHistory,
    fetchAnalytics,
    fetchBarangayBounds,
  ]);

  const handleSubmitAdd = useCallback(
    async (e) => {
      e.preventDefault();
      if (!validateForm()) return;

      setLoadingSave(true);
      try {
        const res = await axios.post(`${BASE_URL}/evacs/make`, buildPayload(), {
          withCredentials: true,
        });

        const created = res.data || null;
        resetForm();
        setShowAddForm(false);
        setPickMode(false);
        await refreshDataAfterMutation();

        if (created?._id) {
          setSelectedId(created._id);
        }

        pushNotification("Evacuation area added successfully.", "success");
      } catch (error) {
        console.error("Create evac area error:", error);
        pushNotification(
          error?.response?.data?.message || "Failed to add evacuation area.",
          "error"
        );
      } finally {
        setLoadingSave(false);
      }
    },
    [
      validateForm,
      buildPayload,
      resetForm,
      refreshDataAfterMutation,
      pushNotification,
    ]
  );

  const handleSubmitEdit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedPlace?._id) {
        pushNotification("No evacuation area selected.", "error");
        return;
      }

      if (!validateForm()) return;

      setLoadingSave(true);
      try {
        const res = await axios.put(
          `${BASE_URL}/evacs/${selectedPlace._id}`,
          buildPayload(),
          { withCredentials: true }
        );

        const updated = res.data || null;
        resetForm();
        setShowEditForm(false);
        await refreshDataAfterMutation();

        if (updated?._id) {
          setSelectedId(updated._id);
        }

        pushNotification("Evacuation area updated successfully.", "success");
      } catch (error) {
        console.error("Update evac area error:", error);
        pushNotification(
          error?.response?.data?.message || "Failed to update evacuation area.",
          "error"
        );
      } finally {
        setLoadingSave(false);
      }
    },
    [
      selectedPlace,
      validateForm,
      buildPayload,
      resetForm,
      refreshDataAfterMutation,
      pushNotification,
    ]
  );

  const handleArchivePlace = useCallback(async () => {
    if (!selectedPlace?._id) {
      pushNotification("No evacuation area selected.", "error");
      return;
    }

    setLoadingSave(true);
    try {
      await axios.delete(`${BASE_URL}/evacs/${selectedPlace._id}`, {
        withCredentials: true,
      });

      setShowArchiveConfirm(false);
      setSelectedId(null);
      await refreshDataAfterMutation();
      pushNotification("Evacuation area archived successfully.", "success");
    } catch (error) {
      console.error("Archive evac area error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to archive evacuation area.",
        "error"
      );
    } finally {
      setLoadingSave(false);
    }
  }, [selectedPlace, refreshDataAfterMutation, pushNotification]);

  const handleUnarchivePlace = useCallback(async () => {
    if (!selectedPlace?._id) {
      pushNotification("No evacuation area selected.", "error");
      return;
    }

    setLoadingSave(true);
    try {
      await axios.put(
        `${BASE_URL}/evacs/${selectedPlace._id}/unarchive`,
        {},
        { withCredentials: true }
      );

      await refreshDataAfterMutation();
      setPlaceView("active");
      pushNotification("Evacuation area unarchived successfully.", "success");
    } catch (error) {
      console.error("Unarchive evac area error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to unarchive evacuation area.",
        "error"
      );
    } finally {
      setLoadingSave(false);
    }
  }, [selectedPlace, refreshDataAfterMutation, pushNotification]);

  const handlePermanentDeletePlace = useCallback(async () => {
    if (!selectedPlace?._id) {
      pushNotification("No evacuation area selected.", "error");
      return;
    }

    setLoadingSave(true);
    try {
      await axios.delete(`${BASE_URL}/evacs/${selectedPlace._id}/permanent`, {
        withCredentials: true,
      });

      setShowDeleteConfirm(false);
      setSelectedId(null);
      setPanelView("areas");
      await refreshDataAfterMutation();
      pushNotification(
        "Archived evacuation area deleted successfully.",
        "success"
      );
    } catch (error) {
      console.error("Permanent delete evac area error:", error);
      pushNotification(
        error?.response?.data?.message ||
          "Failed to delete archived evacuation area.",
        "error"
      );
    } finally {
      setLoadingSave(false);
    }
  }, [selectedPlace, refreshDataAfterMutation, pushNotification]);

  const getOccupancyNumbers = useCallback((place) => {
  const currentOccupants = Number(place?.currentOccupants || 0);
  const capacityIndividual = Number(place?.capacityIndividual || 0);

  const currentFamilies = Number(place?.currentFamilies || 0);
  const capacityFamily = Number(place?.capacityFamily || 0);

  const occupiedBeds = Number(place?.occupiedBeds || 0);
  const bedCapacity = Number(place?.bedCapacity || 0);

  const remainingIndividuals = Math.max(0, capacityIndividual - currentOccupants);
  const remainingFamilies = Math.max(0, capacityFamily - currentFamilies);
  const remainingBeds = Math.max(0, bedCapacity - occupiedBeds);

  const individualPercent =
    capacityIndividual > 0
      ? Math.round((currentOccupants / capacityIndividual) * 100)
      : 0;
  const individualDisplayPercent = Math.min(100, Math.max(0, individualPercent));

  const familyPercent =
    capacityFamily > 0
      ? Math.round((currentFamilies / capacityFamily) * 100)
      : 0;
  const familyDisplayPercent = Math.min(100, Math.max(0, familyPercent));

  const bedPercent =
    bedCapacity > 0
      ? Math.round((occupiedBeds / bedCapacity) * 100)
      : 0;
  const bedDisplayPercent = Math.min(100, Math.max(0, bedPercent));

  return {
    currentOccupants,
    capacityIndividual,
    remainingIndividuals,
    individualPercent,
    individualDisplayPercent,

    currentFamilies,
    capacityFamily,
    remainingFamilies,
    familyPercent,
    familyDisplayPercent,

    occupiedBeds,
    bedCapacity,
    remainingBeds,
    bedPercent,
    bedDisplayPercent,
  };
}, []);

const updatePlaceInLocalState = useCallback((updatedPlace) => {
  if (!updatedPlace?._id) return;

  setPlaces((prev) =>
    prev.map((item) =>
      String(item._id) === String(updatedPlace._id)
        ? {
            ...item,
            ...updatedPlace,
          }
        : item
    )
  );

  setAllPlaces((prev) =>
    prev.map((item) =>
      String(item._id) === String(updatedPlace._id)
        ? {
            ...item,
            ...updatedPlace,
          }
        : item
    )
  );

  setSelectedId(updatedPlace._id);
}, []);

const getDerivedOccupiedBeds = useCallback(
  (peopleValue) => {
    const currentPeople = Math.max(0, Number(peopleValue || 0));
    const bedCapacity = Number(selectedPlace?.bedCapacity || 0);
    return bedCapacity > 0 ? Math.min(currentPeople, bedCapacity) : currentPeople;
  },
  [selectedPlace?.bedCapacity]
);

const getFamilyLimit = useCallback(
  (peopleValue) => {
    const currentPeople = Math.max(0, Number(peopleValue || 0));
    const familyCapacity = Number(selectedPlace?.capacityFamily || 0);
    return familyCapacity > 0
      ? Math.min(familyCapacity, currentPeople)
      : currentPeople;
  },
  [selectedPlace?.capacityFamily]
);

useEffect(() => {
  if (!selectedPlace?._id) {
    setOccupancyDraft({
      currentOccupants: "0",
      currentFamilies: "0",
      occupiedBeds: "0",
    });
    return;
  }

  const currentOccupants = Number(selectedPlace.currentOccupants || 0);
  const familyLimit = getFamilyLimit(currentOccupants);
  const currentFamilies = Math.min(
    Number(selectedPlace.currentFamilies || 0),
    familyLimit
  );

  setOccupancyDraft({
    currentOccupants: String(currentOccupants),
    currentFamilies: String(currentFamilies),
    occupiedBeds: String(getDerivedOccupiedBeds(currentOccupants)),
  });
}, [
  selectedPlace?._id,
  selectedPlace?.currentOccupants,
  selectedPlace?.currentFamilies,
  selectedPlace?.capacityFamily,
  selectedPlace?.bedCapacity,
  getDerivedOccupiedBeds,
  getFamilyLimit,
]);

const handleOccupancyDraftChange = useCallback((field, value) => {
  if (field === "occupiedBeds") return;

  const cleaned = String(value || "").replace(/[^\d]/g, "");
  const nextNumber = Number(cleaned || 0);

  setOccupancyDraft((prev) => ({
    ...prev,
    ...(field === "currentOccupants"
      ? (() => {
          const maxIndividuals = Number(selectedPlace?.capacityIndividual || 0);
          const nextPeople =
            maxIndividuals > 0
              ? Math.min(nextNumber, maxIndividuals)
              : nextNumber;
          const nextFamilyLimit = getFamilyLimit(nextPeople);
          const nextFamilies = Math.min(
            Number(prev.currentFamilies || 0),
            nextFamilyLimit
          );

          return {
            currentOccupants: cleaned === "" ? "" : String(nextPeople),
            currentFamilies: String(nextFamilies),
            occupiedBeds: String(getDerivedOccupiedBeds(nextPeople)),
          };
        })()
      : (() => {
          const familyLimit = getFamilyLimit(prev.currentOccupants);
          const nextFamilies = Math.min(nextNumber, familyLimit);

          return {
            currentFamilies: cleaned === "" ? "" : String(nextFamilies),
            occupiedBeds: String(getDerivedOccupiedBeds(prev.currentOccupants)),
          };
        })()),
  }));
}, [getDerivedOccupiedBeds, getFamilyLimit, selectedPlace?.capacityIndividual]);

const handleOccupancyStep = useCallback(
  (field, delta) => {
    if (!selectedPlace || field === "occupiedBeds") return;

    setOccupancyDraft((prev) => {
      const currentValue = Number(prev[field] || 0);
      const maxValue =
        field === "currentOccupants"
          ? Number(selectedPlace.capacityIndividual || 0)
          : getFamilyLimit(prev.currentOccupants);
      let nextValue = currentValue + delta;

      if (nextValue < 0) nextValue = 0;
      if (maxValue > 0 && nextValue > maxValue) nextValue = maxValue;

      if (field === "currentOccupants") {
        const nextFamilyLimit = getFamilyLimit(nextValue);
        return {
          ...prev,
          currentOccupants: String(nextValue),
          currentFamilies: String(
            Math.min(Number(prev.currentFamilies || 0), nextFamilyLimit)
          ),
          occupiedBeds: String(getDerivedOccupiedBeds(nextValue)),
        };
      }

      return {
        ...prev,
        currentFamilies: String(nextValue),
        occupiedBeds: String(getDerivedOccupiedBeds(prev.currentOccupants)),
      };
    });
  },
  [getDerivedOccupiedBeds, getFamilyLimit, selectedPlace]
);

const hasOccupancyChanges = useMemo(() => {
  if (!selectedPlace) return false;

  return (
    Number(occupancyDraft.currentOccupants || 0) !==
      Number(selectedPlace.currentOccupants || 0) ||
    Number(occupancyDraft.currentFamilies || 0) !==
      Number(selectedPlace.currentFamilies || 0) ||
    Number(occupancyDraft.occupiedBeds || 0) !==
      Number(selectedPlace.occupiedBeds || 0)
  );
}, [occupancyDraft, selectedPlace]);

const handleResetOccupancyDraft = useCallback(() => {
  if (!selectedPlace) return;

  const currentOccupants = Number(selectedPlace.currentOccupants || 0);
  const currentFamilies = Math.min(
    Number(selectedPlace.currentFamilies || 0),
    getFamilyLimit(currentOccupants)
  );

  setOccupancyDraft({
    currentOccupants: String(currentOccupants),
    currentFamilies: String(currentFamilies),
    occupiedBeds: String(getDerivedOccupiedBeds(currentOccupants)),
  });
}, [getDerivedOccupiedBeds, getFamilyLimit, selectedPlace]);

const handleSaveOccupancy = useCallback(async ({ silent = false } = {}) => {
  if (!selectedPlace?._id || savingOccupancy) return;

  const nextOccupants = Number(occupancyDraft.currentOccupants || 0);
  const familyLimit = getFamilyLimit(nextOccupants);
  const nextFamilies = Math.min(
    Number(occupancyDraft.currentFamilies || 0),
    familyLimit
  );
  const nextBeds = getDerivedOccupiedBeds(nextOccupants);
  const maxIndividuals = Number(selectedPlace.capacityIndividual || 0);

  if (nextOccupants < 0 || nextFamilies < 0 || nextBeds < 0) {
    pushNotification("Occupancy values cannot be negative.", "error");
    return;
  }

  if (maxIndividuals > 0 && nextOccupants > maxIndividuals) {
    pushNotification(
      `Individuals cannot exceed capacity of ${formatNumber(maxIndividuals)}.`,
      "error"
    );
    return;
  }

  if (nextFamilies > familyLimit) {
    pushNotification(
      `Families cannot exceed current people count of ${formatNumber(
        nextOccupants
      )}.`,
      "error"
    );
    return;
  }

  setSavingOccupancy(true);

  try {
    const res = await axios.put(
      `${BASE_URL}/evacs/${selectedPlace._id}/occupancy`,
      {
        currentOccupants: nextOccupants,
        currentFamilies: nextFamilies,
        occupiedBeds: nextBeds,
      },
      { withCredentials: true }
    );

    const updatedPlace = res.data?.place || res.data;

    updatePlaceInLocalState(updatedPlace);

    setRecentStatusUpdate({
      id: updatedPlace._id,
      status: updatedPlace.capacityStatus,
    });

    const params = buildEvacQueryParams();
    await Promise.all([fetchHistory(params), fetchAnalytics(params)]);

    if (!silent) {
      pushNotification(
        `Occupancy saved: ${formatNumber(
          updatedPlace.currentOccupants || 0
        )}/${formatNumber(updatedPlace.capacityIndividual || 0)} people.`,
        "success"
      );
    }
  } catch (error) {
    console.error("Save occupancy error:", error);
    pushNotification(
      error?.response?.data?.message || "Failed to save occupancy.",
      "error"
    );
  } finally {
    setSavingOccupancy(false);
  }
}, [
  selectedPlace,
  savingOccupancy,
  occupancyDraft,
  pushNotification,
  updatePlaceInLocalState,
  buildEvacQueryParams,
  fetchHistory,
  fetchAnalytics,
  getDerivedOccupiedBeds,
  getFamilyLimit,
]);

useEffect(() => {
  if (!selectedPlace?._id || !hasOccupancyChanges || savingOccupancy) {
    return undefined;
  }

  if (occupancyAutoSaveTimerRef.current) {
    clearTimeout(occupancyAutoSaveTimerRef.current);
  }

  occupancyAutoSaveTimerRef.current = setTimeout(() => {
    handleSaveOccupancy({ silent: true });
  }, 700);

  return () => {
    if (occupancyAutoSaveTimerRef.current) {
      clearTimeout(occupancyAutoSaveTimerRef.current);
    }
  };
}, [selectedPlace?._id, hasOccupancyChanges, savingOccupancy, handleSaveOccupancy]);

  const handleStatusChange = useCallback(
    async (nextStatus) => {
      if (!selectedPlace?._id || !nextStatus) return;

      try {
        await axios.put(
          `${BASE_URL}/evacs/${selectedPlace._id}/status`,
          { capacityStatus: nextStatus },
          { withCredentials: true }
        );

        await refreshDataAfterMutation();
        setRecentStatusUpdate({
          id: selectedPlace._id,
          status: nextStatus,
        });
        pushNotification(
          nextStatus === "full"
            ? "Capacity marked full. Review nearby areas for reallocation."
            : nextStatus === "limited"
            ? "Capacity marked limited. Continue monitoring this area."
            : "Capacity status updated.",
          nextStatus === "available" ? "success" : "warning"
        );
      } catch (error) {
        console.error("Update status error:", error);
        pushNotification(
          error?.response?.data?.message || "Failed to update capacity status.",
          "error"
        );
      }
    },
    [selectedPlace, refreshDataAfterMutation, pushNotification]
  );

  const handleLandingVisibilityToggle = useCallback(async () => {
    if (!selectedPlace?._id || landingToggleLoading || !isPrivilegedOps) return;

    setLandingToggleLoading(true);
    try {
      await axios.put(
        `${BASE_URL}/evacs/${selectedPlace._id}`,
        {
          ...selectedPlace,
          showOnLanding: selectedPlace.showOnLanding === false,
        },
        { withCredentials: true }
      );

      await refreshDataAfterMutation();
      pushNotification("Landing visibility updated.", "success");
    } catch (error) {
      console.error("Landing toggle error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to update landing visibility.",
        "error"
      );
    } finally {
      setLandingToggleLoading(false);
    }
  }, [
    selectedPlace,
    landingToggleLoading,
    isPrivilegedOps,
    refreshDataAfterMutation,
    pushNotification,
  ]);

  const handleShowAllOnLanding = useCallback(async () => {
    if (bulkLandingLoading || !isPrivilegedOps) return;

    setBulkLandingLoading(true);
    try {
      const targets = activePlaces.filter((item) => item.showOnLanding === false);

      await Promise.all(
        targets.map((item) =>
          axios.put(
            `${BASE_URL}/evacs/${item._id}`,
            { ...item, showOnLanding: true },
            { withCredentials: true }
          )
        )
      );

      await refreshDataAfterMutation();
      pushNotification("All evacuation areas are now public.", "success");
    } catch (error) {
      console.error("Bulk landing toggle error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to show all public areas.",
        "error"
      );
    } finally {
      setBulkLandingLoading(false);
    }
  }, [
    bulkLandingLoading,
    isPrivilegedOps,
    activePlaces,
    refreshDataAfterMutation,
    pushNotification,
  ]);

  const handleHideAllOnLanding = useCallback(async () => {
    if (bulkLandingLoading || !isPrivilegedOps) return;

    setBulkLandingLoading(true);
    try {
      const targets = activePlaces.filter((item) => item.showOnLanding !== false);

      await Promise.all(
        targets.map((item) =>
          axios.put(
            `${BASE_URL}/evacs/${item._id}`,
            { ...item, showOnLanding: false },
            { withCredentials: true }
          )
        )
      );

      await refreshDataAfterMutation();
      pushNotification("All evacuation areas are now hidden from public.", "success");
    } catch (error) {
      console.error("Bulk landing toggle error:", error);
      pushNotification(
        error?.response?.data?.message || "Failed to hide all public areas.",
        "error"
      );
    } finally {
      setBulkLandingLoading(false);
    }
  }, [
    bulkLandingLoading,
    isPrivilegedOps,
    activePlaces,
    refreshDataAfterMutation,
    pushNotification,
  ]);

  const confirmBulkPublicVisibility = useCallback(async () => {
    const action = bulkPublicAction;
    setBulkPublicAction(null);

    if (action === "show") {
      await handleShowAllOnLanding();
      return;
    }

    if (action === "hide") {
      await handleHideAllOnLanding();
    }
  }, [bulkPublicAction, handleShowAllOnLanding, handleHideAllOnLanding]);

    const renderNotificationStack = () =>
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={`notification-stack ${
              pickMode ? "pick-mode-offset" : ""
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notification-toast ${notification.type}`}
                onClick={() => removeNotification(notification.id)}
                title="Dismiss notification"
              >
                <span className="notification-icon" aria-hidden="true">
                  {getInventoryStyleNotificationIcon(notification.type)}
                </span>
                <span className="notification-text">
                  {notification.message}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  const renderFormModal = ({
    open,
    title,
    onSubmit,
    onClose,
    submitText,
  }) => {
    if (!open) return null;

    const ownBarangay = resolveOwnBarangay();

    return createPortal(
      <div
        className="evac-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={onClose}
      >
        <div
          className="evac-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="evac-modal-header">
            <div>
              <h3>{title}</h3>
              <p>
                Fill in the evacuation area details. Use the picked map location
                or manually adjust the coordinates if needed.
              </p>
            </div>
            <button
              type="button"
              className="evac-modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <FaTimes />
            </button>
          </div>

          <form className="evac-modal-form" onSubmit={onSubmit}>
            <div className="evac-form-grid">
              <section className="evac-form-section">
                <div className="section-title">Basic Information</div>

                <div className="field">
                  <span>Evacuation Area Name</span>
                  <input
                    ref={nameRef}
                    className={formErrors.name ? "input-error" : ""}
                    type="text"
                    name="name"
                    value={formData.name}
                    maxLength={MAX_EVAC_NAME_LENGTH}
                    onChange={handleTextFieldChange}
                    placeholder="Enter evacuation area name"
                  />
                  {formErrors.name && (
                    <small className="field-error">{formErrors.name}</small>
                  )}
                </div>

                <div className="field">
                  <span>Location</span>
                  <input
                    className={formErrors.location ? "input-error" : ""}
                    type="text"
                    name="location"
                    value={formData.location}
                    maxLength={MAX_LOCATION_LENGTH}
                    onChange={handleTextFieldChange}
                    placeholder="Street, sitio, purok, landmark"
                  />
                  {formErrors.location && (
                    <small className="field-error">{formErrors.location}</small>
                  )}
                </div>

                <div className="field">
                  <span>Barangay</span>
                  {isBarangayRole ? (
                    <input
                      className={formErrors.barangay ? "input-error" : ""}
                      type="text"
                      value={ownBarangay?.name || localBarangayName || ""}
                      disabled
                    />
                  ) : !showEditForm && barangayLocked ? (
                    <>
                      <input
                        className={formErrors.barangay ? "input-error" : ""}
                        type="text"
                        value={formData.barangayName || ""}
                        disabled
                      />
                      <small className="field-note">
                        Locked from the map location you selected.
                      </small>
                    </>
                  ) : (
                    <select
                      className={formErrors.barangay ? "input-error" : ""}
                      value={formData.barangayId || ""}
                      onChange={(e) => {
                        clearFormError("barangay");
                        const selected = barangays.find(
                          (item) => String(item._id) === String(e.target.value)
                        );

                        setFormData((prev) => ({
                          ...prev,
                          barangayId: selected?._id || "",
                          barangayName: selected?.name || "",
                        }));
                      }}
                    >
                      <option value="">Select barangay</option>
                      {barangays.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {formErrors.barangay && (
                    <small className="field-error">{formErrors.barangay}</small>
                  )}
                </div>

                <div className="inline-field-row two">
                  <div className="field">
                    <span>Latitude</span>
                    <input
                      className={formErrors.latitude ? "input-error" : ""}
                      type="number"
                      step="any"
                      value={formData.latitude ?? ""}
                      onChange={handleLatitudeChange}
                      placeholder="Latitude"
                    />
                    {formErrors.latitude && (
                      <small className="field-error">{formErrors.latitude}</small>
                    )}
                  </div>

                  <div className="field">
                    <span>Longitude</span>
                    <input
                      className={formErrors.longitude ? "input-error" : ""}
                      type="number"
                      step="any"
                      value={formData.longitude ?? ""}
                      onChange={handleLongitudeChange}
                      placeholder="Longitude"
                    />
                    {formErrors.longitude && (
                      <small className="field-error">{formErrors.longitude}</small>
                    )}
                  </div>
                </div>
              </section>

              <section className="evac-form-section">
                <div className="section-title">Capacity</div>

                <div className="inline-field-row three">
                  <div className="field">
                    <span>Individual Capacity</span>
                    <input
                      className={formErrors.capacityIndividual ? "input-error" : ""}
                      type="text"
                      name="capacityIndividual"
                      value={formData.capacityIndividual}
                      inputMode="numeric"
                      maxLength={7}
                      onChange={handleNumericFieldChange}
                      placeholder="0"
                    />
                    {formErrors.capacityIndividual && (
                      <small className="field-error">
                        {formErrors.capacityIndividual}
                      </small>
                    )}
                  </div>

                  <div className="field">
                    <span>Family Capacity</span>
                    <input
                      className={formErrors.capacityFamily ? "input-error" : ""}
                      type="text"
                      name="capacityFamily"
                      value={formData.capacityFamily}
                      inputMode="numeric"
                      maxLength={7}
                      onChange={handleNumericFieldChange}
                      placeholder="0"
                    />
                    {formErrors.capacityFamily && (
                      <small className="field-error">
                        {formErrors.capacityFamily}
                      </small>
                    )}
                  </div>

                  <div className="field">
                    <span>Bed Capacity</span>
                    <input
                      className={formErrors.bedCapacity ? "input-error" : ""}
                      type="text"
                      name="bedCapacity"
                      value={formData.bedCapacity}
                      inputMode="numeric"
                      maxLength={7}
                      onChange={handleNumericFieldChange}
                      placeholder="0"
                    />
                    {formErrors.bedCapacity && (
                      <small className="field-error">{formErrors.bedCapacity}</small>
                    )}
                  </div>
                </div>

                <div className="field">
                  <span>Floor Area</span>
                  <input
                    className={formErrors.floorArea ? "input-error" : ""}
                    type="text"
                    name="floorArea"
                    value={formData.floorArea}
                    inputMode="decimal"
                    maxLength={10}
                    onChange={handleNumericFieldChange}
                    placeholder="0"
                  />
                  {formErrors.floorArea && (
                    <small className="field-error">{formErrors.floorArea}</small>
                  )}
                </div>

                <div className="field">
                  <span>Remarks</span>
                  <textarea
                    className={formErrors.remarks ? "input-error" : ""}
                    name="remarks"
                    rows={5}
                    value={formData.remarks}
                    maxLength={MAX_REMARKS_LENGTH}
                    onChange={handleTextFieldChange}
                    placeholder="Add notes, accessibility concerns, or suitability remarks"
                  />
                  {formErrors.remarks && (
                    <small className="field-error">{formErrors.remarks}</small>
                  )}
                </div>
              </section>

              <section className="evac-form-section">
                <div className="section-title">Facilities</div>

                <div className="checkbox-grid">
                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.femaleCR}
                      onChange={(e) =>
                        updateFormField("femaleCR", e.target.checked)
                      }
                    />
                    <span>Female CR</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.maleCR}
                      onChange={(e) =>
                        updateFormField("maleCR", e.target.checked)
                      }
                    />
                    <span>Male CR</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.commonCR}
                      onChange={(e) =>
                        updateFormField("commonCR", e.target.checked)
                      }
                    />
                    <span>Common CR</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.potableWater}
                      onChange={(e) =>
                        updateFormField("potableWater", e.target.checked)
                      }
                    />
                    <span>Potable Water</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.nonPotableWater}
                      onChange={(e) =>
                        updateFormField("nonPotableWater", e.target.checked)
                      }
                    />
                    <span>Non-Potable Water</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.isPermanent}
                      onChange={(e) =>
                        updateFormField("isPermanent", e.target.checked)
                      }
                    />
                    <span>Permanent Site</span>
                  </label>

                  <label className="check-chip">
                    <input
                      type="checkbox"
                      checked={formData.isCovidFacility}
                      onChange={(e) =>
                        updateFormField("isCovidFacility", e.target.checked)
                      }
                    />
                    <span>COVID Facility</span>
                  </label>

                  {!isBarangayRole && (
                    <label className="check-chip single-toggle">
                      <input
                        type="checkbox"
                        checked={formData.showOnLanding}
                        onChange={(e) =>
                          updateFormField("showOnLanding", e.target.checked)
                        }
                      />
                      <span>Show on public landing page</span>
                    </label>
                  )}
                </div>
              </section>
            </div>

            <div className="evac-modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={onClose}
                disabled={loadingSave}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-btn"
                disabled={loadingSave}
              >
                {loadingSave ? "Saving..." : submitText}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    );
  };

  const renderArchiveConfirm = () => {
    if (!showArchiveConfirm || !selectedPlace) return null;

    return createPortal(
      <div
        className="evac-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Archive evacuation area"
        onClick={() => setShowArchiveConfirm(false)}
      >
        <div
          className="evac-modal-card confirm-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="evac-modal-header">
            <div>
              <h3>Archive Evacuation Area</h3>
              <p>
                This will archive <strong>{selectedPlace.name}</strong>.
              </p>
            </div>
            <button
              type="button"
              className="evac-modal-close"
              onClick={() => setShowArchiveConfirm(false)}
              aria-label="Close archive confirmation"
            >
              <FaTimes />
            </button>
          </div>

          <div className="confirm-copy">
            Archived evacuation areas will no longer appear in the active list.
          </div>

          <div className="evac-modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowArchiveConfirm(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="danger-btn"
              onClick={handleArchivePlace}
              disabled={loadingSave}
            >
              {loadingSave ? "Archiving..." : "Archive"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderDeleteConfirm = () => {
    if (!showDeleteConfirm || !selectedPlace) return null;

    return createPortal(
      <div
        className="evac-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Delete archived evacuation area"
        onClick={() => setShowDeleteConfirm(false)}
      >
        <div
          className="evac-modal-card confirm-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="evac-modal-header">
            <div>
              <h3>Delete Archived Area</h3>
              <p>
                This will permanently delete <strong>{selectedPlace.name}</strong>.
              </p>
            </div>
            <button
              type="button"
              className="evac-modal-close"
              onClick={() => setShowDeleteConfirm(false)}
              aria-label="Close delete confirmation"
            >
              <FaTimes />
            </button>
          </div>

          <div className="confirm-copy">
            This action cannot be undone and will remove the archived evacuation
            area from the system.
          </div>

          <div className="evac-modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="danger-btn"
              onClick={handlePermanentDeletePlace}
              disabled={loadingSave}
            >
              {loadingSave ? "Deleting..." : "Delete Area"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderBulkPublicConfirm = () => {
    if (!bulkPublicAction) return null;

    const isShow = bulkPublicAction === "show";
    const affectedCount = isShow
      ? activePlaces.filter((item) => item.showOnLanding === false).length
      : activePlaces.filter((item) => item.showOnLanding !== false).length;

    return createPortal(
      <div
        className="rrl-modal-backdrop evac-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm public visibility change"
        onClick={() => setBulkPublicAction(null)}
      >
        <div
          className="rrl-modal-card evac-confirm-card"
          onClick={(e) => e.stopPropagation()}
        >
          <h3>{isShow ? "Show all public areas?" : "Hide all public areas?"}</h3>
          <p>
            This will affect {formatNumber(affectedCount)} evacuation area
            {affectedCount === 1 ? "" : "s"}.{" "}
            {isShow
              ? "They will become visible on the public landing page."
              : "They will be hidden from the public landing page."}
          </p>

          <div className="rrl-modal-actions evac-confirm-actions">
            <button
              type="button"
              className="rrl-btn rrl-btn-secondary"
              onClick={() => setBulkPublicAction(null)}
              disabled={bulkLandingLoading}
            >
              Go Back
            </button>

            <button
              type="button"
              className={`rrl-btn ${
                isShow ? "rrl-btn-primary" : "rrl-btn-danger"
              }`}
              onClick={confirmBulkPublicVisibility}
              disabled={bulkLandingLoading || !affectedCount}
            >
              {bulkLandingLoading
                ? "Saving..."
                : isShow
                ? "Show All Public"
                : "Hide All Public"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (loadingPage) {
    return (
      <DashboardShell>
        <div className="evac-dashboard-page">
          <div className="loading-state-page">
            <div className="loading-card evac-loading-card">
              <span className="loading-spinner" aria-hidden="true" />
              <div>
                <strong>Loading evacuation management</strong>
                <span>Preparing map, barangay records, and capacity status.</span>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div
        ref={evacPageTopRef}
        className={`evac-dashboard-page ${
          isBarangayRole ? "barangay-mode-page" : ""
        }`}
      >
        {renderNotificationStack()}

        <section className="evac-dashboard-header">
          <div className="evac-dashboard-heading">
            <div className="eyebrow">
              <FaMapMarkedAlt aria-hidden="true" />
              Operations
            </div>
            <h1>Evacuation Management</h1>
            <p>{getCapacityPressureLabel(effectiveAnalytics)}</p>
          </div>

          <div className="evac-dashboard-actions">
            <button
              type="button"
              className="primary-btn export-pdf-header-btn"
              onClick={exportPlacesPdf}
              title="Export evacuation places as PDF"
            >
              <FaFilePdf aria-hidden="true" />
              Export PDF
            </button>

            {!isBarangayRole && (
              <button
                type="button"
                className="ghost-btn public-toggle-header-btn bulk-public-btn"
                onClick={() => setBulkPublicAction("show")}
                disabled={bulkLandingLoading || !isPrivilegedOps || !activePlaces.length}
                title="Show all evacuation areas on public landing page"
              >
                <FaEye aria-hidden="true" />
                {bulkLandingLoading ? "Showing..." : "Show All Public"}
              </button>
            )}

            {!isBarangayRole && (
              <button
                type="button"
                className="ghost-btn public-toggle-header-btn bulk-public-btn"
                onClick={() => setBulkPublicAction("hide")}
                disabled={bulkLandingLoading || !isPrivilegedOps || !activePlaces.length}
                title="Hide all evacuation areas from public landing page"
              >
                <FaEyeSlash aria-hidden="true" />
                {bulkLandingLoading ? "Saving..." : "Hide All Public"}
              </button>
            )}

          </div>
        </section>

        {!!warningInsights.length && (
          <section className="warning-stack">
            {warningInsights.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`warning-banner ${item.tone}`}
              >
                <span className="warning-banner-icon" aria-hidden="true">
                  <FaExclamationTriangle />
                </span>
                <div>
                  <div className="warning-banner-title">{item.title}</div>
                  <div className="warning-banner-text">{item.text}</div>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="evac-summary-grid-six">
          <SummaryCard
            tone="accent"
            icon={<FaBuilding />}
            label="Evacuation Areas"
            value={formatNumber(effectiveAnalytics.totalPlaces)}
            sub=""
          />

          <SummaryCard
            tone="success"
            icon={<FaCheckCircle />}
            label="Available"
            value={formatNumber(effectiveAnalytics.availableCount)}
            sub=""
          />

          <SummaryCard
            tone="warning"
            icon={<FaExclamationTriangle />}
            label="Limited"
            value={formatNumber(effectiveAnalytics.limitedCount)}
            sub=""
            urgent={effectiveAnalytics.limitedCount > 0}
          />

          <SummaryCard
            tone="danger"
            icon={<FaTimesCircle />}
            label="Full"
            value={formatNumber(effectiveAnalytics.fullCount)}
            sub=""
            urgent={effectiveAnalytics.fullCount > 0}
          />

          <SummaryCard
            tone="neutral"
            icon={<FaArchive />}
            label="Archived"
            value={formatNumber(effectiveAnalytics.archivedCount || 0)}
            sub=""
          />

          <SummaryCard
            tone="muted"
            icon={<FaUser />}
            label="Individual Capacity"
            value={formatNumber(effectiveAnalytics.totalIndividualCapacity)}
            sub=""
          />
        </section>

        <section
          className={`evac-top-filters ${
            isBarangayRole ? "barangay-mode" : ""
          }`}
        >
          <div className="filter-field">
            <span>
              <FaSearch aria-hidden="true" />
              Search
            </span>
            <input
              type="text"
              placeholder="Search evacuation area, location, barangay, remarks"
              value={search}
              maxLength={MAX_SEARCH_LENGTH}
              onChange={(e) =>
                setSearch(sanitizeInputText(e.target.value, MAX_SEARCH_LENGTH))
              }
            />
          </div>

          <div className="filter-field">
            <span>
              <FaFilter aria-hidden="true" />
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="full">Full</option>
            </select>
          </div>

          {!isBarangayRole && (
            <div className="filter-field">
              <span>
                <FaBuilding aria-hidden="true" />
                Barangay
              </span>
              <select
                value={barangayFilter}
                onChange={(e) => handleBarangaySelect(e.target.value)}
              >
                <option value="all">All barangays</option>
                {barangayCards.map((item) => (
                  <option key={item.barangayName} value={item.barangayName}>
                    {item.barangayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-field">
            <span>
              <FaSortAmountDown aria-hidden="true" />
              Sort
            </span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="capacity">Capacity</option>
              <option value="status">Status</option>
              <option value="barangay">Barangay</option>
              <option value="name">Name</option>
            </select>
          </div>
        </section>

        <div
          className={`evac-main-layout ${
            isBarangayRole ? "barangay-layout" : ""
          }`}
        >
          {!isBarangayRole && (
            <aside className="evac-left-panel">
              <div className="panel-head barangay-overview-head">
                <h2>Barangay Overview</h2>
                <div
                  className="barangay-overview-legend"
                  aria-label="Barangay overview legend"
                >
                  <span className="overview-legend-item">
                    <span className="overview-legend-dot available" />
                    Available
                  </span>
                  <span className="overview-legend-item">
                    <span className="overview-legend-dot limited" />
                    Limited
                  </span>
                  <span className="overview-legend-item">
                    <span className="overview-legend-dot full" />
                    Full
                  </span>
                  <span className="overview-legend-item">
                    <span className="overview-legend-dot archived" />
                    Archived
                  </span>
                </div>
              </div>

              <div className="barangay-list scroll-panel">
                <button
                  type="button"
                  className={`barangay-card ${
                    barangayFilter === "all" ? "active" : ""
                  }`}
                  onClick={() => handleBarangaySelect("all")}
                >
                  <div className="barangay-card-top">
                    <strong>All Barangays</strong>
                    <span>{formatNumber(overallSummary.totalPlaces)} areas</span>
                  </div>

                  <div className="barangay-card-statuses barangay-card-statuses-compact">
                    <span
                      className="mini-status available"
                      title="Available"
                      aria-label={`${formatNumber(overallSummary.availableCount)} available`}
                    >
                      {formatNumber(overallSummary.availableCount)}
                    </span>
                    <span
                      className="mini-status limited"
                      title="Limited"
                      aria-label={`${formatNumber(overallSummary.limitedCount)} limited`}
                    >
                      {formatNumber(overallSummary.limitedCount)}
                    </span>
                    <span
                      className="mini-status full"
                      title="Full"
                      aria-label={`${formatNumber(overallSummary.fullCount)} full`}
                    >
                      {formatNumber(overallSummary.fullCount)}
                    </span>
                    <span
                      className="mini-status archived"
                      title="Archived"
                      aria-label={`${formatNumber(overallSummary.archivedCount)} archived`}
                    >
                      {formatNumber(overallSummary.archivedCount)}
                    </span>
                  </div>
                </button>

                {barangayCards.map((item) => (
                  <button
                    type="button"
                    key={item.barangayName}
                    className={`barangay-card ${
                      normalizeBarangayKey(barangayFilter) ===
                      normalizeBarangayKey(item.barangayName)
                        ? "active"
                        : ""
                    }`}
                    onClick={() => handleBarangaySelect(item.barangayName)}
                  >
                    <div className="barangay-card-top">
                      <strong>{item.barangayName}</strong>
                      <span>{formatNumber(item.placesCount)} areas</span>
                    </div>

                    <div className="barangay-card-statuses barangay-card-statuses-compact">
                      <span
                        className="mini-status available"
                        title="Available"
                        aria-label={`${formatNumber(item.availableCount)} available`}
                      >
                        {formatNumber(item.availableCount)}
                      </span>
                      <span
                        className="mini-status limited"
                        title="Limited"
                        aria-label={`${formatNumber(item.limitedCount)} limited`}
                      >
                        {formatNumber(item.limitedCount)}
                      </span>
                      <span
                        className="mini-status full"
                        title="Full"
                        aria-label={`${formatNumber(item.fullCount)} full`}
                      >
                        {formatNumber(item.fullCount)}
                      </span>
                      <span
                        className="mini-status archived"
                        title="Archived"
                        aria-label={`${formatNumber(item.archivedCount)} archived`}
                      >
                        {formatNumber(item.archivedCount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          )}

          <section className="evac-map-panel">
            <div className="panel-head compact map-panel-head">
              <div className="map-panel-title-block">
                <h2>Evacuation Map</h2>
                <MapLegend inline />
              </div>

              <div className="map-panel-actions">
                <button
                  type="button"
                  className={`ghost-btn map-control-btn ${
                    markerLabelsVisible ? "is-active" : ""
                  }`}
                  onClick={() => setMarkerLabelsVisible((current) => !current)}
                  title={
                    markerLabelsVisible
                      ? "Nameplates are always visible. Click to switch to hover-only."
                      : "Nameplates appear on hover. Click to always show them."
                  }
                >
                  {markerLabelsVisible ? (
                    <FaEye aria-hidden="true" />
                  ) : (
                    <FaEyeSlash aria-hidden="true" />
                  )}
                  {markerLabelsVisible ? "Nameplates On" : "Hover Labels"}
                </button>
                {canAddArea && pickMode && (
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={cancelPickMode}
                  >
                    <FaTimes aria-hidden="true" />
                    Cancel Pick
                  </button>
                )}
              </div>
            </div>

            <div className="map-stage">
              {pickMode && (
                <div className="pick-mode-banner">
                  Pick mode is active. Click anywhere on the map to capture the
                  evacuation area location.
                </div>
              )}

              <EvacMap
                places={filteredPlaces}
                allPlaces={allPlaces}
                selectedPlaceId={selectedId}
                selectedPlace={selectedPlace}
                onSelectLocation={handleMapSelectLocation}
                onBlockedSelection={() => {
                  if (isBarangayRole) {
                    pushNotification(
                      "You can only pin an evacuation area inside your own barangay boundary.",
                      "error"
                    );
                  }
                }}
                onSelectPlace={(place) => {
                  if (!place?._id) return;
                  setSelectedId(place._id);
                  setPanelView("details");
                  setMobileTaskPanelOpen(true);
                  scrollEvacuationToTop();
                }}
                pickMode={pickMode}
                isBarangayRole={isBarangayRole}
                barangayName={localBarangayName}
                selectedBarangayName={selectedBarangayName}
                barangayBounds={barangayBounds}
                matchedBarangayBounds={matchedBarangayBounds}
                markerLabelsVisible={markerLabelsVisible}
              />

              {canAddArea && !pickMode && (
                <button
                  type="button"
                  className="map-add-place-floating"
                  onClick={handleStartPick}
                >
                  <div className="map-add-place-icon">
                    <FaPlus aria-hidden="true" />
                  </div>
                  <div className="map-add-place-content">
                    <div className="map-add-place-title">Add Evacuation Area</div>
                  </div>
                </button>
              )}

              {canAddArea && pickMode && (
                <button
                  type="button"
                  className="map-cancel-pick-floating"
                  onClick={cancelPickMode}
                >
                  Cancel Pick
                </button>
              )}
            </div>
          </section>

          <aside
            className={`evac-right-panel ${
              mobileTaskPanelOpen ? "mobile-open" : "mobile-collapsed"
            }`}
          >
            <button
              type="button"
              className="mobile-task-panel-toggle"
              onClick={() => setMobileTaskPanelOpen((open) => !open)}
              aria-expanded={mobileTaskPanelOpen}
              aria-controls="evac-task-panel-content"
            >
              <span>
                {mobileTaskPanelOpen ? "Hide task panel" : "Show task panel"}
              </span>
              {mobileTaskPanelOpen ? (
                <FaChevronDown aria-hidden="true" />
              ) : (
                <FaChevronUp aria-hidden="true" />
              )}
            </button>
            <div className="side-panel-tabs">
  <button
    type="button"
    className={`tab-btn ${panelView === "areas" && placeView === "active" ? "active" : ""}`}
    onClick={() => {
      setPlaceView("active");
      setPanelView("areas");
      setMobileTaskPanelOpen(true);
    }}
  >
    <FaListUl aria-hidden="true" />
    Areas
  </button>
  <button
    type="button"
    className={`tab-btn ${panelView === "areas" && placeView === "archived" ? "active" : ""}`}
    onClick={() => {
      setPlaceView("archived");
      setPanelView("areas");
      setMobileTaskPanelOpen(true);
    }}
  >
    <FaArchive aria-hidden="true" />
    Archived
  </button>
  <button
    type="button"
    className={`tab-btn ${panelView === "details" ? "active" : ""}`}
    onClick={() => {
      setPlaceView("active");
      setPanelView("details");
      setMobileTaskPanelOpen(true);
    }}
    disabled={!selectedPlace}
  >
    <FaClipboardList aria-hidden="true" />
    Details
  </button>
  <button
    type="button"
    className={`tab-btn ${panelView === "history" ? "active" : ""}`}
    onClick={() => {
      setPlaceView("active");
      setPanelView("history");
      setMobileTaskPanelOpen(true);
    }}
    disabled={!selectedPlace}
  >
    <FaHistory aria-hidden="true" />
    History
  </button>
</div>

            <div className="side-panel-body" id="evac-task-panel-content">
              {panelView === "areas" ? (
  <div className="side-block">
    <div className="side-block-header">
      <h3>Evacuation Areas</h3>
      <span>{formatNumber(filteredPlaces.length)} shown</span>
    </div>

    <div className="place-list expanded">
      {filteredPlaces.length ? (
        filteredPlaces.map((place) => (
          <button
            key={place._id}
            type="button"
            className={`place-card ${
              String(place._id) === String(selectedId)
                ? "selected"
                : ""
            } ${
              place?.isArchived ? "archived" : ""
            } ${
              recentStatusUpdate?.id &&
              String(recentStatusUpdate.id) === String(place._id)
                ? `status-just-updated ${getStatusClass(
                    recentStatusUpdate.status
                  )}`
                : ""
            }`}
            onClick={() => {
              setSelectedId(place._id);
              setPanelView("details");
              setMobileTaskPanelOpen(true);
              scrollEvacuationToTop();
            }}
          >
            <div className="place-card-top">
              <div>
                <div className="place-card-title">{place.name}</div>
                <div className="place-card-subtitle">
                  {place.location || "No location provided"}
                </div>
              </div>

              <div className="place-badge-stack">
                {place?.isArchived && (
                  <span className="archived-badge">Archived</span>
                )}
                <span
                  className={`status-pill status-${getStatusClass(
                    place.capacityStatus
                  )}`}
                >
                  {place.capacityStatus || "full"}
                </span>
                <span className="mini-neutral-badge">
                  {place.barangayName || "No barangay"}
                </span>
              </div>
            </div>

            <div className="place-card-meta">
  <span>
    People: {formatNumber(place.currentOccupants || 0)}/
    {formatNumber(place.capacityIndividual || 0)}
  </span>
  <span>
    Families: {formatNumber(place.currentFamilies || 0)}/
    {formatNumber(place.capacityFamily || 0)}
  </span>
  <span>
    Beds: {formatNumber(place.occupiedBeds || 0)}/
    {formatNumber(place.bedCapacity || 0)}
  </span>
</div>
          </button>
        ))
      ) : (
        <div className="empty-state-card empty-state-actionable">
          <span className="empty-state-icon" aria-hidden="true">
            <FaSearch />
          </span>
          <strong>
            {placeView === "archived"
              ? "No archived evacuation areas found"
              : "No evacuation areas found"}
          </strong>
          <span>Try clearing the search, status, or barangay filters.</span>
          <button type="button" className="ghost-btn" onClick={clearFilters}>
            <FaTimes aria-hidden="true" />
            Clear Filters
          </button>
        </div>
      )}
    </div>
  </div>
) : !selectedPlace ? (
  <div className="empty-state-card empty-state-actionable">
    <span className="empty-state-icon" aria-hidden="true">
      <FaClipboardList />
    </span>
    <strong>Select an evacuation area</strong>
    <span>Choose an area from the list or click a marker on the map.</span>
  </div>
) : panelView === "details" ? (
                <div className="details-stack">
                  <div className="side-block details-overview-block">
                    <div
                      className={`details-hero refined ${
                        recentStatusUpdate?.id &&
                        String(recentStatusUpdate.id) ===
                          String(selectedPlace._id)
                          ? `status-just-updated ${getStatusClass(
                              recentStatusUpdate.status
                            )}`
                          : ""
                      }`}
                    >
                      <div className="details-hero-main">
                        <div className="details-hero-eyebrow">Evacuation Area</div>
                        <h3>{selectedPlace.name}</h3>
                        <div className="place-card-subtitle">
                          {selectedPlace.location || "No location provided"}
                        </div>
                      </div>

                      <div className="details-hero-badges">
                        {selectedPlace?.isArchived ? (
                          <span className="archived-badge details-archived-badge">
                            Archived
                          </span>
                        ) : (
                          <span
                            className={`status-pill status-${getStatusClass(
                              selectedPlace.capacityStatus
                            )}`}
                          >
                            {selectedPlace.capacityStatus || "full"}
                          </span>
                        )}

                        <span
                          className={`landing-visibility-badge ${
                            selectedPlace.isArchived ||
                            selectedPlace.showOnLanding === false
                              ? "hidden"
                              : "visible"
                          }`}
                        >
                          <FaGlobeAsia aria-hidden="true" />
                          {selectedPlace.isArchived
                            ? "Archived from Public"
                            : selectedPlace.showOnLanding === false
                            ? "Hidden from Public"
                            : "Visible on Public"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {safeLower(selectedPlace.capacityStatus) === "full" && (
                    <div className="ops-guidance-card danger">
                      <div>
                        <strong>Area is full</strong>
                        <span>
                          Stop assigning evacuees here and review available
                          nearby areas before directing more people.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setStatusFilter("available");
                          setPanelView("areas");
                          setMobileTaskPanelOpen(true);
                        }}
                      >
                        Show Available
                      </button>
                    </div>
                  )}

                  <div className="details-kpi-grid occupancy-aware">
  {(() => {
    const occupancy = getOccupancyNumbers({
      ...selectedPlace,
      currentOccupants: Number(occupancyDraft.currentOccupants || 0),
      currentFamilies: Number(occupancyDraft.currentFamilies || 0),
      occupiedBeds: Number(occupancyDraft.occupiedBeds || 0),
    });
    const draftCapacityStatus = deriveCapacityStatusFromOccupancy(
      occupancy.currentOccupants,
      occupancy.capacityIndividual
    );

    return (
      <>
        <div className="detail-kpi-card occupancy-kpi-card">
          <span>
            <FaUser aria-hidden="true" />
            People Occupancy
          </span>
          <strong>
            {formatNumber(occupancy.currentOccupants)}
            <small>/{formatNumber(occupancy.capacityIndividual)}</small>
          </strong>
          <div className="occupancy-mini-progress">
            <div
              className={`occupancy-mini-fill ${getStatusClass(
                draftCapacityStatus
              )}`}
              style={{ width: `${occupancy.individualDisplayPercent}%` }}
            />
          </div>
          <em>
            {formatNumber(occupancy.remainingIndividuals)} remaining ·{" "}
            {occupancy.individualPercent}% used
          </em>
        </div>

        <div className="detail-kpi-card occupancy-kpi-card">
          <span>
            <FaUserFriends aria-hidden="true" />
            Family Occupancy
          </span>
          <strong>
            {formatNumber(occupancy.currentFamilies)}
            <small>/{formatNumber(occupancy.capacityFamily)}</small>
          </strong>
          <div className="occupancy-mini-progress">
            <div
              className="occupancy-mini-fill family"
              style={{ width: `${occupancy.familyDisplayPercent}%` }}
            />
          </div>
          <em>
            {formatNumber(occupancy.remainingFamilies)} remaining ·{" "}
            {occupancy.familyPercent}% used
          </em>
        </div>

        <div className="detail-kpi-card occupancy-kpi-card">
          <span>
            <FaBed aria-hidden="true" />
            Bed Occupancy
          </span>
          <strong>
            {formatNumber(occupancy.occupiedBeds)}
            <small>/{formatNumber(occupancy.bedCapacity)}</small>
          </strong>
          <div className="occupancy-mini-progress">
            <div
              className="occupancy-mini-fill bed"
              style={{ width: `${occupancy.bedDisplayPercent}%` }}
            />
          </div>
          <em>
            {formatNumber(occupancy.remainingBeds)} remaining ·{" "}
            {occupancy.bedPercent}% used
          </em>
        </div>

        <div className="detail-kpi-card">
          <span>
            <FaClipboardList aria-hidden="true" />
            Facilities
          </span>
          <strong>
            {formatNumber(selectedPlace.facilitiesCount || 0)}
          </strong>
        </div>
      </>
    );
  })()}
</div>

                  <div className="ops-card occupancy-control-card">
  {(() => {
    const occupancy = getOccupancyNumbers({
      ...selectedPlace,
      currentOccupants: Number(occupancyDraft.currentOccupants || 0),
      currentFamilies: Number(occupancyDraft.currentFamilies || 0),
      occupiedBeds: Number(occupancyDraft.occupiedBeds || 0),
    });
    const draftCapacityStatus = deriveCapacityStatusFromOccupancy(
      occupancy.currentOccupants,
      occupancy.capacityIndividual
    );
    const maxCurrentFamilies = getFamilyLimit(occupancyDraft.currentOccupants);

    return (
      <>
        <div className="ops-card-title">Occupancy Tracking</div>

        <div className="occupancy-status-head">
          <div>
            <strong>
              {formatNumber(occupancy.currentOccupants)}/
              {formatNumber(occupancy.capacityIndividual)}
            </strong>
            <span>
              {occupancy.capacityIndividual > 0
                ? `${occupancy.individualPercent}% people capacity used · ${formatNumber(
                    occupancy.remainingIndividuals
                  )} slots left`
                : "No individual capacity set"}
            </span>
          </div>

        </div>

        <div className="occupancy-progress-track">
          <div
            className={`occupancy-progress-fill ${getStatusClass(
              draftCapacityStatus
            )}`}
            style={{ width: `${occupancy.individualDisplayPercent}%` }}
          />
        </div>

        <div className="occupancy-control-grid">
          <div className="occupancy-control-row">
            <button
              type="button"
              className="occupancy-step-btn"
              onClick={() => handleOccupancyStep("currentOccupants", -1)}
              disabled={Number(occupancyDraft.currentOccupants || 0) <= 0}
              title="Remove one person"
            >
              −
            </button>

            <div className="occupancy-input-wrap">
              <label htmlFor="currentOccupantsInput">Current people</label>
              <input
                id="currentOccupantsInput"
                type="number"
                min="0"
                max={selectedPlace.capacityIndividual || undefined}
                value={occupancyDraft.currentOccupants}
                onChange={(e) =>
                  handleOccupancyDraftChange("currentOccupants", e.target.value)
                }
              />
            </div>

            <button
              type="button"
              className="occupancy-step-btn add"
              onClick={() => handleOccupancyStep("currentOccupants", 1)}
              disabled={
                Number(selectedPlace.capacityIndividual || 0) > 0 &&
                Number(occupancyDraft.currentOccupants || 0) >=
                  Number(selectedPlace.capacityIndividual || 0)
              }
              title="Add one person"
            >
              +
            </button>
          </div>

          <div className="occupancy-control-row">
            <button
              type="button"
              className="occupancy-step-btn"
              onClick={() => handleOccupancyStep("currentFamilies", -1)}
              disabled={Number(occupancyDraft.currentFamilies || 0) <= 0}
              title="Remove one family"
            >
              −
            </button>

            <div className="occupancy-input-wrap">
              <label htmlFor="currentFamiliesInput">Current families</label>
              <input
                id="currentFamiliesInput"
                type="number"
                min="0"
                max={maxCurrentFamilies || undefined}
                value={occupancyDraft.currentFamilies}
                onChange={(e) =>
                  handleOccupancyDraftChange("currentFamilies", e.target.value)
                }
              />
            </div>

            <button
              type="button"
              className="occupancy-step-btn add"
              onClick={() => handleOccupancyStep("currentFamilies", 1)}
              disabled={
                maxCurrentFamilies > 0 &&
                Number(occupancyDraft.currentFamilies || 0) >=
                  maxCurrentFamilies
              }
              title="Add one family"
            >
              +
            </button>
          </div>

          <div className="occupancy-control-row occupancy-control-row-auto">
            <button
              type="button"
              className="occupancy-auto-chip"
              disabled
              title="Occupied beds are automatically based on current people"
            >
              Auto
            </button>

            <div className="occupancy-input-wrap">
              <label htmlFor="occupiedBedsInput">Occupied beds</label>
              <input
                id="occupiedBedsInput"
                type="number"
                min="0"
                max={selectedPlace.bedCapacity || undefined}
                value={occupancyDraft.occupiedBeds}
                readOnly
                disabled
              />
            </div>

            <button
              type="button"
              className="occupancy-auto-note"
              disabled
              title="Occupied beds are automatically based on current people"
            >
              From people
            </button>
          </div>
        </div>

        <div className="status-action-grid status-action-grid-readonly">
          <button
            type="button"
            className={`status-action-btn available ${
              safeLower(draftCapacityStatus) === "available"
                ? "active"
                : ""
            }`}
            disabled
          >
            <FaCheckCircle aria-hidden="true" />
            Available
          </button>

          <button
            type="button"
            className={`status-action-btn limited ${
              safeLower(draftCapacityStatus) === "limited" ? "active" : ""
            }`}
            disabled
          >
            <FaExclamationTriangle aria-hidden="true" />
            Limited
          </button>

          <button
            type="button"
            className={`status-action-btn full ${
              safeLower(draftCapacityStatus) === "full" ? "active" : ""
            }`}
            disabled
          >
            <FaTimesCircle aria-hidden="true" />
            Full
          </button>
        </div>

        <div className="occupancy-save-row occupancy-autosave-row">
          <button
            type="button"
            className="ghost-btn"
            onClick={handleResetOccupancyDraft}
            disabled={!hasOccupancyChanges || savingOccupancy}
          >
            Reset
          </button>

          <span className="occupancy-autosave-status">
            {savingOccupancy
              ? "Saving..."
              : hasOccupancyChanges
              ? "Autosaves after changes"
              : "Saved"}
          </span>
        </div>

      </>
    );
  })()}
</div>

                  <div className="details-actions refined-actions">
                    {(isPrivilegedOps || isBarangayRole) && (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={openEditModal}
                        disabled={Boolean(selectedPlace?.isArchived)}
                      >
                        <FaEdit aria-hidden="true" />
                        Edit Details
                      </button>
                    )}

                    {(isPrivilegedOps || isBarangayRole) && (
                      selectedPlace?.isArchived ? (
                        <>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={handleUnarchivePlace}
                          >
                            <FaArchive aria-hidden="true" />
                            Unarchive Area
                          </button>

                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => setShowDeleteConfirm(true)}
                          >
                            <FaTimes aria-hidden="true" />
                            Delete Area
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => setShowArchiveConfirm(true)}
                        >
                          <FaArchive aria-hidden="true" />
                          Archive Area
                        </button>
                      )
                    )}
                  </div>

                  <div className="details-two-grid refined-two-grid">
                    <div className="meta-card">
                      <div className="side-block-header">
                        <h3>Area Information</h3>
                      </div>

                      <div className="meta-list">
                        <div className="meta-row">
                          <span>Barangay</span>
                          <strong>{selectedPlace.barangayName || "-"}</strong>
                        </div>
                        <div className="meta-row">
                          <span>Latitude</span>
                          <strong>{selectedPlace.latitude ?? "-"}</strong>
                        </div>
                        <div className="meta-row">
                          <span>Longitude</span>
                          <strong>{selectedPlace.longitude ?? "-"}</strong>
                        </div>
                        <div className="meta-row">
                          <span>Floor Area</span>
                          <strong>
                            {formatNumber(selectedPlace.floorArea || 0)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="meta-card">
                      <div className="side-block-header">
                        <h3>Facilities</h3>
                      </div>

                      <div className="facility-chip-group">
                        <span
                          className={`facility-chip ${
                            selectedPlace.femaleCR ? "active" : "inactive"
                          }`}
                        >
                          Female CR
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.maleCR ? "active" : "inactive"
                          }`}
                        >
                          Male CR
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.commonCR ? "active" : "inactive"
                          }`}
                        >
                          Common CR
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.potableWater ? "active" : "inactive"
                          }`}
                        >
                          Potable Water
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.nonPotableWater ? "active" : "inactive"
                          }`}
                        >
                          Non-Potable Water
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.isPermanent ? "active" : "inactive"
                          }`}
                        >
                          Permanent Site
                        </span>
                        <span
                          className={`facility-chip ${
                            selectedPlace.isCovidFacility ? "active" : "inactive"
                          }`}
                        >
                          COVID Facility
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="meta-card">
                    <div className="side-block-header">
                      <h3>Remarks</h3>
                    </div>
                    <div className="remarks-box">
                      {selectedPlace.remarks ? (
                        <p>{selectedPlace.remarks}</p>
                      ) : (
                        <span className="remarks-empty">No remarks available.</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="history-list">
                  {selectedPlaceHistory.length ? (
                    selectedPlaceHistory.map((item) => (
                      <article
                        key={item._id || `${item.placeName}-${item.createdAt}`}
                        className={`history-card ${getHistoryAccentClass(
                          item.action
                        )}`}
                      >
                        <div className="history-card-top">
                          <strong>{item.action || "Update"}</strong>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </div>

                        <div className="history-card-body">
                          <p>
                            <strong>Place:</strong> {item.placeName || selectedPlace.name}
                          </p>
                          <p>
                            <strong>Barangay:</strong>{" "}
                            {item.barangayName || selectedPlace.barangayName || "-"}
                          </p>
                          {item.details ? <p>{item.details}</p> : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state-card empty-state-actionable">
                      <span className="empty-state-icon" aria-hidden="true">
                        <FaHistory />
                      </span>
                      <strong>No history records</strong>
                      <span>
                        Updates for this evacuation area will appear here after
                        changes are made.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

        {renderFormModal({
          open: showAddForm,
          title: "Add Evacuation Area",
          onSubmit: handleSubmitAdd,
          onClose: () => {
            setShowAddForm(false);
            resetForm();
          },
          submitText: "Save Area",
        })}

        {renderFormModal({
          open: showEditForm,
          title: "Edit Evacuation Area",
          onSubmit: handleSubmitEdit,
          onClose: () => {
            setShowEditForm(false);
            resetForm();
          },
          submitText: "Save Changes",
        })}

        {renderArchiveConfirm()}
        {renderDeleteConfirm()}
        {renderBulkPublicConfirm()}
      </div>
    </DashboardShell>
  );
}
