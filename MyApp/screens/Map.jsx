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
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as turf from "@turf/turf";

import api, { postMultipart } from "../lib/api";
import { playDangerNotificationSound } from "../utils/notificationSounds";
import JaenWeatherForecast from "./components/JaenWeatherForecast";
import { UserContext } from "./UserContext";
import { MapContext } from "./contexts/MapContext";
import { NotificationContext } from "./contexts/NotificationContext";
import { useTheme } from "./contexts/ThemeContext";
import useRouting from "./hooks/useRouting";
import useHazardLayers, { FLOOD_STYLES } from "./hooks/useHazardLayers";
import { PillMarker } from "./MapIcon";
import {
  getClusterThresholdLevel,
  markClusterNotificationShown,
  shouldNotifyCluster,
} from "./services/notificationService";
import jaenGeoJSON from "./data/jaen.json";
import areasData from "./data/area.json";
import {
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_LOCATION_MAX_LENGTH,
  isValidCoordinate,
  normalizeCoordinate,
  sanitizeFreeTextInput,
  sanitizeFreeTextOnSubmit,
  sanitizeIncidentText,
  safeDisplayText,
  toNumber,
} from "./utils/validation";
import { rankEvacuationCentersForUser } from "./utils/evacuationRecommendations";

const EDGE_PADDING = {
  top: 120,
  bottom: 420,
  left: 60,
  right: 60,
};
const EVAC_ROUTE_EDGE_PADDING = {
  top: 110,
  bottom: 540,
  left: 70,
  right: 70,
};

const NAV_ZOOM = 18.5;
const NAV_PITCH = 55;
const NAV_CAMERA_HEADING_OFFSET = 0;
const NAV_CAMERA_THROTTLE_MS = 900;

const JAEN_INITIAL_REGION = {
  latitude: 15.32,
  longitude: 120.92,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const USER_POS = {
  latitude: 15.38,
  longitude: 120.91,
};


const SCREEN_HEIGHT = Dimensions.get("window").height;
const PANEL_HEIGHT = Math.min(SCREEN_HEIGHT * 0.84, 700);
const PANEL_MIN_OFFSET = 0;
const PANEL_MID_OFFSET = Math.round(PANEL_HEIGHT * 0.42);
const PANEL_DEFAULT_OFFSET = PANEL_MID_OFFSET;
const PANEL_MAX_OFFSET = PANEL_HEIGHT + 32;
const PANEL_DRAG_THRESHOLD = 24;
const PANEL_DRAG_CAPTURE_THRESHOLD = 36;
const FIELD_FOCUS_SCROLL_DELAY_MS = 260;
const FIELD_FOCUS_SCROLL_OFFSET = 88;
const INCIDENT_FORM_KEYBOARD_PADDING = 220;
const EVAC_SELECTION_RECENTER_DELAY_MS = 5000;
const NAV_PANEL_HEIGHT = Math.min(Math.max(SCREEN_HEIGHT * 0.34, 260), 310);
const NAV_PANEL_PEEK_HEIGHT = 82;
const NAV_PANEL_EXPANDED_OFFSET = 0;
const NAV_PANEL_COLLAPSED_OFFSET = Math.max(
  132,
  Math.round(NAV_PANEL_HEIGHT - NAV_PANEL_PEEK_HEIGHT)
);
const NAV_PANEL_HALF_OFFSET = Math.round(NAV_PANEL_COLLAPSED_OFFSET / 2);
const NAV_PANEL_DEFAULT_OFFSET = NAV_PANEL_HALF_OFFSET;
const NAV_PANEL_MAX_OFFSET = NAV_PANEL_COLLAPSED_OFFSET;
const INCIDENT_IMAGE_LIMIT = 2;
const INCIDENT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const SIMILAR_INCIDENT_TITLE = "Similar Incident Already Reported";
const SIMILAR_INCIDENT_MESSAGE =
  "A similar incident has already been reported in this area. Please check the existing report instead.";
const ROUTE_HAZARD_ROUTE_RADIUS_METERS = 100;
const ROUTE_HAZARD_THRESHOLDS_METERS = [300, 100];
const ROUTE_HAZARD_CHECK_INTERVAL_MS = 2500;
const INCIDENT_CLUSTER_MIN_REPORTS = 5;
const INCIDENT_CLUSTER_MIN_BARANGAYS = 2;

const MODULES = [
  { key: "incident", label: "Incident" },
  { key: "flood", label: "Flood" },
  { key: "earthquake", label: "Earthquake" },
  { key: "barangay", label: "Barangay" },
  { key: "evac", label: "Evac Place" },
];

const INCIDENT_LEVEL_COLOR = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

function normalizeIncidentStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isPublicIncident(incident) {
  const status = normalizeIncidentStatus(incident?.status);

  return (
    incident?.isPublic === true ||
    incident?.forceApproved === true ||
    incident?.approvedByMDRRMO === true ||
    status === "approved"
  );
}

function getIncidentImages(incident) {
  const images = Array.isArray(incident?.images) ? incident.images : [];
  const legacy = incident?.image?.fileUrl ? [incident.image] : [];
  return [...images, ...legacy].filter((item, index, arr) => {
    const url = item?.fileUrl;
    return url && arr.findIndex((candidate) => candidate?.fileUrl === url) === index;
  });
}

function getHeatStyle(count, maxCount, selected) {
  const safeCount = Number(count || 0);

  if (safeCount < 2) {
    return {
      strokeColor: selected ? "#FACC15" : "#16A34A",
      fillColor: "rgba(34, 197, 94, 0.14)",
      glowRgb: "34, 197, 94",
      strokeWidth: selected ? 3.5 : 1.75,
      glowWidth: 0,
      glowAlpha: 0,
      fillPulseAlpha: 0,
      glow: false,
    };
  }

  const level =
    safeCount >= 6
      ? "critical"
      : safeCount >= 4
        ? "high"
        : "medium";

  const palette = {
    low: {
      strokeColor: "#EAB308",
      fillColor: "rgba(250, 204, 21, 0.28)",
      glowRgb: "250, 204, 21",
      strokeWidth: 2.2,
      glowWidth: 5,
      glowAlpha: 0.38,
      fillPulseAlpha: 0.07,
    },
    medium: {
      strokeColor: "#EAB308",
      fillColor: "rgba(250, 204, 21, 0.3)",
      glowRgb: "250, 204, 21",
      strokeWidth: 2.75,
      glowWidth: 8,
      glowAlpha: 0.52,
      fillPulseAlpha: 0.09,
    },
    high: {
      strokeColor: "#EA580C",
      fillColor: "rgba(234, 88, 12, 0.44)",
      glowRgb: "234, 88, 12",
      strokeWidth: 3.1,
      glowWidth: 10,
      glowAlpha: 0.76,
      fillPulseAlpha: 0.13,
    },
    critical: {
      strokeColor: "#EF4444",
      fillColor: "rgba(239, 68, 68, 0.54)",
      glowRgb: "255, 31, 31",
      strokeWidth: 3.5,
      glowWidth: 12,
      glowAlpha: 0.92,
      fillPulseAlpha: 0.16,
    },
  }[level];

  return {
    ...palette,
    strokeColor: selected ? "#FACC15" : palette.strokeColor,
    strokeWidth: selected ? 3.5 : palette.strokeWidth,
    glow: true,
  };
}

const EVAC_STATUS_COLORS = {
  available: "#16a34a",
  limited: "#facc15",
  full: "#dc2626",
};
const DISTRICT_OPTIONS = [
  "District 1",
  "District 2",
  "District 3",
  "District 4",
];

const BARANGAY_BY_DISTRICT = {
  "District 1": [
    "Bagong Sikat",
    "Balbalino",
    "Banganan",
    "Langla",
    "Mabini",
    "Maligaya",
    "Santo Tomas South",
  ],
  "District 2": [
    "Imbunia",
    "Lambakin",
    "Marawa",
    "Naglabrahan",
    "San Josef",
    "San Roque",
    "Santo Tomas North",
  ],
  "District 3": [
    "Don Mariano Marcos",
    "Hilera",
    "Pinanggaan",
    "San Andres",
    "San Nicolas",
    "Ulanin-Pitak",
  ],
  "District 4": [
    "Calabasa",
    "Kasanglayan",
    "Pamacpacan",
    "Putlod",
    "Sapang",
  ],
};

const ALL_BARANGAY_OPTIONS = Object.values(BARANGAY_BY_DISTRICT).flat();
const BARANGAY_PROPERTY_KEYS = [
  "name",
  "Name",
  "NAME",
  "barangay",
  "Barangay",
  "BARANGAY",
  "barangayName",
  "BarangayName",
  "BRGY",
  "brgy",
  "brgy_name",
  "BRGY_NAME",
  "NAME_3",
  "adm4_en",
  "ADM4_EN",
  "mun_name",
  "MUN_NAME",
];
const DISTRICT_PROPERTY_KEYS = [
  "district",
  "District",
  "DISTRICT",
  "dist",
  "Dist",
  "DIST",
  "districtName",
  "DistrictName",
  "district_name",
  "DISTRICT_NAME",
  "adm3_en",
  "ADM3_EN",
];

function normalizePlaceName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[._-]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\bbrgy\b/g, "barangay")
    .trim();
}

function normalizeNameText(name) {
  return normalizePlaceName(name)
    .trim()
    .replace(/[\u2018\u2019'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[._,;:()[\]{}#]+/g, " ")
    .replace(/[-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBarangayName(name) {
  let normalized = normalizeNameText(name)
    .replace(/\bbarangay\s+hall\b/g, " ")
    .replace(/\bbrgy\s+hall\b/g, " ")
    .replace(/\bbgy\s+hall\b/g, " ")
    .replace(/\bbarangay\b/g, " ")
    .replace(/\bbrgy\b/g, " ")
    .replace(/\bbgy\b/g, " ")
    .replace(/\bhall\b/g, " ")
    .replace(/\bsto\b/g, "santo")
    .replace(/\bst\b/g, "santo")
    .replace(/\bnorte\b/g, "north")
    .replace(/\bsur\b/g, "south")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = {
    "san jose": "san josef",
    "sto tomas north": "santo tomas north",
    "sto tomas south": "santo tomas south",
    "santo tomas n": "santo tomas north",
    "santo tomas s": "santo tomas south",
    "s tomas north": "santo tomas north",
    "s tomas south": "santo tomas south",
    "d mariano": "don mariano marcos",
    "d mariano marcos": "don mariano marcos",
    "don mariano": "don mariano marcos",
    ibunia: "imbunia",
    "sapang putik": "sapang",
    "ulanin pitak": "ulanin pitak",
  };

  normalized = aliases[normalized] || normalized;
  return normalized;
}

function normalizeDistrictName(name) {
  const normalized = normalizeNameText(name)
    .replace(/\bdist\b/g, "district")
    .replace(/\bdistrict\s+no\b/g, "district")
    .replace(/\s+/g, " ")
    .trim();

  const romanMatch = normalized.match(/\b(i|ii|iii|iv)\b/);
  if (romanMatch) {
    return {
      i: "district 1",
      ii: "district 2",
      iii: "district 3",
      iv: "district 4",
    }[romanMatch[1]];
  }

  const numberMatch = normalized.match(/\b([1-4])\b/);
  if (numberMatch) return `district ${numberMatch[1]}`;

  return normalized;
}

function getFeatureProperty(feature, keys) {
  const properties = feature?.properties || {};

  for (const key of keys) {
    const value = properties[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  const lowerKeyMap = Object.entries(properties).reduce((acc, [key, value]) => {
    acc[String(key).toLowerCase()] = value;
    return acc;
  }, {});

  for (const key of keys) {
    const value = lowerKeyMap[String(key).toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function cleanBarangayDisplayName(name) {
  return String(name || "")
    .replace(/\bbarangay\s+hall\b/gi, "")
    .replace(/\bbrgy\.?\s+hall\b/gi, "")
    .replace(/\bbgy\.?\s+hall\b/gi, "")
    .replace(/\bhall\b/gi, "")
    .replace(/^\s*(barangay|brgy\.?|bgy\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFeatureBarangayName(feature) {
  return cleanBarangayDisplayName(
    getFeatureProperty(feature, BARANGAY_PROPERTY_KEYS)
  );
}

function getFeatureDistrictName(feature) {
  return getFeatureProperty(feature, DISTRICT_PROPERTY_KEYS)
    .replace(/\s+/g, " ")
    .trim();
}

function findOptionByNormalized(options, value, normalizer) {
  const normalizedValue = normalizer(value);
  if (!normalizedValue) return "";

  return (
    safeArray(options).find(
      (option) => normalizer(option) === normalizedValue
    ) || ""
  );
}

function matchDistrictOption(value) {
  return findOptionByNormalized(DISTRICT_OPTIONS, value, normalizeDistrictName);
}

function getDistrictBarangayOptions(district) {
  const districtOption = matchDistrictOption(district) || String(district || "").trim();
  return BARANGAY_BY_DISTRICT[districtOption] || [];
}

function matchBarangayOption(value, district = "") {
  const districtOptions = getDistrictBarangayOptions(district);

  return (
    findOptionByNormalized(districtOptions, value, normalizeBarangayName) ||
    findOptionByNormalized(ALL_BARANGAY_OPTIONS, value, normalizeBarangayName)
  );
}

function getPickerOptionsWithCurrent(options, currentValue, normalizer) {
  const cleanCurrentValue = String(currentValue || "").trim();
  if (!cleanCurrentValue) return options;

  const matched = findOptionByNormalized(options, cleanCurrentValue, normalizer);
  return matched ? options : [...options, cleanCurrentValue];
}

function resolveIncidentBarangaySelection(feature, fallbackLabel = "") {
  const rawBarangay =
    getFeatureBarangayName(feature) || cleanBarangayDisplayName(fallbackLabel);
  const matchedBarangay = matchBarangayOption(rawBarangay);
  const barangayValue = matchedBarangay || rawBarangay;
  const rawDistrict =
    getFeatureDistrictName(feature) ||
    getDistrictFromBarangay(barangayValue) ||
    getDistrictFromBarangay(rawBarangay);
  const matchedDistrict = matchDistrictOption(rawDistrict);
  const districtValue = matchedDistrict || rawDistrict;
  const availableBarangays =
    getDistrictBarangayOptions(districtValue || rawDistrict).length
      ? getDistrictBarangayOptions(districtValue || rawDistrict)
      : ALL_BARANGAY_OPTIONS;

  return {
    detectedBarangay: rawBarangay,
    detectedDistrict: rawDistrict,
    barangayValue,
    districtValue,
    barangayDropdownMatched: Boolean(matchedBarangay),
    districtDropdownMatched: Boolean(matchedDistrict),
    availableBarangays,
  };
}

function logIncidentDropdownResolution(selection) {
  if (!selection?.detectedBarangay && !selection?.detectedDistrict) return;

  const availableBarangays = selection.availableBarangays || ALL_BARANGAY_OPTIONS;

  console.log(
    selection.barangayDropdownMatched
      ? "[incident barangay dropdown matched]"
      : "[incident barangay dropdown not matched]",
    {
      detected: selection.detectedBarangay || "",
      normalizedDetected: normalizePlaceName(selection.detectedBarangay),
      value: selection.barangayValue || "",
      availableBarangays: selection.barangayDropdownMatched
        ? undefined
        : availableBarangays.map((item) => String(item || "")),
    }
  );
  console.log(
    selection.districtDropdownMatched
      ? "[incident district dropdown matched]"
      : "[incident district dropdown not matched]",
    {
      barangay: selection.detectedBarangay || "",
      detected: selection.detectedDistrict || "",
      value: selection.districtValue || "",
    }
  );
}

function getOptionText(option) {
  return String(option?.label || option?.name || option?.value || option || "").trim();
}

function findDistrictForBarangay(
  barangayName,
  districtOptionsOrMap = BARANGAY_BY_DISTRICT
) {
  const normalized = normalizeBarangayName(barangayName);
  if (!normalized) return "";

  if (Array.isArray(districtOptionsOrMap)) {
    for (const entry of districtOptionsOrMap) {
      if (Array.isArray(entry?.barangays)) {
        const match = entry.barangays.some(
          (item) => normalizeBarangayName(getOptionText(item)) === normalized
        );
        if (match) return getOptionText(entry.district || entry);
      }

      const optionBarangay = getOptionText(entry);
      if (normalizeBarangayName(optionBarangay) === normalized) {
        return getOptionText(entry?.district || entry?.districtLabel || entry?.districtName);
      }
    }

    return "";
  }

  for (const [district, barangays] of Object.entries(districtOptionsOrMap || {})) {
    const match = safeArray(barangays).some(
      (item) => normalizeBarangayName(getOptionText(item)) === normalized
    );

    if (match) return getOptionText(district);
  }

  return "";
}

function getDistrictFromBarangay(barangayName) {
  return findDistrictForBarangay(barangayName, BARANGAY_BY_DISTRICT);
}
function sanitizeStreetDetails(value) {
  return sanitizeFreeTextInput(value, 160);
}

function buildIncidentAddress({ district, barangay, street, location }) {
  if (street || barangay || district) {
    return [street, barangay, district, "Jaen, Nueva Ecija"]
      .filter(Boolean)
      .join(", ");
  }

  return sanitizeFreeTextOnSubmit(location, INCIDENT_LOCATION_MAX_LENGTH);
}
const FLOOD_LEGEND_ITEMS = [
  {
    key: "susceptible",
    label: "Susceptible zone",
    color: FLOOD_STYLES.susceptible.fillColor,
  },
  {
    key: "medium",
    label: "Medium flood zone",
    color: FLOOD_STYLES.medium.fillColor,
  },
  {
    key: "safe",
    label: "Lower flood exposure",
    color: FLOOD_STYLES.safe.fillColor,
  },
];

const EMPTY_INCIDENT = {
  type: "",
  level: "",
  district: "",
  barangay: "",
  street: "",
  location: "",
  latitude: null,
  longitude: null,
  description: "",
  usernames: "",
  phone: "",
};

function normalizeIncidentPickerAsset(asset, index = 0) {
  if (!asset?.uri) return null;

  const name =
    asset.fileName ||
    asset.uri.split("/").pop() ||
    `incident-photo-${index + 1}.jpg`;
  const extension = String(name.split(".").pop() || "jpg").toLowerCase();
  const mimeType =
    asset.mimeType ||
    (extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : "image/jpeg");

  return {
    uri: asset.uri,
    name,
    type: mimeType,
    size: Number(asset.fileSize || 0),
  };
}

function validateIncidentImages(images) {
  const validImages = safeArray(images).filter((item) => item?.uri);

  if (validImages.length > INCIDENT_IMAGE_LIMIT) {
    return `Only up to ${INCIDENT_IMAGE_LIMIT} photos are allowed.`;
  }

  const invalidType = validImages.find(
    (item) => !String(item.type || "").toLowerCase().startsWith("image/")
  );
  if (invalidType) return "Please choose a valid image file.";

  const oversized = validImages.find(
    (item) => Number(item.size || 0) > INCIDENT_IMAGE_MAX_BYTES
  );
  if (oversized) return "Each incident photo must be 15 MB or smaller.";

  return "";
}

function getIncidentImageItems(incidentImage) {
  if (!incidentImage) return [];
  return Array.isArray(incidentImage.items)
    ? incidentImage.items.filter((item) => item?.uri)
    : incidentImage.uri
      ? [incidentImage]
      : [];
}

function buildIncidentFormData(parameters, images) {
  const formData = new FormData();

  Object.entries(parameters || {}).forEach(([key, value]) => {
    formData.append(key, value == null ? "" : String(value));
  });

  safeArray(images)
    .slice(0, INCIDENT_IMAGE_LIMIT)
    .forEach((image, index) => {
      formData.append("images", {
        uri: image.uri,
        name: image.name || `incident-photo-${index + 1}.jpg`,
        type: image.type || "image/jpeg",
      });
    });

  return formData;
}

function smoothSpeed(previousKmh, nextMetersPerSecond) {
  const nextKmh =
    Number.isFinite(nextMetersPerSecond) && nextMetersPerSecond > 0
      ? nextMetersPerSecond * 3.6
      : 0;

  if (!Number.isFinite(previousKmh)) return nextKmh;
  return previousKmh * 0.65 + nextKmh * 0.35;
}

const formatCoordinateAddress = (latitude, longitude, prefix = "Map pin") =>
  `${prefix}: ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;

const formatReverseGeocodeAddress = (place, latitude, longitude) => {
  const parts = [
    place?.name,
    place?.street,
    place?.district,
    place?.city,
    place?.subregion,
    place?.region,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.length
    ? parts.join(", ")
    : "Jaen, Nueva Ecija";
};

function compactAddressParts(parts) {
  const seen = new Set();
  return parts
    .map((part) => sanitizeIncidentText(part, 160))
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getReverseGeocodeRoad(place) {
  return sanitizeStreetDetails(
    place?.street || place?.name || place?.district || "Jaen, Nueva Ecija"
  );
}

function getReverseGeocodeBarangay(place) {
  const candidates = [place?.district, place?.subregion, place?.name];
  const barangays = Object.values(BARANGAY_BY_DISTRICT).flat();

  return (
    barangays.find((barangay) => {
      const normalizedBarangay = String(barangay).toLowerCase();
      return candidates.some((candidate) =>
        String(candidate || "").toLowerCase().includes(normalizedBarangay)
      );
    }) || ""
  );
}

function buildReadableNavigationAddress({ place, barangay, road }) {
  const cleanBarangay = sanitizeAlphaNumericTextForDisplay(barangay || "Unknown barangay");
  const municipality = sanitizeIncidentText(place?.city || "Jaen", 80);
  const region = sanitizeIncidentText(place?.region || "Nueva Ecija", 80);
  const primaryRoad = sanitizeStreetDetails(
    road || place?.street || place?.name || "Near current route"
  );

  return compactAddressParts([
    primaryRoad,
    cleanBarangay ? `Barangay ${cleanBarangay.replace(/^barangay\s+/i, "")}` : "",
    municipality,
    region,
  ]).join(", ");
}

function sanitizeAlphaNumericTextForDisplay(value) {
  return sanitizeIncidentText(value, 100).replace(/[^A-Za-z0-9\s-]/g, "");
}

const safeArray = (arr) => (Array.isArray(arr) ? arr : []);
const safeFeatures = (data) => safeArray(data?.features);

function getBarangayColorParts(index = 0) {
  const hue = Math.round((index * 137.508 + 24) % 360);
  const saturationCycle = [78, 64, 86, 58];
  const lightnessCycle = [48, 60, 42, 66];
  const saturation = saturationCycle[index % saturationCycle.length];
  const lightness = lightnessCycle[index % lightnessCycle.length];

  return { hue, saturation, lightness };
}

function getBarangayColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getBarangayFillColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.54)`;
}

function getBarangayOutlineColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsl(${hue}, ${Math.min(88, saturation + 8)}%, ${Math.max(34, lightness - 8)}%)`;
}

function getBarangaySoftFillColor(index = 0) {
  const { hue, saturation, lightness } = getBarangayColorParts(index);
  return `hsla(${hue}, ${saturation}%, ${Math.min(82, lightness + 10)}%, 0.1)`;
}

const getBarangayLabel = (feature, index) =>
  getFeatureBarangayName(feature) || `Barangay ${index + 1}`;

const OUTSIDE_JAEN_MASK = [
  { latitude: 16.2, longitude: 119.8 },
  { latitude: 16.2, longitude: 122.0 },
  { latitude: 14.4, longitude: 122.0 },
  { latitude: 14.4, longitude: 119.8 },
];

const toCoords = (ring) =>
  safeArray(ring)
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map(([lng, lat]) => ({
      latitude: Number(lat),
      longitude: Number(lng),
    }))
    .filter((c) => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));

function getFeaturePolygons(feature) {
  const geom = feature?.geometry;
  if (!geom?.coordinates) return [];

  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}

function getFeatureRings(feature) {
  return getFeaturePolygons(feature)
    .flatMap((polygon) => safeArray(polygon).map((ring) => toCoords(ring)))
    .filter((ring) => ring.length > 2);
}

function getFeatureMainRing(feature) {
  const rings = getFeatureRings(feature);
  if (!rings.length) return [];

  return rings.reduce(
    (largest, ring) =>
      getRingAreaMagnitude(ring) > getRingAreaMagnitude(largest) ? ring : largest,
    rings[0]
  );
}

function getRingAreaMagnitude(ring) {
  if (!ring?.length) return 0;

  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current.longitude * next.latitude - next.longitude * current.latitude;
  }

  return Math.abs(area / 2);
}

function getCoordinatesCenter(coords) {
  if (!coords.length) return null;

  const bounds = coords.reduce(
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

  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
  };
}

function getRingCentroid(ring) {
  if (!ring?.length) return null;

  let areaFactor = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross =
      current.longitude * next.latitude - next.longitude * current.latitude;

    areaFactor += cross;
    longitudeSum += (current.longitude + next.longitude) * cross;
    latitudeSum += (current.latitude + next.latitude) * cross;
  }

  if (Math.abs(areaFactor) < 1e-12) {
    return getCoordinatesCenter(ring);
  }

  return {
    latitude: latitudeSum / (3 * areaFactor),
    longitude: longitudeSum / (3 * areaFactor),
  };
}

function isPointInRing(point, ring) {
  if (!point || ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].longitude;
    const yi = ring[i].latitude;
    const xj = ring[j].longitude;
    const yj = ring[j].latitude;
    const intersects =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi + 1e-12) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function isPolygonLikeFeature(feature) {
  const type = feature?.geometry?.type;
  return (
    (type === "Polygon" || type === "MultiPolygon") &&
    Array.isArray(feature?.geometry?.coordinates)
  );
}

function findBarangayFeatureByCoordinate(latitude, longitude, features = []) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);

  if (!isValidCoordinate(lat, lng)) return null;

  const tapPoint = turf.point([lng, lat]);

  return (
    safeArray(features).find((feature) => {
      if (!isPolygonLikeFeature(feature)) return false;

      try {
        return turf.booleanPointInPolygon(tapPoint, feature);
      } catch (err) {
        console.log("[incident map tap polygon error]", {
          barangay: getFeatureBarangayName(feature),
          error: err?.message || String(err),
        });
        return false;
      }
    }) || null
  );
}

function isPointInBarangay(point, feature) {
  return Boolean(
    findBarangayFeatureByCoordinate(point?.latitude, point?.longitude, [feature])
  );
}

function getBarangayLabelCoordinate(feature, mainRing) {
  if (!mainRing?.length) return null;

  const centroid = getRingCentroid(mainRing);
  if (centroid && isPointInBarangay(centroid, feature)) return centroid;

  const boundsCenter = getCoordinatesCenter(mainRing);
  if (boundsCenter && isPointInBarangay(boundsCenter, feature)) return boundsCenter;

  return mainRing[Math.floor(mainRing.length / 2)] || boundsCenter;
}

function toRad(v) {
  return (v * Math.PI) / 180;
}

function getHeading(from, to) {
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getNavigationCameraHeading(heading) {
  return ((Number(heading || 0) + NAV_CAMERA_HEADING_OFFSET) % 360 + 360) % 360;
}

function distance(a, b) {
  const dx = a.latitude - b.latitude;
  const dy = a.longitude - b.longitude;
  return dx * dx + dy * dy;
}

function getNearestRouteProgress(routeCoords, location = USER_POS) {
  const coords = safeArray(routeCoords).filter((coord) =>
    isValidCoordinate(coord?.latitude, coord?.longitude)
  );

  if (!coords.length) {
    return {
      snappedLocation: location,
      nextPoint: null,
      index: 0,
      heading: 0,
    };
  }

  let nearestIdx = 0;
  let minDist = Infinity;

  coords.forEach((coord, index) => {
    const currentDistance = distance(location, coord);
    if (currentDistance < minDist) {
      minDist = currentDistance;
      nearestIdx = index;
    }
  });

  const snappedLocation = coords[nearestIdx] || location;
  const nextPoint =
    coords[Math.min(nearestIdx + 1, coords.length - 1)] ||
    coords[Math.max(nearestIdx - 1, 0)] ||
    snappedLocation;

  return {
    snappedLocation,
    nextPoint,
    index: nearestIdx,
    heading:
      nextPoint && nextPoint !== snappedLocation
        ? getHeading(snappedLocation, nextPoint)
        : 0,
  };
}

function normalizeTurnAngle(value) {
  return ((Number(value || 0) + 540) % 360) - 180;
}

function getUpcomingManeuver(routeCoords, location = USER_POS) {
  const coords = safeArray(routeCoords).filter((coord) =>
    isValidCoordinate(coord?.latitude, coord?.longitude)
  );

  if (coords.length < 3) {
    return { instruction: "Continue straight", icon: "arrow-up", point: coords[1] || null };
  }

  const { index } = getNearestRouteProgress(coords, location);
  const searchEnd = Math.min(coords.length - 2, index + 24);

  for (let turnIndex = index + 2; turnIndex <= searchEnd; turnIndex += 1) {
    const before = coords[Math.max(index, turnIndex - 2)];
    const atTurn = coords[turnIndex];
    const after = coords[Math.min(coords.length - 1, turnIndex + 3)];
    if (!before || !atTurn || !after) continue;

    const angle = normalizeTurnAngle(
      getHeading(atTurn, after) - getHeading(before, atTurn)
    );
    const magnitude = Math.abs(angle);
    if (magnitude < 18) continue;

    if (magnitude >= 150) {
      return { instruction: "Make a U-turn", icon: "return-down-back", point: atTurn };
    }

    const direction = angle > 0 ? "right" : "left";
    if (magnitude >= 95) {
      return {
        instruction: `Make a sharp ${direction}`,
        icon: direction === "right" ? "arrow-forward" : "arrow-back",
        point: atTurn,
      };
    }

    if (magnitude >= 38) {
      return {
        instruction: `Turn ${direction}`,
        icon: direction === "right" ? "return-up-forward" : "return-up-back",
        point: atTurn,
      };
    }

    return {
      instruction: `Curve slightly ${direction}`,
      icon: direction === "right" ? "arrow-redo-outline" : "arrow-undo-outline",
      point: atTurn,
    };
  }

  return {
    instruction: "Continue straight",
    icon: "arrow-up",
    point: coords[Math.min(index + 1, coords.length - 1)] || null,
  };
}

function getNavigationRouteCoords(routeCoords, location = USER_POS) {
  const coords = safeArray(routeCoords).filter((coord) =>
    isValidCoordinate(coord?.latitude, coord?.longitude)
  );
  if (coords.length < 2) return coords;

  const { snappedLocation, index } = getNearestRouteProgress(coords, location);
  return [snappedLocation, ...coords.slice(Math.min(index + 1, coords.length - 1))];
}

function getNearestSnapPoint(value, snapPoints) {
  return snapPoints.reduce((nearest, point) =>
    Math.abs(point - value) < Math.abs(nearest - value) ? point : nearest
  );
}

function distanceKm(a, b) {
  if (
    !isValidCoordinate(a?.latitude, a?.longitude) ||
    !isValidCoordinate(b?.latitude, b?.longitude)
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceMetersBetween(a, b) {
  const km = distanceKm(a, b);
  return km == null ? null : km * 1000;
}

function formatIncidentType(type) {
  const clean = safeDisplayText(type, "Road hazard").toLowerCase();
  const labels = {
    flood: "Flood",
    fire: "Fire",
    accident: "Accident",
    "road blockage": "Road blockage",
    blockage: "Road blockage",
    typhoon: "Typhoon hazard",
    earthquake: "Earthquake hazard",
  };
  return labels[clean] || clean.charAt(0).toUpperCase() + clean.slice(1);
}

function normalizeIncidentCategory(type) {
  const clean = String(type || "").trim().toLowerCase();
  if (clean.includes("flood")) return "flood";
  if (clean.includes("earthquake")) return "earthquake";
  if (clean.includes("typhoon") || clean.includes("storm")) return "typhoon";
  if (clean.includes("accident") || clean.includes("collision")) return "accident";
  if (clean.includes("block") || clean.includes("obstruction")) return "road_block";
  if (clean.includes("fire")) return "fire";
  return clean || "incident";
}

function getIncidentCategoryIcon(category) {
  switch (normalizeIncidentCategory(category)) {
    case "flood":
      return "water-outline";
    case "earthquake":
      return "pulse-outline";
    case "typhoon":
      return "thunderstorm-outline";
    case "accident":
      return "car-sport-outline";
    case "road_block":
      return "trail-sign-outline";
    case "fire":
      return "flame-outline";
    default:
      return "warning-outline";
  }
}

function getRouteHazardMessage(incident, threshold) {
  const category = normalizeIncidentCategory(incident?.type);
  const urgent = threshold <= 100;

  if (category === "flood") {
    return urgent
      ? "Flood ahead. Proceed carefully."
      : "In 300 meters, flooding has been reported ahead. Slow down.";
  }
  if (category === "earthquake") {
    return "Possible structural damage ahead. Stay alert.";
  }
  if (category === "typhoon") {
    return "Strong winds or storm damage reported ahead.";
  }
  if (category === "accident") {
    return "Accident reported ahead. Be ready to stop.";
  }
  if (category === "road_block") {
    return "Road obstruction ahead. Prepare to reroute.";
  }

  return "Incident reported ahead. Proceed with caution.";
}

function formatDistanceMeters(meters) {
  const value = Number(meters || 0);
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(value / 10) * 10)} m`;
}

function getRouteDistanceToIndex(routeCoords, startIndex, endIndex) {
  let meters = 0;
  const start = Math.max(0, startIndex);
  const end = Math.min(routeCoords.length - 1, endIndex);

  for (let index = start; index < end; index += 1) {
    meters += distanceMetersBetween(routeCoords[index], routeCoords[index + 1]) || 0;
  }

  return meters;
}

function findIncidentAheadOnRoute({ routeCoords, currentLocation, incidents }) {
  const coords = safeArray(routeCoords).filter((coord) =>
    isValidCoordinate(coord?.latitude, coord?.longitude)
  );

  if (coords.length < 2 || !isValidCoordinate(currentLocation?.latitude, currentLocation?.longitude)) {
    return null;
  }

  const progress = getNearestRouteProgress(coords, currentLocation);
  const currentIndex = progress.index;

  return safeArray(incidents)
    .map((incident) => {
      const incidentPoint = {
        latitude: Number(incident?.latitude),
        longitude: Number(incident?.longitude),
      };

      if (!isValidCoordinate(incidentPoint.latitude, incidentPoint.longitude)) {
        return null;
      }

      let nearestIndex = -1;
      let nearestMeters = Infinity;

      coords.forEach((coord, index) => {
        const meters = distanceMetersBetween(coord, incidentPoint);
        if (meters != null && meters < nearestMeters) {
          nearestMeters = meters;
          nearestIndex = index;
        }
      });

      if (
        nearestIndex <= currentIndex ||
        nearestMeters > ROUTE_HAZARD_ROUTE_RADIUS_METERS
      ) {
        return null;
      }

      const distanceAheadMeters =
        getRouteDistanceToIndex(coords, currentIndex, nearestIndex) +
        (distanceMetersBetween(progress.snappedLocation, coords[currentIndex]) || 0);

      return {
        incident,
        nearestIndex,
        routeOffsetMeters: nearestMeters,
        distanceAheadMeters,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceAheadMeters - b.distanceAheadMeters)[0] || null;
}

function RouteHazardAlertPanel({ alert }) {
  const slideAnim = useRef(new Animated.Value(-22)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    slideAnim.setValue(-22);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 17,
        stiffness: 190,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [alert?.id, opacityAnim, slideAnim]);

  if (!alert) return null;

  const urgent = Number(alert.threshold || 0) <= 100;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.routeHazardBanner,
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
        urgent && styles.routeHazardBannerUrgent,
      ]}
    >
      <View style={[styles.routeHazardIcon, urgent && styles.routeHazardIconUrgent]}>
        <Ionicons name={alert.icon || "warning-outline"} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.routeHazardCopy}>
        <Text style={styles.routeHazardText} numberOfLines={2}>
          {alert.message}
        </Text>
        <Text style={styles.routeHazardDistance}>
          {formatDistanceMeters(alert.distanceAheadMeters)} ahead
        </Text>
      </View>
    </Animated.View>
  );
}

function normalizePlace(place) {
  if (!place || typeof place !== "object") return null;
  if (
    place._id &&
    place.capacityStatus !== undefined &&
    isValidCoordinate(place.latitude, place.longitude)
  ) {
    return {
      ...place,
      name: safeDisplayText(place.name || place.barangayName, "Selected place"),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    };
  }

  if (
    place._id &&
    place.barangayName &&
    isValidCoordinate(place.latitude, place.longitude)
  ) {
    return {
      ...place,
      name: safeDisplayText(place.name || place.barangayName, "Selected place"),
      capacityStatus: "barangay",
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    };
  }

  if (isValidCoordinate(place.latitude, place.longitude)) {
    return {
      _id: `search-${Number(place.latitude)}-${Number(place.longitude)}`,
      name: safeDisplayText(place.label, "Selected location"),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      capacityStatus: "location",
    };
  }

  return null;
}

function toMarkerCoordinate(value) {
  const normalized = normalizeCoordinate(value);

  if (
    !normalized ||
    typeof normalized.latitude !== "number" ||
    typeof normalized.longitude !== "number" ||
    !Number.isFinite(normalized.latitude) ||
    !Number.isFinite(normalized.longitude)
  ) {
    return null;
  }

  return {
    latitude: Number(normalized.latitude),
    longitude: Number(normalized.longitude),
  };
}

function SafeMarker({ coordinate, children, ...props }) {
  const safeCoordinate = toMarkerCoordinate(coordinate);

  if (
    !safeCoordinate ||
    !isValidCoordinate(safeCoordinate.latitude, safeCoordinate.longitude)
  ) {
    return null;
  }

  return (
    <Marker coordinate={safeCoordinate} {...props}>
      {children}
    </Marker>
  );
}

function NavigationArrowMarker({ heading = 0 }) {
  return (
    <View style={styles.navigationArrowShell} collapsable={false}>
      <View
        style={[
          styles.navigationArrow,
          { transform: [{ rotate: `${Math.round(heading || 0)}deg` }] },
        ]}
      >
        <Ionicons name="navigate" size={28} color="#FFFFFF" />
      </View>
      <View style={styles.navigationArrowHalo} />
    </View>
  );
}

function getForecastAtmosphere(weather) {
  const hour = new Date().getHours();
  const condition = String(weather?.current?.condition || "").toLowerCase();
  const feelsLike = Number(weather?.current?.feelsLike);
  const isFoggyCondition = condition.includes("fog") || condition.includes("mist");
  const isRainyCondition =
    condition.includes("rain") ||
    condition.includes("drizzle") ||
    condition.includes("shower") ||
    condition.includes("thunder");
  const isMorning = hour >= 5 && hour < 10;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening = hour >= 17 && hour < 19;
  const isNight = hour >= 19 || hour < 5;
  const isCoolMorning = !Number.isFinite(feelsLike) || feelsLike <= 27;

  if (isNight) {
    return {
      key: "night",
      insideTint: "rgba(8, 18, 33, 0.2)",
      fogOpacity: 0.08,
      showFog: isFoggyCondition || isRainyCondition,
    };
  }

  if (isEvening) {
    return {
      key: "evening",
      insideTint: "rgba(39, 48, 62, 0.12)",
      fogOpacity: 0.07,
      showFog: isRainyCondition || isFoggyCondition,
    };
  }

  if (isAfternoon) {
    return {
      key: "afternoon",
      insideTint: "rgba(255, 244, 214, 0.13)",
      fogOpacity: 0.06,
      showFog: isRainyCondition || isFoggyCondition,
    };
  }

  if (isMorning || isFoggyCondition) {
    return {
      key: "morning-fog",
      insideTint: "rgba(236, 253, 245, 0.16)",
      fogOpacity: isCoolMorning || isFoggyCondition ? 0.18 : 0.1,
      showFog: true,
    };
  }

  return {
    key: "daylight",
    insideTint: "rgba(255,255,255,0.04)",
    fogOpacity: 0.04,
    showFog: false,
  };
}

function getEvacStatusColor(status) {
  return EVAC_STATUS_COLORS[String(status || "").toLowerCase()] || "#16a34a";
}

function getEvacStatusCopy(status) {
  const normalized = String(status || "available").toLowerCase();
  if (normalized === "limited") {
    return {
      label: "LIMITED",
      tint: "#FEF3C7",
      border: "#FCD34D",
      text: "#92400E",
    };
  }

  if (normalized === "full") {
    return {
      label: "FULL",
      tint: "#FEE2E2",
      border: "#FCA5A5",
      text: "#991B1B",
    };
  }

  return {
    label: "AVAILABLE",
    tint: "#ECFDF5",
    border: "#86EFAC",
    text: "#166534",
  };
}

function EvacuationPlaceMarker({ color, selected = false, label, badge = "" }) {
  return (
    <View style={styles.evacMarkerShell} collapsable={false}>
      {selected ? (
        <View style={styles.evacMarkerLabelWrap}>
          <View style={styles.evacMarkerLabel}>
            <Text style={styles.evacMarkerLabelText} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {badge ? (
            <View style={styles.evacMarkerBadge}>
              <Text style={styles.evacMarkerBadgeText} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.evacMarkerPin,
          selected && styles.evacMarkerPinSelected,
          { borderColor: color },
        ]}
      >
        <View style={[styles.evacMarkerCore, { backgroundColor: color }]}>
          <Ionicons name="business" size={17} color="#ffffff" />
        </View>
      </View>

      <View style={[styles.evacMarkerBaseShadow, { backgroundColor: color }]} />
    </View>
  );
}function BarangayNameMarker({
  label,
  color,
  selected = false,
  incidentCount = 0,
  dominantIncidentLabel = "",
  onPress,
}) {
  return (
    <View style={styles.barangayMarkerShell} collapsable={false}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[
          styles.barangayMarker,
          selected && styles.barangayMarkerSelected,
          { borderColor: selected ? "#FACC15" : `${color}55` },
        ]}
      >
        <View
          style={[
            styles.barangayMarkerIcon,
            {
              backgroundColor: selected ? "#FFF7D6" : "#FFFFFF",
              borderColor: selected ? "#FACC15" : `${color}45`,
            },
          ]}
        >
          <View
            style={[
              styles.barangayMarkerDot,
              { backgroundColor: selected ? "#FACC15" : color },
            ]}
          />
        </View>

        <Text
          style={[
            styles.barangayMarkerText,
            selected && styles.barangayMarkerTextSelected,
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>

        {incidentCount > 0 ? (
          <View style={styles.barangayIncidentBadge}>
            <Text style={styles.barangayIncidentBadgeText}>{incidentCount}</Text>
          </View>
        ) : null}

        {dominantIncidentLabel ? (
          <View style={styles.barangayIncidentTooltip}>
            <Text style={styles.barangayIncidentTooltipText} numberOfLines={1}>
              {dominantIncidentLabel}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function IncidentListItem({ incident, onPress }) {
  const level = String(incident?.level || "low").toLowerCase();
  const levelColor = INCIDENT_LEVEL_COLOR[level] || "#16a34a";
  const statusLabel = normalizeIncidentStatus(incident?.status) || "reported";
  const iconName = getIncidentCategoryIcon(incident?.type);
  const images = getIncidentImages(incident);

  useEffect(() => {
    images.slice(0, 2).forEach((item) => {
      if (item?.fileUrl) Image.prefetch(item.fileUrl).catch(() => {});
    });
  }, [images]);

  return (
    <TouchableOpacity
      style={styles.incidentListItem}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={typeof onPress !== "function"}
    >
      <View style={[styles.incidentListIcon, { borderColor: levelColor, backgroundColor: `${levelColor}14` }]}>
        <Ionicons name={iconName} size={16} color={levelColor} />
      </View>
      <View style={styles.incidentListCopy}>
        <View style={styles.incidentListTitleRow}>
          <Text style={styles.incidentListTitle} numberOfLines={1}>
            {safeDisplayText(incident?.type, "Incident")}
          </Text>
          <View style={[styles.incidentStatusChip, { borderColor: levelColor }]}>
            <Text style={[styles.incidentStatusText, { color: levelColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.incidentListMeta} numberOfLines={1}>
          {safeDisplayText(incident?.location, "Location not provided")}
        </Text>
        <Text style={styles.incidentListSubMeta} numberOfLines={1}>
          {safeDisplayText(incident?.barangay, "Unknown barangay")} | {Number(incident?.latitude).toFixed(5)}, {Number(incident?.longitude).toFixed(5)}
        </Text>
        {!!incident?.description && (
          <Text style={styles.incidentListDescription} numberOfLines={2}>
            {safeDisplayText(incident.description, "No description")}
          </Text>
        )}
        {images.length > 0 && (
          <View style={styles.incidentPhotoRow}>
            {images.slice(0, 2).map((image, index) => (
              <Image
                key={`${image.fileUrl}-${index}`}
                source={{ uri: image.fileUrl }}
                style={styles.incidentPhotoThumb}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
      </View>
      <Ionicons name="locate-outline" size={18} color={levelColor} />
    </TouchableOpacity>
  );
}function IncidentMapMarker({ level = "critical", type = "incident" }) {
  const markerColor =
    INCIDENT_LEVEL_COLOR[String(level || "critical").toLowerCase()] || "#dc2626";
  const iconName = getIncidentCategoryIcon(type);

  return (
    <View style={{ alignItems: "center" }} collapsable={false}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: `${markerColor}18`,
          borderWidth: 2,
          borderColor: markerColor,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 5,
        }}
      >
        <View
          style={{
            width: 27,
            height: 27,
            borderRadius: 14,
            backgroundColor: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={iconName} size={18} color={markerColor} />
        </View>
      </View>

      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: markerColor,
          marginTop: -3,
          borderWidth: 2,
          borderColor: "#ffffff",
        }}
      />
    </View>
  );
}
function renderBoundary(data, stylePrefix, strokeColor, strokeWidth, fillColor) {
  return safeFeatures(data).flatMap((feature, idx) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly, pIdx) =>
      safeArray(poly).map((ring, rIdx) => {
        const coords = toCoords(ring);
        if (!coords.length) return null;

        return (
          <Polygon
            key={`${stylePrefix}-${idx}-${pIdx}-${rIdx}`}
            coordinates={coords}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            fillColor={fillColor}
            zIndex={stylePrefix === "jaen" ? 30 : undefined}
          />
        );
      })
    );
  });
}

function renderInsideJaenAtmosphere(data, atmosphere, fogAlpha = 0) {
  const baseLayer = safeFeatures(data).flatMap((feature, idx) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly, pIdx) =>
      safeArray(poly).map((ring, rIdx) => {
        const coords = toCoords(ring);
        if (!coords.length) return null;

        return (
          <Polygon
            key={`jaen-atmosphere-${idx}-${pIdx}-${rIdx}`}
            coordinates={coords}
            strokeColor="rgba(15,23,42,0)"
            strokeWidth={0}
            fillColor={atmosphere.insideTint}
            tappable={false}
            zIndex={12}
          />
        );
      })
    );
  });

  if (!atmosphere.showFog || fogAlpha <= 0) {
    return baseLayer;
  }

  const fogLayer = safeFeatures(data).flatMap((feature, idx) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly, pIdx) =>
      safeArray(poly).map((ring, rIdx) => {
        const coords = toCoords(ring);
        if (!coords.length) return null;

        return (
          <Polygon
            key={`jaen-fog-${idx}-${pIdx}-${rIdx}`}
            coordinates={coords}
            strokeColor="rgba(15,23,42,0)"
            strokeWidth={0}
            fillColor={`rgba(255,255,255,${fogAlpha})`}
            tappable={false}
            zIndex={14}
          />
        );
      })
    );
  });

  return [...baseLayer, ...fogLayer];
}

function getBoundsFromData(data) {
  const coords = safeFeatures(data).flatMap((feature) => {
    const geom = feature?.geometry;
    if (!geom?.coordinates) return [];

    const polygons =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];

    return polygons.flatMap((poly) =>
      safeArray(poly).flatMap((ring) => toCoords(ring))
    );
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
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function getBoundaryHoles(data) {
  return safeFeatures(data).flatMap((feature) => {
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
}
function isPointInsideJaenBoundary(point) {
  return safeFeatures(jaenGeoJSON).some((feature) =>
    isPointInBarangay(point, feature)
  );
}

export default function Map() {
  const mapRef = useRef(null);
  const navigation = useNavigation();
  const navRoute = useRoute();
  const lastPlaceKeyRef = useRef(null);
  const { user } = useContext(UserContext) || {};
  const { theme } = useTheme();
  const themedOverlay = useMemo(() => createMapOverlayThemeStyles(theme), [theme]);

  const [mongoBarangays, setMongoBarangays] = useState(null);
  const [incidentDraft, setIncidentDraft] = useState(EMPTY_INCIDENT);
  const [incidentImage, setIncidentImage] = useState(null);
  const [incidentImageError, setIncidentImageError] = useState("");
  const [incidentErrors, setIncidentErrors] = useState({});
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [incidentLocating, setIncidentLocating] = useState(false);
  const [quickReportVisible, setQuickReportVisible] = useState(false);
const [mapWeather, setMapWeather] = useState(null);
const [fogPulseLevel, setFogPulseLevel] = useState(0.65);
const [heatPulseLevel, setHeatPulseLevel] = useState(0.45);
const [selectedBarangay, setSelectedBarangay] = useState(null);
const [selectedBarangayIds, setSelectedBarangayIds] = useState([]);
const [barangaySpecificMode, setBarangaySpecificMode] = useState(false);
const [showIncidentMarkers, setShowIncidentMarkers] = useState(false);
const [showBarangayMarkers, setShowBarangayMarkers] = useState(false);
const [incidentDebugMode, setIncidentDebugMode] = useState(false);
const [evacGpsDebugMode, setEvacGpsDebugMode] = useState(false);
const [evacGpsLocating, setEvacGpsLocating] = useState(false);
const [gpsLocation, setGpsLocation] = useState(null);

const {
  activeMapModule,
  setActiveMapModule,
  panelState,
  setPanelState,
  panelY,
  setPanelY,
  evac,
  setEvac,
  evacPlaces,
  routeRequested,
  setRouteRequested,
  routes,
  setRoutes,
  activeRoute,
  setActiveRoute,
  travelMode,
  setTravelMode,
  incidents = [],
  setIncidents,
  refreshIncidents,
  setShowFloodMap,
  setShowEarthquakeHazard,
  isBottomNavInteracting,
} = useContext(MapContext);
  const { addNotification } = useContext(NotificationContext) || {};

  const isClampingRegionRef = useRef(false);
  const recentModuleChangeRef = useRef(Date.now());
  const lastNavigationCameraAtRef = useRef(0);
  const recenterTimerRef = useRef(null);
  const evacSelectionRecenterTimerRef = useRef(null);
  const routeHazardAlertedRef = useRef(new Set());
  const clusterNotificationInFlightRef = useRef(new Set());
  const previousEvacGpsDebugModeRef = useRef(evacGpsDebugMode);
  const previousRouteOriginRef = useRef(USER_POS);
  const evacRouteManualCameraRef = useRef(false);
  const evacRouteAutoFitKeyRef = useRef("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [currentLocation, setCurrentLocation] = useState(USER_POS);
  const [nextRoutePoint, setNextRoutePoint] = useState(null);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [routeHazardBanner, setRouteHazardBanner] = useState(null);
  const routeStartCoordinate = useMemo(() => {
    const gpsCoordinate = toMarkerCoordinate(gpsLocation);
    return evacGpsDebugMode && gpsCoordinate ? gpsCoordinate : USER_POS;
  }, [evacGpsDebugMode, gpsLocation]);

  const requestedModule = MODULES.some((item) => item.key === navRoute.params?.module)
    ? navRoute.params.module
    : null;
  const activeModule = activeMapModule;
  const showMapWeather = !activeModule && panelState !== "NAVIGATION";
  const isEvac = activeModule === "evac";
  const isIncident = activeModule === "incident";
  const isFlood = activeModule === "flood";
  const isEarthquake = activeModule === "earthquake";
  const isBarangay = activeModule === "barangay";

  useEffect(() => {
    recentModuleChangeRef.current = Date.now();
  }, [activeModule, panelState]);

  useEffect(() => {
    if (isEvac) return;

    if (evacSelectionRecenterTimerRef.current) {
      clearTimeout(evacSelectionRecenterTimerRef.current);
      evacSelectionRecenterTimerRef.current = null;
    }
    setEvacGpsDebugMode(false);
    setGpsLocation(null);
  }, [isEvac]);

  useEffect(() => {
    return () => {
      if (evacSelectionRecenterTimerRef.current) {
        clearTimeout(evacSelectionRecenterTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isEvac || !evacGpsDebugMode || Platform.OS === "web") return undefined;

    let mounted = true;
    let subscription = null;

    async function watchEvacGpsLocation() {
      setEvacGpsLocating(true);

      try {
        const Location = await import("expo-location");
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!mounted) return;

        if (permission.status !== "granted") {
          setEvacGpsDebugMode(false);
          setGpsLocation(null);
          Alert.alert(
            "GPS Location Needed",
            "Allow location access to use your phone GPS for dynamic pathfinding."
          );
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        const initialLocation = toMarkerCoordinate({
          latitude: current?.coords?.latitude,
          longitude: current?.coords?.longitude,
        });

        if (initialLocation && mounted) {
          setGpsLocation(initialLocation);
          setCurrentLocation(initialLocation);
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1200,
            distanceInterval: 2,
          },
          (position) => {
            const nextLocation = toMarkerCoordinate({
              latitude: position?.coords?.latitude,
              longitude: position?.coords?.longitude,
            });

            if (!nextLocation) return;
            setGpsLocation(nextLocation);
            setCurrentLocation(nextLocation);
          }
        );
      } catch (err) {
        console.log("Evac GPS debug failed:", err?.message);
        if (mounted) {
          setEvacGpsDebugMode(false);
          setGpsLocation(null);
          Alert.alert(
            "GPS Unavailable",
            err?.message || "Unable to get your phone location right now."
          );
        }
      } finally {
        if (mounted) setEvacGpsLocating(false);
      }
    }

    watchEvacGpsLocation();

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [evacGpsDebugMode, isEvac]);

  useEffect(() => {
    const previousValue = previousEvacGpsDebugModeRef.current;
    previousEvacGpsDebugModeRef.current = evacGpsDebugMode;
    const previousOrigin = previousRouteOriginRef.current;
    const originMovedMeters = distanceMetersBetween(previousOrigin, routeStartCoordinate) || 0;
    previousRouteOriginRef.current = routeStartCoordinate;

    if (
      !isEvac ||
      isNavigating ||
      !routeRequested ||
      (previousValue === evacGpsDebugMode && originMovedMeters < 25)
    ) {
      return;
    }

    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setTimeout(() => setRouteRequested(true), 0);
  }, [
    evacGpsDebugMode,
    isEvac,
    isNavigating,
    routeRequested,
    routeStartCoordinate,
    setActiveRoute,
    setRouteRequested,
    setRoutes,
  ]);

  const showHomepageBarangays = !activeModule || isIncident || isEvac || isBarangay;
  const showBarangayNameMarkers =
    showBarangayMarkers && (showHomepageBarangays || isBarangay || isEvac);

  const normalizedEvacPlaces = useMemo(
    () => {
      const places = safeArray(evacPlaces)
        .map(normalizePlace)
        .filter(Boolean)
        .map((place) => ({
          ...place,
          coordinate: toMarkerCoordinate(place),
        }))
        .filter((place) => place.coordinate);

      return rankEvacuationCentersForUser(user, places);
    },
    [evacPlaces, user]
  );

  const normalizedSelectedEvac = useMemo(() => normalizePlace(evac), [evac]);

  useEffect(() => {
    if (!isEvac || !routeRequested) {
      evacRouteManualCameraRef.current = false;
      evacRouteAutoFitKeyRef.current = "";
    }
  }, [isEvac, routeRequested]);

  useEffect(() => {
    evacRouteManualCameraRef.current = false;
    evacRouteAutoFitKeyRef.current = "";
  }, [
    normalizedSelectedEvac?._id,
    normalizedSelectedEvac?.latitude,
    normalizedSelectedEvac?.longitude,
    routeStartCoordinate.latitude,
    routeStartCoordinate.longitude,
    travelMode,
  ]);

  const normalizedIncidents = useMemo(
    () =>
      safeArray(incidents)
        .filter((incident) => isPublicIncident(incident))
        .map((incident) => {
          const latitude = toNumber(
            incident?.latitude ?? incident?.lat ?? incident?.location?.lat
          );
          const longitude = toNumber(
            incident?.longitude ?? incident?.lng ?? incident?.location?.lng
          );

          if (!isValidCoordinate(latitude, longitude)) {
            return null;
          }

          return {
            ...incident,
            latitude,
            longitude,
          };
        })
        .filter(Boolean),
    [incidents]
  );

  const { floodLayers, earthquakeLayer } = useHazardLayers({
    showFloodMap: isFlood,
    showEarthquakeHazard: isEarthquake,
    showJaenBoundary: false,
  });

  useEffect(() => {
    setShowFloodMap(isFlood);
    setShowEarthquakeHazard(isEarthquake);
  }, [isEarthquake, isFlood, setShowEarthquakeHazard, setShowFloodMap]);

  useEffect(() => {
    if (requestedModule && requestedModule !== activeMapModule) {
      setActiveMapModule(requestedModule);
    }
  }, [activeMapModule, requestedModule, setActiveMapModule]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setRouteRequested(false);
        setRoutes([]);
        setActiveRoute(null);
      };
    }, [setActiveRoute, setRouteRequested, setRoutes])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isIncident || typeof refreshIncidents !== "function") return undefined;

      let mounted = true;
      const fetchFreshIncidents = () => {
        refreshIncidents().catch((err) => {
          if (mounted) {
            console.log("[incidents] refresh failed:", err?.message || err);
          }
        });
      };

      fetchFreshIncidents();

      return () => {
        mounted = false;
      };
    }, [isIncident, refreshIncidents])
  );

  useEffect(() => {
    let mounted = true;

    api
      .get("/api/barangays/collection")
      .then((res) => {
        if (!mounted) return;

        setMongoBarangays({
          type: "FeatureCollection",
          features: safeArray(res.data).flatMap((collection) =>
            safeArray(collection?.features)
          ),
        });
      })
      .catch((err) => {
        console.error("Barangay fetch failed:", err?.message);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!normalizedSelectedEvac && evac != null) {
      setEvac(null);
    }
  }, [evac, normalizedSelectedEvac, setEvac]);

  const scheduleEvacSelectionRecenter = useCallback(
    (place) => {
      const normalizedPlace = normalizePlace(place);
      if (!normalizedPlace) return;

      if (evacSelectionRecenterTimerRef.current) {
        clearTimeout(evacSelectionRecenterTimerRef.current);
      }

      evacSelectionRecenterTimerRef.current = setTimeout(() => {
        evacSelectionRecenterTimerRef.current = null;
        if (!mapRef.current) return;

        mapRef.current.fitToCoordinates([routeStartCoordinate, normalizedPlace], {
          edgePadding: EVAC_ROUTE_EDGE_PADDING,
          animated: true,
        });
      }, EVAC_SELECTION_RECENTER_DELAY_MS);
    },
    [routeStartCoordinate]
  );

  useEffect(() => {
    const rawPlace =
      navRoute.params?.evacPlace ?? navRoute.params?.barangay ?? navRoute.params?.place;
    const nextPlace = rawPlace?.raw ? normalizePlace(rawPlace.raw) : normalizePlace(rawPlace);

    if (!nextPlace) return;

    const nextKey = `${nextPlace._id}-${nextPlace.latitude}-${nextPlace.longitude}`;
    if (lastPlaceKeyRef.current === nextKey) return;
    lastPlaceKeyRef.current = nextKey;

    setActiveMapModule("evac");
    setEvac(nextPlace);
    setPanelState("PLACE_INFO");
    setPanelY(null);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    evacRouteManualCameraRef.current = false;
    evacRouteAutoFitKeyRef.current = "";

    mapRef.current?.fitToCoordinates([routeStartCoordinate, nextPlace], {
      edgePadding: EVAC_ROUTE_EDGE_PADDING,
      animated: true,
    });
    scheduleEvacSelectionRecenter(nextPlace);
  }, [
    navRoute.params,
    routeStartCoordinate,
    scheduleEvacSelectionRecenter,
    setActiveMapModule,
    setActiveRoute,
    setEvac,
    setPanelState,
    setPanelY,
    setRouteRequested,
    setRoutes,
  ]);

  useEffect(() => {
    if (!isEvac) return;

    if (!normalizedSelectedEvac && panelState !== "HIDDEN") {
      setPanelState("HIDDEN");
    } else if (normalizedSelectedEvac && panelState === "HIDDEN") {
      setPanelState("PLACE_INFO");
    }
  }, [isEvac, normalizedSelectedEvac, panelState, setPanelState]);

  const routing = useRouting({
    enabled: isEvac && routeRequested && !!normalizedSelectedEvac,
    from: [routeStartCoordinate.latitude, routeStartCoordinate.longitude],
    to: normalizedSelectedEvac
      ? {
          lat: normalizedSelectedEvac.latitude,
          lng: normalizedSelectedEvac.longitude,
        }
      : null,
    mode: travelMode,
    incidents: normalizedIncidents,
  });

  const activeNavigationRoute = useMemo(
    () => activeRoute || routes[0] || null,
    [activeRoute, routes]
  );
  const activeNavigationRouteKey = useMemo(
    () =>
      activeNavigationRoute
        ? `${activeNavigationRoute.id || "route"}:${safeArray(activeNavigationRoute.coords).length}:${activeNavigationRoute.summary?.km || ""}`
        : "",
    [activeNavigationRoute]
  );

  useEffect(() => {
    routeHazardAlertedRef.current.clear();
    setRouteHazardBanner(null);
  }, [activeNavigationRouteKey]);

  const updateNavigationCamera = useCallback(
    (force = false) => {
      if (
        !isEvac ||
        !isNavigating ||
        (!followMode && !force) ||
        isBottomNavInteracting ||
        !activeNavigationRoute?.coords?.length
      ) {
        return;
      }

      const coords = safeArray(activeNavigationRoute.coords).filter((coord) =>
        isValidCoordinate(coord?.latitude, coord?.longitude)
      );

      if (coords.length < 2) return;

      const rawLocation = isValidCoordinate(
        currentLocation?.latitude,
        currentLocation?.longitude
      )
        ? currentLocation
        : routeStartCoordinate;
      const { snappedLocation, nextPoint, heading } = getNearestRouteProgress(
        coords,
        rawLocation
      );
      const now = Date.now();

      setCurrentLocation((previous) =>
        previous?.latitude === snappedLocation.latitude &&
        previous?.longitude === snappedLocation.longitude
          ? previous
          : snappedLocation
      );
      setNextRoutePoint(nextPoint);
      setCurrentHeading(heading);

      if (!force && now - lastNavigationCameraAtRef.current < NAV_CAMERA_THROTTLE_MS) {
        return;
      }

      lastNavigationCameraAtRef.current = now;
      mapRef.current?.animateCamera(
        {
          center: snappedLocation,
          heading: getNavigationCameraHeading(heading),
          zoom: NAV_ZOOM,
          pitch: NAV_PITCH,
        },
        { duration: force ? 450 : 700 }
      );
    },
    [
      activeNavigationRoute,
      currentLocation,
      followMode,
      isBottomNavInteracting,
      isEvac,
      isNavigating,
      routeStartCoordinate,
    ]
  );

  const recenterNavigationCamera = useCallback(() => {
    if (!isEvac || !isNavigating || !activeNavigationRoute?.coords?.length) {
      return;
    }

    setFollowMode(true);
    updateNavigationCamera(true);
  }, [activeNavigationRoute, isEvac, isNavigating, updateNavigationCamera]);

  const pauseFollowForManualPan = useCallback(() => {
    if (isEvac && routeRequested) {
      evacRouteManualCameraRef.current = true;
    }

    if (!isEvac || !isNavigating) return;

    setFollowMode(false);

    if (recenterTimerRef.current) {
      clearTimeout(recenterTimerRef.current);
    }

    recenterTimerRef.current = setTimeout(() => {
      recenterNavigationCamera();
    }, 10000);
  }, [isEvac, isNavigating, recenterNavigationCamera, routeRequested]);

  useEffect(() => {
    return () => {
      if (recenterTimerRef.current) {
        clearTimeout(recenterTimerRef.current);
      }
    };
  }, []);

  const resetNavigationCamera = useCallback(() => {
    mapRef.current?.animateCamera(
      {
        center: routeStartCoordinate,
        heading: 0,
        pitch: 0,
        zoom: 14,
      },
      { duration: 450 }
    );
  }, [routeStartCoordinate]);

  const startNavigationCamera = useCallback((route, origin = routeStartCoordinate) => {
    const coords = safeArray(route?.coords).filter((coord) =>
      isValidCoordinate(coord?.latitude, coord?.longitude)
    );
    const { snappedLocation, nextPoint, heading } = getNearestRouteProgress(
      coords,
      origin
    );

    lastNavigationCameraAtRef.current = Date.now();
    mapRef.current?.animateCamera(
      {
        center: snappedLocation,
        heading: getNavigationCameraHeading(heading),
        zoom: NAV_ZOOM,
        pitch: NAV_PITCH,
      },
      { duration: 450 }
    );

    return { heading, nextPoint, snappedLocation };
  }, [routeStartCoordinate]);

  useEffect(() => {
    if (!routeRequested || !routing.routes?.length) return;

    setRoutes(routing.routes);
    setActiveRoute(routing.routes[0]);

    const firstRoute = routing.routes[0];
    const routeCameraKey = [
      normalizedSelectedEvac?._id || "",
      normalizedSelectedEvac?.latitude || "",
      normalizedSelectedEvac?.longitude || "",
      routeStartCoordinate.latitude,
      routeStartCoordinate.longitude,
      travelMode,
      firstRoute?.id || "",
      safeArray(firstRoute?.coords).length,
    ].join(":");

    if (
      panelState !== "NAVIGATION" &&
      !evacRouteManualCameraRef.current &&
      evacRouteAutoFitKeyRef.current !== routeCameraKey
    ) {
      evacRouteAutoFitKeyRef.current = routeCameraKey;
      mapRef.current?.fitToCoordinates(routing.routes[0].coords, {
        edgePadding: EVAC_ROUTE_EDGE_PADDING,
        animated: true,
      });
    }
  }, [
    normalizedSelectedEvac,
    panelState,
    routeRequested,
    routeStartCoordinate,
    routing.routes,
    setActiveRoute,
    setRoutes,
    travelMode,
  ]);

  useEffect(() => {
    if (!isNavigating || !followMode) return undefined;

    updateNavigationCamera(true);
    const intervalId = setInterval(() => updateNavigationCamera(false), 1200);

    return () => clearInterval(intervalId);
  }, [followMode, isNavigating, updateNavigationCamera]);

  useEffect(() => {
    if (!isEvac || !isNavigating || !activeNavigationRoute?.coords?.length) {
      setRouteHazardBanner(null);
      routeHazardAlertedRef.current.clear();
      return;
    }

    const checkRouteHazards = () => {
      const hazard = findIncidentAheadOnRoute({
        routeCoords: activeNavigationRoute.coords,
        currentLocation,
        incidents: normalizedIncidents,
      });

      if (!hazard) {
        setRouteHazardBanner(null);
        return;
      }

      const threshold = [...ROUTE_HAZARD_THRESHOLDS_METERS].sort((a, b) => a - b).find(
        (item) => hazard.distanceAheadMeters <= item
      );

      if (!threshold) return;

      const incidentId =
        hazard.incident?._id ||
        `${hazard.incident?.type}-${hazard.incident?.latitude}-${hazard.incident?.longitude}`;
      const alertKey = `${incidentId}:${threshold}`;
      if (routeHazardAlertedRef.current.has(alertKey)) return;

      routeHazardAlertedRef.current.add(alertKey);

      const category = normalizeIncidentCategory(hazard.incident?.type);
      const message = getRouteHazardMessage(hazard.incident, threshold);

      setRouteHazardBanner({
        id: alertKey,
        message,
        incident: hazard.incident,
        threshold,
        category,
        icon: getIncidentCategoryIcon(category),
        distanceAheadMeters: hazard.distanceAheadMeters,
        routeOffsetMeters: hazard.routeOffsetMeters,
        createdAt: Date.now(),
      });
      playDangerNotificationSound();
    };

    checkRouteHazards();
    const intervalId = setInterval(checkRouteHazards, ROUTE_HAZARD_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [
    activeNavigationRoute,
    currentLocation,
    isEvac,
    isNavigating,
    normalizedIncidents,
  ]);

  useEffect(() => {
    if (!isNavigating || !["driving", "cycling"].includes(travelMode)) {
      setCurrentSpeedKmh(0);
      return undefined;
    }

    let subscription = null;
    let mounted = true;

    async function watchGpsSpeed() {
      if (Platform.OS === "web") {
        setCurrentSpeedKmh(0);
        return;
      }

      try {
        const Location = await import("expo-location");
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!mounted || permission.status !== "granted") {
          setCurrentSpeedKmh(0);
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1200,
            distanceInterval: 2,
          },
          (position) => {
            const gpsSpeed = Number(position?.coords?.speed);
            setCurrentSpeedKmh((previous) => smoothSpeed(previous, gpsSpeed));
          }
        );
      } catch (err) {
        console.log("GPS speed watch failed:", err?.message);
        setCurrentSpeedKmh(0);
      }
    }

    watchGpsSpeed();

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [isNavigating, travelMode]);

  const jaenBoundary = useMemo(
    () => renderBoundary(jaenGeoJSON, "jaen", "#065F46", 2.5, "transparent"),
    []
  );

  const jaenFocusMask = useMemo(() => {
    const holes = getBoundaryHoles(jaenGeoJSON);
    return (
      <Polygon
        key="outside-jaen-mask"
        coordinates={OUTSIDE_JAEN_MASK}
        holes={holes}
        strokeColor="rgba(15,23,42,0)"
        fillColor="rgba(0,0,0,0.58)"
        tappable={false}
        zIndex={5}
      />
    );
  }, []);

  const jaenBounds = useMemo(() => getBoundsFromData(jaenGeoJSON), []);
  const mapAtmosphere = useMemo(() => getForecastAtmosphere(mapWeather), [mapWeather]);

  useEffect(() => {
    if (!mapAtmosphere.showFog) {
      setFogPulseLevel(0);
      return undefined;
    }

    setFogPulseLevel(0.65);
    const intervalId = setInterval(() => {
      setFogPulseLevel((value) => (value < 0.8 ? 1 : 0.65));
    }, 2800);

    return () => clearInterval(intervalId);
  }, [mapAtmosphere.key, mapAtmosphere.showFog]);

  const jaenAtmosphereLayer = useMemo(
    () =>
      renderInsideJaenAtmosphere(
        jaenGeoJSON,
        mapAtmosphere,
        mapAtmosphere.fogOpacity * fogPulseLevel
      ),
    [fogPulseLevel, mapAtmosphere]
  );

  const localBarangayBoundaries = useMemo(
    () =>
      renderBoundary(
        areasData,
        "brgy-local",
        "#1f2937",
        1,
        "rgba(6,95,70,0.12)"
      ),
    []
  );

  const mongoBarangayBoundaries = useMemo(
    () => {
      const features = safeFeatures(mongoBarangays);
      const totalFeatures = features.length;

      return features.flatMap((feature, index) => {
        const geometry = feature?.geometry;
        if (!geometry?.coordinates) return [];

        const rings =
          geometry.type === "Polygon"
            ? [geometry.coordinates[0]]
            : geometry.type === "MultiPolygon"
              ? geometry.coordinates.map((polygon) => polygon[0])
              : [];

        const fillColor = getBarangayFillColor(index, totalFeatures);

        return rings.map((ring, ringIndex) => {
          const coordinates = toCoords(ring);
          if (!coordinates.length) return null;

          return (
            <Polygon
              key={`mongo-${index}-${ringIndex}`}
              coordinates={coordinates}
              strokeColor="#111827"
              strokeWidth={1.25}
              fillColor={fillColor}
              zIndex={60}
            />
          );
        });
      });
    },
    [mongoBarangays]
  );

  const barangayLegend = useMemo(() => {
    const features = safeFeatures(mongoBarangays).length
      ? safeFeatures(mongoBarangays)
      : safeFeatures(areasData);
    const totalFeatures = features.length;

    return features.map((feature, index) => ({
      label: getBarangayLabel(feature, index),
      color: getBarangayColor(index, totalFeatures),
    }));
  }, [mongoBarangays]);

  const displayedBarangayCount =
    safeFeatures(mongoBarangays).length || safeFeatures(areasData).length;
const homepageBarangays = useMemo(() => {
  const features = safeFeatures(mongoBarangays).length
    ? safeFeatures(mongoBarangays)
    : safeFeatures(areasData);

  const totalFeatures = features.length;

  return features
    .map((feature, index) => {
      const mainRing = getFeatureMainRing(feature);
      const rawCenter = getBarangayLabelCoordinate(feature, mainRing);
      const center = toMarkerCoordinate(rawCenter);
      const label = getBarangayLabel(feature, index);

      if (!mainRing.length || !center) return null;

      return {
        id: String(
          feature?._id ||
            feature?.properties?._id ||
            feature?.properties?.id ||
            `${label}-${index}`
        ),
        label,
        feature,
        index,
        center,
        mainRing,
        color: getBarangayOutlineColor(index, totalFeatures),
        fillColor: getBarangaySoftFillColor(index, totalFeatures),
        selectedFillColor: getBarangayFillColor(index, totalFeatures),
      };
    })
    .filter(Boolean);
}, [mongoBarangays]);

const hazardBarangayOutlines = useMemo(() => {
  if (!isFlood && !isEarthquake) return null;

  return homepageBarangays.map((barangay) => (
    <Polygon
      key={`hazard-brgy-outline-${barangay.id}`}
      coordinates={barangay.mainRing}
      strokeColor="rgba(17, 24, 39, 0.88)"
      strokeWidth={1.6}
      fillColor="rgba(0,0,0,0)"
      tappable={false}
      zIndex={95}
    />
  ));
}, [homepageBarangays, isEarthquake, isFlood]);

  const incidentBarangayCounts = useMemo(() => {
    const stats = {};

    normalizedIncidents.forEach((incident) => {
      const point = { latitude: incident.latitude, longitude: incident.longitude };
      const match = homepageBarangays.find((barangay) =>
        isPointInBarangay(point, barangay.feature)
      );

      if (match) {
        if (!stats[match.id]) {
          stats[match.id] = { count: 0, typeCounts: {} };
        }
        stats[match.id].count += 1;
        const type = safeDisplayText(incident?.type, "Incident");
        stats[match.id].typeCounts[type] = (stats[match.id].typeCounts[type] || 0) + 1;
      }
    });

    return Object.fromEntries(
      Object.entries(stats).map(([id, stat]) => {
        const [topType = "Incident", topTypeCount = 0] =
          Object.entries(stat.typeCounts).sort((a, b) => b[1] - a[1])[0] || [];
        const dominantIncidentLabel =
          topTypeCount > 0
            ? `${formatIncidentType(topType)}: ${topTypeCount} report${
                topTypeCount === 1 ? "" : "s"
              }`
            : "";
        return [id, { ...stat, topType, topTypeCount, dominantIncidentLabel }];
      })
    );
  }, [homepageBarangays, normalizedIncidents]);

  const maxBarangayIncidentCount = useMemo(
    () =>
      Math.max(
        0,
        ...Object.values(incidentBarangayCounts).map((item) => Number(item?.count || 0))
      ),
    [incidentBarangayCounts]
  );

  useEffect(() => {
    if (!showHomepageBarangays || !maxBarangayIncidentCount) {
      setHeatPulseLevel(0.45);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setHeatPulseLevel((value) => (value < 0.72 ? 0.86 : 0.45));
    }, 1600);

    return () => clearInterval(intervalId);
  }, [maxBarangayIncidentCount, showHomepageBarangays]);

  const incidentClusterWarnings = useMemo(() => {
    const grouped = {};

    Object.entries(incidentBarangayCounts).forEach(([barangayId, stat]) => {
      Object.entries(stat?.typeCounts || {}).forEach(([type, count]) => {
        const category = normalizeIncidentCategory(type);
        if (!grouped[category]) {
          grouped[category] = {
            category,
            type,
            total: 0,
            barangays: [],
          };
        }

        grouped[category].total += Number(count || 0);
        if (count > 0) {
          const barangay = homepageBarangays.find((item) => item.id === barangayId);
          grouped[category].barangays.push({
            id: barangayId,
            label: barangay?.label || "Nearby barangay",
            count: Number(count || 0),
          });
        }
      });
    });

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        thresholdLevel: getClusterThresholdLevel(item.total),
      }))
      .filter(
        (item) =>
          item.thresholdLevel &&
          item.total >= INCIDENT_CLUSTER_MIN_REPORTS &&
          item.barangays.length >= INCIDENT_CLUSTER_MIN_BARANGAYS
      );
  }, [homepageBarangays, incidentBarangayCounts]);

  useEffect(() => {
    if (typeof addNotification !== "function") return;
    if (!incidentClusterWarnings.length) return;

    let cancelled = false;

    async function checkClusterNotifications() {
      for (const cluster of incidentClusterWarnings) {
        const check = await shouldNotifyCluster(cluster);
        if (cancelled || !check.key) continue;
        if (clusterNotificationInFlightRef.current.has(check.key)) continue;
        if (!check.shouldNotify) continue;

        clusterNotificationInFlightRef.current.add(check.key);

        const categoryLabel = formatIncidentType(cluster.category).toLowerCase();
        const message =
          cluster.category === "flood"
            ? "Multiple nearby barangays have reported flooding. Stay alert."
            : `${cluster.barangays.length} barangays reported the same incident nearby. Be careful.`;

        addNotification({
          type: "nearby_repeated_incident",
          title: "Clustered incident reports",
          message,
          icon: getIncidentCategoryIcon(cluster.category),
          notificationType: "danger",
          soundType: "danger",
          sourceLabel: "Incident Alert",
          official: true,
          incidentCluster: {
            category: categoryLabel,
            total: cluster.total,
            thresholdLevel: check.thresholdLevel,
            barangays: cluster.barangays.map((item) => item.label),
          },
        });
        await markClusterNotificationShown(check.key);
      }
    }

    checkClusterNotifications();

    return () => {
      cancelled = true;
    };
  }, [addNotification, incidentClusterWarnings]);

const selectedBarangayIncidents = useMemo(() => {
  if (!selectedBarangay) return normalizedIncidents;

  const normalizedLabel = String(selectedBarangay.label || "").trim().toLowerCase();

  return normalizedIncidents.filter((incident) => {
    const point = {
      latitude: incident.latitude,
      longitude: incident.longitude,
    };

    if (isPointInBarangay(point, selectedBarangay.feature)) {
      return true;
    }

    const incidentBarangay = String(incident?.barangay || "").trim().toLowerCase();
    const locationText = String(incident?.location || "").trim().toLowerCase();

    return (
      normalizedLabel &&
      (incidentBarangay === normalizedLabel || locationText.includes(normalizedLabel))
    );
  });
}, [normalizedIncidents, selectedBarangay]);

  const handleWeatherChange = useCallback((nextWeather) => {
    setMapWeather(nextWeather);
  }, []);

const handleSelectBarangay = useCallback(
  (barangay) => {
    if (!barangay?.mainRing?.length) return;

    const selection = resolveIncidentBarangaySelection(
      barangay.feature,
      barangay.label
    );
    const nextBarangay = selection.barangayValue || String(barangay.label || "").trim();
    const nextDistrict = selection.districtValue || getDistrictFromBarangay(nextBarangay);

    setSelectedBarangay(barangay);

    if (!activeModule) {
      setActiveMapModule("incident");
    }

    setIncidentDraft((prev) => ({
      ...prev,
      district: nextDistrict || "",
      barangay: nextBarangay || "",
    }));

    setPanelY(null);

    mapRef.current?.fitToCoordinates(barangay.mainRing, {
      edgePadding: {
        top: 150,
        bottom: 360,
        left: 46,
        right: 46,
      },
      animated: true,
    });
  },
  [activeModule, setActiveMapModule, setPanelY]
);

const selectedBarangayIdSet = useMemo(
  () => new Set(selectedBarangayIds),
  [selectedBarangayIds]
);

const hasBarangayVisibilityFilter = isBarangay && selectedBarangayIds.length > 0;
const isBarangaySelectionMode = isBarangay && barangaySpecificMode;

const toggleBarangayVisibility = useCallback((barangayId) => {
  if (!barangayId) return;

  setSelectedBarangayIds((prev) =>
    prev.includes(barangayId)
      ? prev.filter((id) => id !== barangayId)
      : [...prev, barangayId]
  );
}, []);

const clearBarangayVisibilityFilter = useCallback(() => {
  setSelectedBarangayIds([]);
  setBarangaySpecificMode(false);
}, []);

  const clearSelectedBarangay = useCallback(() => {
    setSelectedBarangay(null);
    setSelectedBarangayIds([]);
    setBarangaySpecificMode(false);
    mapRef.current?.animateToRegion(JAEN_INITIAL_REGION, 260);
  }, []);

 const selectedIncidentCoordinate = useMemo(() => {
  const latitude = toNumber(incidentDraft.latitude);
  const longitude = toNumber(incidentDraft.longitude);

  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}, [incidentDraft.latitude, incidentDraft.longitude]);

  const userCoordinate = useMemo(
    () => toMarkerCoordinate(routeStartCoordinate),
    [routeStartCoordinate]
  );
  const selectedEvacCoordinate = useMemo(
    () => toMarkerCoordinate(normalizedSelectedEvac),
    [normalizedSelectedEvac]
  );
const visibleIncidentMarkers = useMemo(() => {
  if (!(isIncident && selectedBarangay)) return normalizedIncidents;

  const normalizedSelectedBarangay = String(selectedBarangay.label || "")
    .trim()
    .toLowerCase();

  return normalizedIncidents.filter((incident) => {
    const point = {
      latitude: incident.latitude,
      longitude: incident.longitude,
    };

    if (isPointInBarangay(point, selectedBarangay.feature)) {
      return true;
    }

    const incidentBarangay = String(incident?.barangay || "").trim().toLowerCase();
    const locationText = String(incident?.location || "").trim().toLowerCase();

    return (
      normalizedSelectedBarangay &&
      (incidentBarangay === normalizedSelectedBarangay ||
        locationText.includes(normalizedSelectedBarangay))
    );
  });
}, [isIncident, normalizedIncidents, selectedBarangay]);

const shouldShowIncidentMarkers =
  isIncident && visibleIncidentMarkers.length > 0;

  const focusIncidentOnMap = useCallback(
    (incident) => {
      const latitude = Number(incident?.latitude);
      const longitude = Number(incident?.longitude);

      if (!isValidCoordinate(latitude, longitude)) return;

      setPanelY(420);
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        320
      );
    },
    [setPanelY]
  );

  const incidentPointInsideJaen = useMemo(
    () =>
      selectedIncidentCoordinate
        ? isPointInsideJaenBoundary(selectedIncidentCoordinate)
        : false,
    [selectedIncidentCoordinate]
  );

  const canSubmitIncidentFromLocation = incidentDebugMode || incidentPointInsideJaen;

  const navigationTopSummary = useMemo(() => {
    const maneuver = getUpcomingManeuver(activeNavigationRoute?.coords, currentLocation);
    const nextKm = distanceKm(currentLocation, maneuver.point || nextRoutePoint);
    const distanceToNextTurn =
      nextKm == null
        ? "--"
        : nextKm < 1
          ? `${Math.max(10, Math.round(nextKm * 1000))} m`
          : `${nextKm.toFixed(1)} km`;

    return {
      instruction: maneuver.instruction,
      maneuverIcon: maneuver.icon,
      distanceToNextTurn,
      roadName:
        normalizedSelectedEvac?.barangayName ||
        normalizedSelectedEvac?.location ||
        "Jaen evacuation route",
      eta: activeNavigationRoute?.summary?.displayTime || "--",
      remainingDistance: activeNavigationRoute?.summary?.km
        ? `${activeNavigationRoute.summary.km} km`
        : "--",
      travelModeLabel: travelMode.charAt(0).toUpperCase() + travelMode.slice(1),
    };
  }, [activeNavigationRoute, currentLocation, nextRoutePoint, normalizedSelectedEvac, travelMode]);

  const exitNavigationMode = useCallback(() => {
    setIsNavigating(false);
    setFollowMode(false);
    setCurrentLocation(routeStartCoordinate);
    setNextRoutePoint(null);
    setCurrentHeading(0);
    setRouteHazardBanner(null);
    evacRouteManualCameraRef.current = false;
    evacRouteAutoFitKeyRef.current = "";
    routeHazardAlertedRef.current.clear();
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setPanelState("PLACE_INFO");
    setPanelY(300);
    resetNavigationCamera();
    if (recenterTimerRef.current) {
      clearTimeout(recenterTimerRef.current);
      recenterTimerRef.current = null;
    }
  }, [
    resetNavigationCamera,
    routeStartCoordinate,
    setActiveRoute,
    setPanelState,
    setPanelY,
    setRouteRequested,
    setRoutes,
  ]);

  const handleBack = useCallback(() => {
    navigation.setParams({
      module: undefined,
      evacPlace: undefined,
      barangay: undefined,
      place: undefined,
    });
    setEvac(null);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setIsNavigating(false);
    setFollowMode(false);
    setNextRoutePoint(null);
    setCurrentHeading(0);
    setRouteHazardBanner(null);
    evacRouteManualCameraRef.current = false;
    evacRouteAutoFitKeyRef.current = "";
    routeHazardAlertedRef.current.clear();
    setActiveMapModule(null);
    setPanelState("HIDDEN");
    setPanelY(null);
    setSelectedBarangay(null);
    setSelectedBarangayIds([]);
    setBarangaySpecificMode(false);
    if (evacSelectionRecenterTimerRef.current) {
      clearTimeout(evacSelectionRecenterTimerRef.current);
      evacSelectionRecenterTimerRef.current = null;
    }
    mapRef.current?.animateToRegion(JAEN_INITIAL_REGION, 260);
  }, [
    navigation,
    setActiveMapModule,
    setActiveRoute,
    setEvac,
    setPanelState,
    setPanelY,
    setRouteRequested,
    setRoutes,
  ]);

  const handleEvacMarkerPress = useCallback(
    (place) => {
      const normalizedPlace = normalizePlace(place);
      if (!normalizedPlace) return;

      setEvac(normalizedPlace);
      setPanelState("PLACE_INFO");
      setPanelY(null);
      setRouteRequested(false);
      setRoutes([]);
      setActiveRoute(null);
      setIsNavigating(false);
      setFollowMode(false);
      setNextRoutePoint(null);
      setCurrentHeading(0);
      setRouteHazardBanner(null);
      evacRouteManualCameraRef.current = false;
      evacRouteAutoFitKeyRef.current = "";
      routeHazardAlertedRef.current.clear();

      mapRef.current?.fitToCoordinates([routeStartCoordinate, normalizedPlace], {
        edgePadding: EVAC_ROUTE_EDGE_PADDING,
        animated: true,
      });
      scheduleEvacSelectionRecenter(normalizedPlace);
    },
    [
      routeStartCoordinate,
      scheduleEvacSelectionRecenter,
      setActiveRoute,
      setEvac,
      setPanelState,
      setPanelY,
      setRouteRequested,
      setRoutes,
    ]
  );
  
  const handleMapPress = useCallback(
  (event) => {
    if (!isIncident) return;

    const now = Date.now();
    if (now - recentModuleChangeRef.current < 650) return;

    const latitude = toNumber(event?.nativeEvent?.coordinate?.latitude);
    const longitude = toNumber(event?.nativeEvent?.coordinate?.longitude);

    if (!isValidCoordinate(latitude, longitude)) return;

    if (!incidentDebugMode) {
      Alert.alert(
        "Real Location Required",
        "Debug Mode OFF uses your phone location. Turn on Debug Mode to choose a test location on the map."
      );
      return;
    }

    const matchedFeature = findBarangayFeatureByCoordinate(
      latitude,
      longitude,
      homepageBarangays.map((barangay) => barangay.feature)
    );

    console.log("[incident debug map tap]", {
      latitude,
      longitude,
      insideReportableBarangay: Boolean(matchedFeature),
    });
    let matchedBarangay = matchedFeature
      ? homepageBarangays.find((barangay) => barangay.feature === matchedFeature)
      : null;

    if (!matchedBarangay) {
      matchedBarangay =
        homepageBarangays
          .map((barangay) => {
            const center = barangay?.center;
            if (!center) return null;

            const dx = center.latitude - latitude;
            const dy = center.longitude - longitude;
            const distance = dx * dx + dy * dy;

            return { barangay, distance };
          })
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance)[0]?.barangay || null;
    }

    const selection = matchedBarangay
      ? resolveIncidentBarangaySelection(matchedBarangay.feature, matchedBarangay.label)
      : {
          detectedBarangay: "",
          detectedDistrict: "",
          barangayValue: "",
          districtValue: "",
          barangayDropdownMatched: false,
          districtDropdownMatched: false,
        };
    const detectedBarangay = selection.barangayValue || selection.detectedBarangay || "";
    const detectedDistrict = selection.districtValue || selection.detectedDistrict || "";

    console.log("[incident barangay detected]", {
      detectedBarangayName: selection.detectedBarangay || "",
      detectedDistrictName: selection.detectedDistrict || "",
      featureProperties: matchedBarangay?.feature?.properties || null,
      matchedBy: matchedFeature ? "polygon" : matchedBarangay ? "nearest" : "none",
    });
    logIncidentDropdownResolution(selection);

    if (matchedBarangay) {
      setSelectedBarangay(matchedBarangay);
    }

    setIncidentDraft((prev) => ({
      ...prev,
      district: detectedDistrict,
      barangay: detectedBarangay,
      location: compactAddressParts([
        detectedBarangay ? `Barangay ${detectedBarangay}` : "Selected map location",
        "Jaen",
        "Nueva Ecija",
      ]).join(", "),
      latitude,
      longitude,
    }));

    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      280
    );
  },
  [homepageBarangays, incidentDebugMode, isIncident]
);

  const openQuickIncidentReport = useCallback(async () => {
    const latitude = toNumber(currentLocation?.latitude);
    const longitude = toNumber(currentLocation?.longitude);

    if (!isValidCoordinate(latitude, longitude)) {
      Alert.alert("Location Unavailable", "Current navigation location is not available.");
      return;
    }

    const matchedFeature = findBarangayFeatureByCoordinate(
      latitude,
      longitude,
      homepageBarangays.map((barangay) => barangay.feature)
    );
    const matchedBarangay = matchedFeature
      ? homepageBarangays.find((barangay) => barangay.feature === matchedFeature)
      : null;
    let reversePlace = null;

    if (Platform.OS !== "web") {
      try {
        const Location = await import("expo-location");
        const matches = await Location.reverseGeocodeAsync({ latitude, longitude });
        reversePlace = matches?.[0] || null;
      } catch (err) {
        console.log("Quick report reverse geocode failed:", err?.message);
      }
    }

    const reverseBarangay = getReverseGeocodeBarangay(reversePlace);
    const selection = matchedBarangay
      ? resolveIncidentBarangaySelection(matchedBarangay.feature, matchedBarangay.label)
      : null;
    const barangay =
      selection?.barangayValue ||
      matchBarangayOption(reverseBarangay) ||
      reverseBarangay ||
      "Unknown barangay";
    const district =
      selection?.districtValue ||
      getDistrictFromBarangay(barangay) ||
      "Unknown district";
    const road = getReverseGeocodeRoad(reversePlace);
    const readableAddress = buildReadableNavigationAddress({
      place: reversePlace,
      barangay,
      road,
    });

    setIncidentErrors({});
    setIncidentImageError("");
    setIncidentDraft((prev) => ({
      ...prev,
      type: "",
      level: prev.level || "medium",
      district,
      barangay,
      street: road,
      location: readableAddress,
      latitude,
      longitude,
      description: "",
      usernames: user?.username || prev.usernames || "",
      phone: user?.phone || prev.phone || "",
    }));
    setQuickReportVisible(true);
  }, [currentLocation, homepageBarangays, user?.phone, user?.username]);

  const useCurrentIncidentLocation = useCallback(async () => {
    if (incidentLocating) return;

    if (Platform.OS === "web") {
      Alert.alert("Current Location", "Current location is not available in this app view.");
      return;
    }

    setIncidentLocating(true);

    try {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location Permission Needed",
          "Allow location access or manually type the incident address."
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });


      const latitude = toNumber(current?.coords?.latitude);
const longitude = toNumber(current?.coords?.longitude);

if (!isValidCoordinate(latitude, longitude)) {
  Alert.alert("Location Unavailable", "We could not read your current location.");
  return;
}

const currentLocationFeature = findBarangayFeatureByCoordinate(
  latitude,
  longitude,
  homepageBarangays.map((barangay) => barangay.feature)
);

if (!incidentDebugMode && !currentLocationFeature) {
  Alert.alert(
    "Outside Jaen Boundary",
    "Reports can only be given inside Jaen"
  );
  return;
}

      let address = formatCoordinateAddress(latitude, longitude, "Current location");
      try {
        const matches = await Location.reverseGeocodeAsync({ latitude, longitude });
        address = formatReverseGeocodeAddress(matches?.[0], latitude, longitude);
      } catch (_) {
        // Coordinates are enough if reverse geocoding is temporarily unavailable.
      }

 setIncidentDraft((prev) => ({
  ...prev,
  location: sanitizeFreeTextOnSubmit(address, INCIDENT_LOCATION_MAX_LENGTH),
  latitude,
  longitude,
}));

      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        420
      );
    } catch (err) {
      Alert.alert(
        "Location Unavailable",
        err?.message || "Unable to get your current location right now."
      );
    } finally {
      setIncidentLocating(false);
    }
  }, [homepageBarangays, incidentDebugMode, incidentLocating]);

  const applyIncidentImages = useCallback((nextImages, replace = false) => {
    const currentImages = replace ? [] : getIncidentImageItems(incidentImage);
    const mergedImages = [...currentImages, ...safeArray(nextImages)].slice(
      0,
      INCIDENT_IMAGE_LIMIT
    );
    const error = validateIncidentImages(mergedImages);

    if (error) {
      setIncidentImage(null);
      setIncidentImageError(error);
      return;
    }

    setIncidentImage(
      mergedImages.length
        ? { ...mergedImages[0], items: mergedImages }
        : null
    );
    setIncidentImageError("");
  }, [incidentImage]);

  const pickIncidentImage = useCallback(async () => {
    if (Platform.OS === "web") return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted && permission.status !== "granted") {
        Alert.alert("Photo Permission Needed", "Allow photo access to upload incident images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: INCIDENT_IMAGE_LIMIT,
        quality: 0.7,
        legacy: Platform.OS === "android",
      });

      if (result.canceled || !Array.isArray(result.assets) || !result.assets[0]?.uri) {
        return;
      }

      const pickedImages = result.assets
        .slice(0, INCIDENT_IMAGE_LIMIT)
        .map(normalizeIncidentPickerAsset)
        .filter(Boolean);

      applyIncidentImages(pickedImages, true);
    } catch (error) {
      console.log("[incident image picker failed]", error?.message || error);
      Alert.alert("Upload failed", "Unable to open your photo gallery right now.");
    }
  }, [applyIncidentImages]);

  const takeIncidentPhoto = useCallback(async () => {
    if (Platform.OS === "web") return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted && permission.status !== "granted") {
        Alert.alert("Camera Permission Needed", "Allow camera access to take incident photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
      });

      if (result.canceled || !Array.isArray(result.assets) || !result.assets[0]?.uri) {
        return;
      }

      const photo = normalizeIncidentPickerAsset(result.assets[0], 0);
      applyIncidentImages(photo ? [photo] : [], false);
    } catch (error) {
      console.log("[incident camera picker failed]", error?.message || error);
      Alert.alert("Camera failed", "Unable to open your camera right now.");
    }
  }, [applyIncidentImages]);

  const removeIncidentImage = useCallback((uri) => {
    const remainingImages = getIncidentImageItems(incidentImage).filter(
      (item) => item.uri !== uri
    );
    setIncidentImage(
      remainingImages.length
        ? { ...remainingImages[0], items: remainingImages }
        : null
    );
    setIncidentImageError("");
  }, [incidentImage]);
  const submitIncident = useCallback(async () => {
  if (incidentBusy) return;
  const nextErrors = {};

  if (!incidentDraft.type || !incidentDraft.level) {
    if (!incidentDraft.type) nextErrors.type = "Incident type required";
    if (!incidentDraft.level) nextErrors.level = "Severity required";
  }

  const cleanDistrict = String(incidentDraft.district || "").trim();
  const cleanBarangay = String(incidentDraft.barangay || "").trim();
  const cleanStreet = sanitizeFreeTextOnSubmit(incidentDraft.street, 160);
  const cleanDescription = sanitizeFreeTextOnSubmit(
    incidentDraft.description,
    INCIDENT_DESCRIPTION_MAX_LENGTH
  );

  const cleanLocation = buildIncidentAddress({
    district: cleanDistrict,
    barangay: cleanBarangay,
    street: cleanStreet,
    location: incidentDraft.location,
  });

  if (!cleanDistrict) {
    nextErrors.district = "District required";
  }

  if (!cleanBarangay) {
    nextErrors.barangay = "Barangay required";
  }

  if (!cleanStreet) {
    nextErrors.street = "Street, Landmark, Detail required";
  }

  const hasCoordinates = isValidCoordinate(
    incidentDraft.latitude,
    incidentDraft.longitude
  );
  const manualAddressBarangay =
    incidentDebugMode && !hasCoordinates && cleanStreet && cleanBarangay
      ? homepageBarangays.find(
          (barangay) =>
            normalizeBarangayName(barangay.label) === normalizeBarangayName(cleanBarangay) ||
            normalizeBarangayName(getFeatureBarangayName(barangay.feature)) ===
              normalizeBarangayName(cleanBarangay)
        )
      : null;
  const manualAddressCoordinate = toMarkerCoordinate(manualAddressBarangay?.center);
  const resolvedIncidentLatitude = hasCoordinates
    ? incidentDraft.latitude
    : manualAddressCoordinate?.latitude;
  const resolvedIncidentLongitude = hasCoordinates
    ? incidentDraft.longitude
    : manualAddressCoordinate?.longitude;
  const hasReportCoordinates = isValidCoordinate(
    resolvedIncidentLatitude,
    resolvedIncidentLongitude
  );

  if (!hasReportCoordinates) {
    nextErrors.location = incidentDebugMode
      ? "Tap the map or use current location to set coordinates."
      : "Use current location to verify you are inside Jaen.";
  }

  const reportPointInsideJaen = Boolean(
    findBarangayFeatureByCoordinate(
      resolvedIncidentLatitude,
      resolvedIncidentLongitude,
      homepageBarangays.map((barangay) => barangay.feature)
    )
  );

  if (hasReportCoordinates && !(reportPointInsideJaen || incidentDebugMode)) {
    nextErrors.location = "Reports can only be given inside Jaen";
  }

  if (cleanDescription.length < 5) {
    nextErrors.description = "Description must at least contain 5 characters";
  }

  if (!incidentImage?.uri) {
    setIncidentImageError("Attach a photo before submitting this incident.");
    nextErrors.image = "Attach an image before submitting.";
  }

  if (Object.keys(nextErrors).length) {
    setIncidentErrors(nextErrors);
    Alert.alert("Check Incident Form", Object.values(nextErrors)[0]);
    return;
  }

  setIncidentErrors({});

  setIncidentBusy(true);

  try {
    const payload = {
      ...incidentDraft,
      district: cleanDistrict,
      barangay: cleanBarangay,
      street: cleanStreet,
      streetAddress: cleanStreet,
      location: cleanLocation,
      latitude: resolvedIncidentLatitude,
      longitude: resolvedIncidentLongitude,
      description: cleanDescription,
      usernames: incidentDraft.usernames || user?.username || "",
      phone: incidentDraft.phone || user?.phone || "",
      userId: user?._id || "",
      reporterUserId: user?._id || "",
    };

    const uploadParameters = {};
    Object.entries(payload).forEach(([key, value]) => {
      uploadParameters[key] = value == null ? "" : String(value);
    });

    console.log("[incident submit payload]", {
      type: payload.type,
      level: payload.level,
      district: payload.district,
      barangay: payload.barangay,
      street: payload.street,
      location: payload.location,
      latitude: payload.latitude,
      longitude: payload.longitude,
      descriptionLength: payload.description.length,
    });

    const imagesToUpload = getIncidentImageItems(incidentImage);
    const formData = buildIncidentFormData(uploadParameters, imagesToUpload);

    await postMultipart("/incident/register", formData);

    if (typeof refreshIncidents === "function") {
      await refreshIncidents();
    } else {
      const incidentsRes = await api.get("/incident/getIncidents");
      const freshIncidents = Array.isArray(incidentsRes?.data)
        ? incidentsRes.data
        : [];

      if (typeof setIncidents === "function") {
        setIncidents(
          freshIncidents.filter((incident) => isPublicIncident(incident))
        );
      }
    }

    Alert.alert(
      "Incident Submitted",
      "Your report is being verified by AI and MDRRMO. It will appear on the map once approved."
    );
    setIncidentDraft(EMPTY_INCIDENT);
    setIncidentErrors({});
    setIncidentImage(null);
    setIncidentImageError("");
    setQuickReportVisible(false);
    return true;
  } catch (err) {
    console.log("Incident submit failed:", {
      message: err?.message,
      data: err?.response?.data,
      status: err?.response?.status,
    });

    const errorCode = err?.response?.data?.code;
    Alert.alert(
      errorCode === "DUPLICATE_INCIDENT"
        ? SIMILAR_INCIDENT_TITLE
        : err?.response?.data?.title || "Submit Failed",
      errorCode === "DUPLICATE_INCIDENT"
        ? SIMILAR_INCIDENT_MESSAGE
        : err?.response?.data?.message || err?.message || "Error submitting incident."
    );
    return false;
  } finally {
    setIncidentBusy(false);
  }
}, [
  incidentBusy,
  incidentDraft,
  incidentDebugMode,
  incidentImage,
  homepageBarangays,
  refreshIncidents,
  setIncidents,
  user?.phone,
  user?._id,
  user?.username,
]);

  const handleRegionChangeComplete = useCallback(
    (region) => {
      if (isClampingRegionRef.current) {
        isClampingRegionRef.current = false;
        return;
      }

      if (isEvac) {
        return;
      }

      const latitudeDelta = Math.min(
        region.latitudeDelta,
        JAEN_INITIAL_REGION.latitudeDelta
      );
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
          160
        );
      }
    },
    [isEvac, jaenBounds]
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={JAEN_INITIAL_REGION}
        minZoomLevel={11}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        customMapStyle={[]}
        scrollEnabled={!isBottomNavInteracting}
        zoomEnabled={!isBottomNavInteracting}
        rotateEnabled={panelState === "NAVIGATION" && !isBottomNavInteracting}
        pitchEnabled={panelState === "NAVIGATION" && !isBottomNavInteracting}
        onPress={handleMapPress}
        onPanDrag={pauseFollowForManualPan}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {jaenFocusMask}
        {jaenAtmosphereLayer}
       {showHomepageBarangays &&
  homepageBarangays.map((barangay) => {
    const isSelected = selectedBarangay?.id === barangay.id;
    const isVisibilitySelected =
      isBarangay && selectedBarangayIdSet.has(barangay.id);
    const isVisibilityMuted = isBarangaySelectionMode && !isVisibilitySelected;
    const isEvacBarangayLayer = isEvac;
    const allowBarangayPolygonPress = isBarangay || (!isIncident && !isEvac);
    const reportStats = incidentBarangayCounts[barangay.id] || {};
    const reportCount = Number(reportStats.count || 0);
    const heatStyle = getHeatStyle(reportCount, maxBarangayIncidentCount, isSelected);
    const strokeColor =
      isBarangay || isEvacBarangayLayer
        ? isVisibilityMuted
          ? "rgba(15, 23, 42, 0.34)"
          : barangay.color
        : heatStyle.strokeColor;
    const fillColor =
      isBarangay || isEvacBarangayLayer
        ? isVisibilityMuted
          ? "rgba(15, 23, 42, 0.22)"
          : isVisibilitySelected
            ? barangay.selectedFillColor
            : barangay.fillColor
        : heatStyle.fillColor;
    const strokeWidth =
      isBarangay || isEvacBarangayLayer
        ? isVisibilityMuted
          ? 1
          : isVisibilitySelected
            ? 2.6
            : isEvacBarangayLayer
              ? 1.65
              : 1.2
        : heatStyle.strokeWidth;

    return (
      <React.Fragment key={`home-brgy-wrap-${barangay.id}`}>
        {isBarangaySelectionMode && isVisibilitySelected && (
          <Polygon
            key={`barangay-filter-glow-${barangay.id}`}
            coordinates={barangay.mainRing}
            strokeColor={barangay.color}
            strokeWidth={5}
            fillColor="rgba(0,0,0,0)"
            tappable={false}
            zIndex={63}
          />
        )}
        {!isBarangay && heatStyle.glow && (
          <Polygon
            key={`home-brgy-glow-${barangay.id}`}
            coordinates={barangay.mainRing}
            strokeColor={`rgba(${heatStyle.glowRgb}, ${Math.min(
              heatStyle.glowAlpha,
              heatPulseLevel
            )})`}
            strokeWidth={heatStyle.glowWidth}
            fillColor={`rgba(${heatStyle.glowRgb}, ${
              0.04 + heatPulseLevel * heatStyle.fillPulseAlpha
            })`}
            tappable={false}
            zIndex={isSelected ? 27 : 17}
          />
        )}
        <Polygon
          key={`home-brgy-${barangay.id}`}
          coordinates={barangay.mainRing}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          fillColor={
            !isBarangay && isSelected ? "rgba(250,204,21,0.16)" : fillColor
          }
          tappable={allowBarangayPolygonPress}
          onPress={
            allowBarangayPolygonPress
              ? () => {
                  if (isBarangaySelectionMode) {
                    toggleBarangayVisibility(barangay.id);
                  } else if (!isBarangay) {
                    handleSelectBarangay(barangay);
                  }
                }
              : undefined
          }
          zIndex={
            isBarangay
              ? isVisibilitySelected
                ? 66
                : isVisibilityMuted
                  ? 52
                  : 56
              : isEvacBarangayLayer
                ? 54
                : isSelected
                  ? 28
                  : 18
          }
        />
      </React.Fragment>
    );
  })}
        {jaenBoundary}
        {isFlood && floodLayers}
        {isEarthquake && earthquakeLayer}
        {hazardBarangayOutlines}

        {isEvac && userCoordinate && !isNavigating && (
          <SafeMarker key="evac-user" coordinate={userCoordinate} pinColor="#2563eb" />
        )}

        {isEvac &&
          !isNavigating &&
          normalizedEvacPlaces.map((place) => {
            const markerCoordinate = place.coordinate || toMarkerCoordinate(place);
            if (!markerCoordinate) return null;

            const isSelected = Boolean(
              normalizedSelectedEvac?._id && normalizedSelectedEvac._id === place._id
            );

            return (
              <SafeMarker
                key={place?._id || `${place.latitude}-${place.longitude}`}
                coordinate={markerCoordinate}
                anchor={{ x: 0.5, y: 1 }}
                zIndex={isSelected ? 320 : 300}
                tracksViewChanges
                onPress={() => handleEvacMarkerPress(place)}
              >
                <EvacuationPlaceMarker
                  color={getEvacStatusColor(place.capacityStatus)}
                  selected={isSelected}
                  label={safeDisplayText(place?.name, "Evacuation center")}
                  badge={place.recommendationRank <= 3 ? place.recommendationBadge : ""}
                />
              </SafeMarker>
            );
          })}
{showBarangayNameMarkers &&
  !(isEvac && isNavigating) &&
  homepageBarangays
    .filter(
      (barangay) =>
        !hasBarangayVisibilityFilter || selectedBarangayIdSet.has(barangay.id)
    )
    .map((barangay) => (
      <SafeMarker
        key={`home-brgy-label-${barangay.id}`}
        coordinate={barangay.center}
        anchor={{ x: 0.5, y: 0.5 }}
        centerOffset={{ x: 0, y: 0 }}
        zIndex={
          isBarangay && selectedBarangayIdSet.has(barangay.id)
            ? 94
            : selectedBarangay?.id === barangay.id
              ? 90
              : 70
        }
        tracksViewChanges={false}
        onPress={() => {
          if (isBarangay) {
            toggleBarangayVisibility(barangay.id);
          } else if (!isEvac) {
            handleSelectBarangay(barangay);
          }
        }}
      >
        <BarangayNameMarker
          label={barangay.label}
          color={
            isBarangay && selectedBarangayIdSet.has(barangay.id)
              ? barangay.color
              : barangay.color
          }
          selected={
            isBarangay
              ? selectedBarangayIdSet.has(barangay.id)
              : selectedBarangay?.id === barangay.id
          }
          incidentCount={isEvac || isBarangay ? 0 : incidentBarangayCounts[barangay.id]?.count || 0}
          dominantIncidentLabel={
            isEvac || isBarangay ? "" : incidentBarangayCounts[barangay.id]?.dominantIncidentLabel || ""
          }
          onPress={() => {
            if (isBarangay && hasBarangayVisibilityFilter) {
              toggleBarangayVisibility(barangay.id);
            } else if (!isEvac && !isBarangay) {
              handleSelectBarangay(barangay);
            }
          }}
        />
      </SafeMarker>
    ))}
{shouldShowIncidentMarkers &&
  visibleIncidentMarkers.map((incident, index) => {
    const latitude = Number(incident?.latitude);
    const longitude = Number(incident?.longitude);

    if (!isValidCoordinate(latitude, longitude)) return null;

    return (
      <Marker
        key={`incident-marker-${incident._id || `${latitude}-${longitude}-${index}`}`}
        coordinate={{ latitude, longitude }}
        anchor={{ x: 0.5, y: 1 }}
        zIndex={120}
        tracksViewChanges={false}
        title={safeDisplayText(incident?.type, "Incident")}
        description={safeDisplayText(
          incident?.location || incident?.barangay,
          "Reported location"
        )}
      >
        <IncidentMapMarker level={incident?.level} type={incident?.type} />
      </Marker>
    );
  })}
        {isIncident && selectedIncidentCoordinate && (
          <SafeMarker coordinate={selectedIncidentCoordinate} pinColor="#111827" />
        )}

        {isEvac && !isNavigating && selectedEvacCoordinate && !normalizedSelectedEvac?._id && (
          <SafeMarker coordinate={selectedEvacCoordinate}>
            <PillMarker
              color="#16a34a"
              label={safeDisplayText(normalizedSelectedEvac?.name, "Evacuation center")}
              compact
            />
          </SafeMarker>
        )}

        {isEvac &&
          routes.map((route, index) => {
            const coordinates =
              panelState === "NAVIGATION"
                ? getNavigationRouteCoords(route.coords, currentLocation)
                : safeArray(route.coords);

            return panelState === "NAVIGATION" && !route.isRecommended ? null : (
              <Polyline
                key={route.id ?? index}
                coordinates={coordinates}
                strokeColor={panelState === "NAVIGATION" ? "#6D28D9" : route.isRecommended ? "#22c55e" : "#ef4444"}
                strokeWidth={panelState === "NAVIGATION" ? 10 : 6}
                zIndex={panelState === "NAVIGATION" ? 180 : 110}
              />
            );
          })}

        {isEvac && isNavigating && userCoordinate && (
          <SafeMarker
            key="navigation-user-arrow"
            coordinate={currentLocation || userCoordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={1500}
            tracksViewChanges
          >
            <NavigationArrowMarker heading={currentHeading} />
          </SafeMarker>
        )}
      </MapView>

      {isEvac && isNavigating && (
        <View style={[styles.wazeTopOverlay, themedOverlay.navigationTop]} pointerEvents="auto">
          <View style={[styles.wazeTopTurnIcon, themedOverlay.softCard]}>
            <Ionicons
              name={navigationTopSummary.maneuverIcon || "arrow-up"}
              size={30}
              color={theme.primary}
            />
          </View>
          <View style={styles.wazeTopCopy}>
            <Text style={[styles.wazeTopInstruction, themedOverlay.text]} numberOfLines={1}>
              {navigationTopSummary.instruction}
            </Text>
          </View>
          <Text style={[styles.wazeTopDistance, themedOverlay.primaryText]}>
            {navigationTopSummary.distanceToNextTurn}
          </Text>
        </View>
      )}

      {isEvac && isNavigating && routeHazardBanner && (
        <RouteHazardAlertPanel alert={routeHazardBanner} />
      )}


      {showMapWeather && (
        <View style={styles.mapWeatherOverlay} pointerEvents="box-none">
          <JaenWeatherForecast variant="map" onWeatherChange={handleWeatherChange} />
        </View>
      )}

      {activeModule && (
        <ModulePanel
          theme={theme}
          themedOverlay={themedOverlay}
          activeModule={activeModule}
          onBack={handleBack}
          incidentDraft={incidentDraft}
          setIncidentDraft={setIncidentDraft}
          incidentImage={incidentImage}
          incidentImageError={incidentImageError}
          incidentErrors={incidentErrors}
          pickIncidentImage={pickIncidentImage}
          takeIncidentPhoto={takeIncidentPhoto}
          removeIncidentImage={removeIncidentImage}
          selectedIncidentCoordinate={selectedIncidentCoordinate}
          useCurrentIncidentLocation={useCurrentIncidentLocation}
          incidentLocating={incidentLocating}
          submitIncident={submitIncident}
          incidentBusy={incidentBusy}
          incidentDebugMode={incidentDebugMode}
          setIncidentDebugMode={setIncidentDebugMode}
          canSubmitIncidentFromLocation={canSubmitIncidentFromLocation}
          incidentPointInsideJaen={incidentPointInsideJaen}
          incidentCount={selectedBarangay ? selectedBarangayIncidents.length : normalizedIncidents.length}
          incidentTopType={
            selectedBarangay
              ? incidentBarangayCounts[selectedBarangay.id]?.dominantIncidentLabel || ""
              : ""
          }
          incidents={selectedBarangayIncidents}
          onIncidentPress={focusIncidentOnMap}
          selectedBarangay={selectedBarangay}
          onClearSelectedBarangay={clearSelectedBarangay}
          barangayCount={displayedBarangayCount}
          barangayLegend={barangayLegend}
          selectedBarangayIds={selectedBarangayIds}
          barangaySpecificMode={barangaySpecificMode}
          setBarangaySpecificMode={setBarangaySpecificMode}
          onToggleBarangayVisibility={toggleBarangayVisibility}
          onClearBarangayVisibilityFilter={clearBarangayVisibilityFilter}
          evac={normalizedSelectedEvac}
          setEvac={setEvac}
          evacPlaces={normalizedEvacPlaces}
          normalizedEvacPlaces={normalizedEvacPlaces}
          panelState={panelState}
          setPanelState={setPanelState}
          panelY={panelY}
          setPanelY={setPanelY}
          setRouteRequested={setRouteRequested}
          routes={routes}
          setRoutes={setRoutes}
          activeRoute={activeNavigationRoute}
          setActiveRoute={setActiveRoute}
          travelMode={travelMode}
          setTravelMode={setTravelMode}
          isNavigating={isNavigating}
          setIsNavigating={setIsNavigating}
          followMode={followMode}
          setFollowMode={setFollowMode}
          currentHeading={currentHeading}
          setCurrentHeading={setCurrentHeading}
          currentLocation={currentLocation}
          setCurrentLocation={setCurrentLocation}
          nextRoutePoint={nextRoutePoint}
          setNextRoutePoint={setNextRoutePoint}
          updateNavigationCamera={updateNavigationCamera}
          recenterNavigationCamera={recenterNavigationCamera}
          startNavigationCamera={startNavigationCamera}
          resetNavigationCamera={resetNavigationCamera}
          exitNavigationMode={exitNavigationMode}
          navigationTopSummary={navigationTopSummary}
          currentSpeedKmh={currentSpeedKmh}
          evacGpsDebugMode={evacGpsDebugMode}
          setEvacGpsDebugMode={setEvacGpsDebugMode}
          evacGpsLocating={evacGpsLocating}
          routeStartCoordinate={routeStartCoordinate}
          openQuickIncidentReport={openQuickIncidentReport}
          quickReportVisible={quickReportVisible}
          setQuickReportVisible={setQuickReportVisible}
          showIncidentMarkers={showIncidentMarkers}
setShowIncidentMarkers={setShowIncidentMarkers}
showBarangayMarkers={showBarangayMarkers}
setShowBarangayMarkers={setShowBarangayMarkers}
homepageBarangays={homepageBarangays}
handleSelectBarangay={handleSelectBarangay}
        />
      )}
    </View>
  );
}

function ModulePanel({
  theme,
  themedOverlay,
  activeModule,
  onBack,
  incidentDraft,
  setIncidentDraft,
  incidentImage,
  incidentImageError,
  incidentErrors,
  pickIncidentImage,
  takeIncidentPhoto,
  removeIncidentImage,
  selectedIncidentCoordinate,
  useCurrentIncidentLocation,
  incidentLocating,
  submitIncident,
  incidentBusy,
  incidentDebugMode,
  setIncidentDebugMode,
  canSubmitIncidentFromLocation,
  incidentPointInsideJaen,
  incidentCount,
  incidentTopType,
  incidents,
  onIncidentPress,
  selectedBarangay,
  onClearSelectedBarangay,
  barangayCount,
  barangayLegend,
  selectedBarangayIds,
  barangaySpecificMode,
  setBarangaySpecificMode,
  onToggleBarangayVisibility,
  onClearBarangayVisibilityFilter,
  evac,
  setEvac,
  evacPlaces,
  normalizedEvacPlaces,
  panelState,
  setPanelState,
  panelY,
  setPanelY,
  setRouteRequested,
  routes,
  setRoutes,
  activeRoute,
  setActiveRoute,
  travelMode,
  setTravelMode,
  isNavigating,
  setIsNavigating,
  followMode,
  setFollowMode,
  currentHeading,
  setCurrentHeading,
  currentLocation,
  setCurrentLocation,
  nextRoutePoint,
  setNextRoutePoint,
  updateNavigationCamera,
  recenterNavigationCamera,
  startNavigationCamera,
  resetNavigationCamera,
  exitNavigationMode,
  navigationTopSummary,
  currentSpeedKmh,
  evacGpsDebugMode,
  setEvacGpsDebugMode,
  evacGpsLocating,
  routeStartCoordinate,
  openQuickIncidentReport,
  quickReportVisible,
  setQuickReportVisible,
    showIncidentMarkers,
  setShowIncidentMarkers,
  showBarangayMarkers,
  setShowBarangayMarkers,
    homepageBarangays,
  handleSelectBarangay,
 
}) {
  const { setIsMapPanelOpen } = useContext(MapContext);
  const [incidentPanelTab, setIncidentPanelTab] = useState("reports");
  const [evacFilter, setEvacFilter] = useState("nearest");
  const [barangayFilterOpen, setBarangayFilterOpen] = useState(false);
  const selectedBarangayIdSetForPanel = useMemo(
    () => new Set(selectedBarangayIds || []),
    [selectedBarangayIds]
  );
  const handlePanelBack = useCallback(() => {
    if (activeModule === "barangay" && barangayFilterOpen) {
      setBarangayFilterOpen(false);
      if (!(selectedBarangayIds || []).length) {
        setBarangaySpecificMode?.(false);
      }
      return;
    }

    onBack?.();
  }, [activeModule, barangayFilterOpen, onBack, selectedBarangayIds, setBarangaySpecificMode]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isPanelHidden, setIsPanelHidden] = useState(false);
  const lastNavigationPanelY = useRef(NAV_PANEL_DEFAULT_OFFSET);
  const isNavigationPanelActiveRef = useRef(false);
  const formScrollRef = useRef(null);
  const inputY = useRef({});
  const fieldFocusTimerRef = useRef(null);
  const formScrollMountedRef = useRef(true);
  const incidentFocusedFieldRef = useRef(null);

  useEffect(() => {
    setIsMapPanelOpen(true);
    return () => setIsMapPanelOpen(false);
  }, [setIsMapPanelOpen]);

  const focusIncidentField = (key) => {
    incidentFocusedFieldRef.current = key;
    scrollToField(key);
  };

  const blurIncidentField = (key) => {
    if (incidentFocusedFieldRef.current === key) {
      incidentFocusedFieldRef.current = null;
    }
  };

  const getFieldScrollY = (key) => {
    if (key === "street") {
      return Number(inputY.current.addressSection || 0) + Number(inputY.current.street || 0);
    }

    if (key === "description") {
      return Number(inputY.current.notesSection || 0) + Number(inputY.current.description || 0);
    }

    return Number(inputY.current[key] || 0);
  };

  const scrollToField = (key, options = {}) => {
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
    }

    const delay = options.delay ?? FIELD_FOCUS_SCROLL_DELAY_MS;
    const offset = options.offset ?? FIELD_FOCUS_SCROLL_OFFSET;

    fieldFocusTimerRef.current = setTimeout(() => {
      if (!formScrollMountedRef.current || !formScrollRef.current) {
        return;
      }

      const y = getFieldScrollY(key);
      formScrollRef.current?.scrollTo({
        y: Math.max(0, y - offset),
        animated: true,
      });
      fieldFocusTimerRef.current = null;
    }, delay);
  };

  useEffect(() => {
    formScrollMountedRef.current = true;

    return () => {
      formScrollMountedRef.current = false;
      if (fieldFocusTimerRef.current) {
        clearTimeout(fieldFocusTimerRef.current);
      }
    };
  }, []);

  const selectedRoute = activeRoute || routes[0] || null;
  const routeSummary = selectedRoute?.summary;
  const routeDistance = navigationTopSummary?.remainingDistance || (routeSummary?.km ? `${routeSummary.km} km` : "--");
  const routeETA = navigationTopSummary?.eta || routeSummary?.displayTime || "--";
  const filteredEvacPlaces = useMemo(() => {
    const items = [...normalizedEvacPlaces];
    const withSpace = (place) =>
      String(place.capacityStatus || "").toLowerCase() !== "full" &&
      Number(place.availableSlots ?? ((place.capacityIndividual || 0) - (place.currentOccupants || 0))) > 0;
    const recommendationRank = (place) => Number(place.recommendationRank || 99);
    const byRecommendedThen = (secondarySort) => (a, b) => {
      const rankDiff = recommendationRank(a) - recommendationRank(b);
      if (rankDiff !== 0) return rankDiff;
      return secondarySort(a, b);
    };
    const byDistance = (a, b) =>
      distance(routeStartCoordinate, a.coordinate) - distance(routeStartCoordinate, b.coordinate);
    const byAvailability = (a, b) =>
      Number(b.availableSlots ?? ((b.capacityIndividual || 0) - (b.currentOccupants || 0))) -
      Number(a.availableSlots ?? ((a.capacityIndividual || 0) - (a.currentOccupants || 0)));
    const byBarangay = (a, b) =>
      String(a.barangayName || "").localeCompare(String(b.barangayName || ""));

    if (evacFilter === "most-available") {
      return items.sort(byRecommendedThen(byAvailability));
    }

    if (evacFilter === "full") {
      return items
        .filter((place) => String(place.capacityStatus || "").toLowerCase() === "full")
        .sort(byRecommendedThen(byDistance));
    }

    if (evacFilter === "has-space") {
      return items.filter(withSpace).sort(byRecommendedThen(byDistance));
    }

    if (evacFilter === "barangay") {
      return items.sort(byRecommendedThen(byBarangay));
    }

    return items.sort(byRecommendedThen(byDistance));
  }, [evacFilter, normalizedEvacPlaces, routeStartCoordinate]);

  const evacPlacesByStatus = useMemo(
    () => ({
      limited: filteredEvacPlaces.filter((place) => place.capacityStatus === "limited"),
      full: filteredEvacPlaces.filter((place) => place.capacityStatus === "full"),
      available: filteredEvacPlaces.filter((place) => place.capacityStatus === "available"),
      other: filteredEvacPlaces.filter(
        (place) => !["available", "limited", "full"].includes(place.capacityStatus)
      ),
    }),
    [filteredEvacPlaces]
  );
  const evacStatusSummary = [
    { key: "available", count: normalizedEvacPlaces.filter((place) => place.capacityStatus === "available").length },
    { key: "limited", count: normalizedEvacPlaces.filter((place) => place.capacityStatus === "limited").length },
    { key: "full", count: normalizedEvacPlaces.filter((place) => place.capacityStatus === "full").length },
  ];
  const currentPanelMaxOffset = activeModule === "evac" && isNavigating
    ? NAV_PANEL_MAX_OFFSET
    : PANEL_MAX_OFFSET;
  const currentPanelDefaultOffset = activeModule === "evac" && isNavigating
    ? NAV_PANEL_DEFAULT_OFFSET
    : PANEL_DEFAULT_OFFSET;

  const initialPanelY =
    typeof panelY === "number"
      ? Math.max(PANEL_MIN_OFFSET, Math.min(currentPanelMaxOffset, panelY))
      : currentPanelDefaultOffset;
  const translateY = useRef(new Animated.Value(initialPanelY)).current;
  const lastY = useRef(initialPanelY);
  const localPanelSnapRef = useRef(false);

  useEffect(() => {
    if (localPanelSnapRef.current) {
      localPanelSnapRef.current = false;
      return;
    }
    if (typeof panelY !== "number") {
      lastY.current = currentPanelDefaultOffset;
      setIsPanelHidden(false);
      setIsMapPanelOpen(true);
      Animated.spring(translateY, {
        toValue: currentPanelDefaultOffset,
        stiffness: 220,
        damping: 30,
        mass: 0.72,
        useNativeDriver: true,
      }).start();
      return;
    }
    const nextY = Math.max(PANEL_MIN_OFFSET, Math.min(currentPanelMaxOffset, panelY));
    translateY.setValue(nextY);
    lastY.current = nextY;
    const hidden = nextY >= currentPanelMaxOffset;
    setIsPanelHidden(hidden);
    setIsMapPanelOpen(!hidden);
  }, [
    currentPanelDefaultOffset,
    currentPanelMaxOffset,
    panelY,
    setIsMapPanelOpen,
    translateY,
  ]);

  useEffect(() => {
    isNavigationPanelActiveRef.current = activeModule === "evac" && isNavigating;
  }, [activeModule, isNavigating]);

  const panelMaxOffsetRef = useRef(currentPanelMaxOffset);
  const panelSnapPointsRef = useRef([
    PANEL_MIN_OFFSET,
    PANEL_MID_OFFSET,
    PANEL_MAX_OFFSET,
  ]);

  useEffect(() => {
    panelMaxOffsetRef.current = currentPanelMaxOffset;
    panelSnapPointsRef.current =
      activeModule === "evac" && isNavigating
        ? [
            NAV_PANEL_EXPANDED_OFFSET,
            NAV_PANEL_HALF_OFFSET,
            NAV_PANEL_COLLAPSED_OFFSET,
          ]
        : [
            PANEL_MIN_OFFSET,
            Math.min(PANEL_MID_OFFSET, currentPanelMaxOffset),
            currentPanelMaxOffset,
          ];
    if (activeModule === "evac" && isNavigating) {
      lastNavigationPanelY.current = Math.max(
        PANEL_MIN_OFFSET,
        Math.min(currentPanelMaxOffset, lastNavigationPanelY.current)
      );
    }
  }, [activeModule, currentPanelMaxOffset, isNavigating]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (incidentFocusedFieldRef.current) return false;
        return (
          Math.abs(gesture.dy) > PANEL_DRAG_THRESHOLD &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15
        );
      },
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: () => {
        setIsPanelHidden(false);
        translateY.stopAnimation((value) => {
          lastY.current = Math.max(PANEL_MIN_OFFSET, Math.min(panelMaxOffsetRef.current, value));
          translateY.setOffset(lastY.current);
          translateY.setValue(0);
        });
      },

      onPanResponderMove: (_, gesture) => {
        const nextY = Math.max(
          PANEL_MIN_OFFSET,
          Math.min(panelMaxOffsetRef.current, lastY.current + gesture.dy)
        );
        if (nextY < panelMaxOffsetRef.current) {
          setIsMapPanelOpen(true);
        }
        translateY.setValue(nextY - lastY.current);
      },

      onPanResponderRelease: (_, gesture) => {
        translateY.flattenOffset();

        const rawFinalY = Math.max(
          PANEL_MIN_OFFSET,
          Math.min(panelMaxOffsetRef.current, lastY.current + gesture.dy)
        );
        const projectedY = rawFinalY + Math.max(-44, Math.min(44, gesture.vy * 18));
        const finalY = getNearestSnapPoint(projectedY, panelSnapPointsRef.current);

        lastY.current = finalY;
        if (isNavigationPanelActiveRef.current) {
          lastNavigationPanelY.current = finalY;
        }
        localPanelSnapRef.current = true;
        setPanelY(finalY);

        const willHide = finalY >= panelMaxOffsetRef.current;
        setIsPanelHidden(false);
        setIsMapPanelOpen(!willHide);
        Animated.spring(translateY, {
          toValue: finalY,
          stiffness: 220,
          damping: 30,
          mass: 0.72,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && finalY >= panelMaxOffsetRef.current) {
            setIsPanelHidden(true);
            setIsMapPanelOpen(false);
          }
        });
      },

      onPanResponderTerminate: () => {
        translateY.flattenOffset();
        translateY.setValue(lastY.current);
        if (isNavigationPanelActiveRef.current) {
          lastNavigationPanelY.current = lastY.current;
        }
        setPanelY(lastY.current);
        const hidden = lastY.current >= panelMaxOffsetRef.current;
        setIsPanelHidden(hidden);
        setIsMapPanelOpen(!hidden);
      },
    })
  ).current;

  const selectEvac = (place) => {
    const normalizedPlace = normalizePlace(place);
    setEvac(normalizedPlace);
    setPanelState("PLACE_INFO");
    setPanelY(null);
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
  };

  const requestRoutes = () => {
    if (!evac) return;
    setIsNavigating(false);
    setFollowMode(false);
    setPanelState("ROUTE_SELECTION");
    setPanelY(300);
    lastY.current = 300;
    translateY.setValue(300);
    setRouteRequested(true);
  };

  const changeMode = (mode) => {
    setTravelMode(mode);
    if (!evac) return;
    setRouteRequested(false);
    setRoutes([]);
    setActiveRoute(null);
    setTimeout(() => setRouteRequested(true), 0);
  };

  const startNavigation = () => {
    if (!evac || !selectedRoute?.coords?.length) return;

    const { heading, nextPoint, snappedLocation } = startNavigationCamera(
      selectedRoute,
      routeStartCoordinate
    );

    setActiveRoute(selectedRoute);
    setCurrentLocation(snappedLocation || routeStartCoordinate);
    setNextRoutePoint(nextPoint);
    setCurrentHeading(heading);
    setIsNavigating(true);
    setFollowMode(true);
    setPanelState("NAVIGATION");
    const nextPanelY = Math.max(
      PANEL_MIN_OFFSET,
      Math.min(NAV_PANEL_MAX_OFFSET, lastNavigationPanelY.current)
    );
    setPanelY(nextPanelY);
    lastY.current = nextPanelY;
    translateY.setValue(nextPanelY);
  };

  const performStopNavigation = () => {
    setShowStopConfirm(false);
    exitNavigationMode();
    setPanelY(300);
    lastY.current = 300;
    translateY.setValue(300);
  };

  const requestStopNavigation = () => {
    setShowStopConfirm(true);
  };

  const renderEvacCard = (place) => {
    const statusMeta = getEvacStatusCopy(place.capacityStatus);
    const totalCapacity = Number(place.totalCapacity ?? place.capacityIndividual ?? 0);
    const currentOccupants = Number(place.currentOccupants || 0);
    const availableSlots = Number(
      place.availableSlots ?? Math.max(0, totalCapacity - currentOccupants)
    );
    const occupancyPercentage = Number(
      place.occupancyPercentage ??
        (totalCapacity ? Math.round((currentOccupants / totalCapacity) * 100) : 0)
    );
    return (
      <TouchableOpacity
        key={place?._id || `${place?.latitude}-${place?.longitude}`}
        style={[
          styles.evacCard,
          themedOverlay.card,
          place.isRecommended && styles.evacCardRecommended,
          place.isRecommended && themedOverlay.recommendedCard,
        ]}
        onPress={() => selectEvac(place)}
      >
        <View
          style={[
            styles.evacIconBadge,
            { backgroundColor: `${getEvacStatusColor(place.capacityStatus)}18` },
          ]}
        >
          <Text
            style={[
              styles.evacIconText,
              { color: getEvacStatusColor(place.capacityStatus) },
            ]}
          >
            E
          </Text>
        </View>
        <View style={styles.evacCardText}>
          <Text style={[styles.evacName, themedOverlay.text]} numberOfLines={1}>
            {safeDisplayText(place?.name, "Evacuation center")}
          </Text>
          <Text style={[styles.evacMeta, themedOverlay.subtext]} numberOfLines={1}>
            {place.barangayName || place.location || "Evacuation center"}
          </Text>
          <Text style={[styles.evacMeta, themedOverlay.subtext]} numberOfLines={1}>
            {currentOccupants}/{totalCapacity} occupants | {availableSlots} slots | {occupancyPercentage}%
          </Text>
          <View style={styles.recommendationBadgeRow}>
            {place.isRecommended ? (
              <Text style={[styles.recommendationBadge, styles.recommendationBadgePrimary]}>
                Recommended
              </Text>
            ) : null}
            <Text
              style={[
                styles.recommendationBadge,
                place.isRecommended
                  ? [styles.recommendationBadgeBarangay, themedOverlay.badge]
                  : [styles.recommendationBadgeNeutral, themedOverlay.badge],
              ]}
              numberOfLines={1}
            >
              {place.recommendationScopeLabel ||
                place.recommendationBadge ||
                "Other Evacuation Center"}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusChip,
            {
              backgroundColor: statusMeta.tint,
              borderColor: statusMeta.border,
            },
          ]}
        >
          <Text style={[styles.statusChipText, { color: statusMeta.text }]}>
            {statusMeta.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.panelWrap}
    >
      <Animated.View
        pointerEvents={isPanelHidden ? "none" : "auto"}
        style={[
          styles.panel,
          themedOverlay.panel,
          activeModule === "evac" && isNavigating && styles.navigationPanelSurface,
          activeModule === "evac" && isNavigating && themedOverlay.navigationPanel,
          { transform: [{ translateY }] },
        ]}
      >
        {activeModule === "evac" && isNavigating && (
          <View style={styles.navigationFloatingControls} pointerEvents="box-none">
            <TouchableOpacity
              style={[
                styles.navigationFloatingButton,
                themedOverlay.floatingButton,
                styles.navigationFloatingReportButton,
              ]}
              activeOpacity={0.88}
              onPress={openQuickIncidentReport}
              hitSlop={8}
            >
              <Ionicons name="warning-outline" size={22} color="#7F1D1D" />
              <Text style={styles.navigationFloatingReportText}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navigationFloatingButton, themedOverlay.floatingButton]}
              activeOpacity={0.86}
              onPress={recenterNavigationCamera}
              hitSlop={8}
            >
              <Ionicons
                name={followMode ? "locate" : "locate-outline"}
                size={23}
                color={theme.primary}
              />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.dragZone}>
          <View style={styles.dragHandleTouchTarget} {...panResponder.panHandlers}>
            <View style={[styles.handle, themedOverlay.handle]} />
          </View>
        </View>
{activeModule === "incident" && (
  <ScrollView
    ref={formScrollRef}
    style={styles.panelScroll}
    showsVerticalScrollIndicator={false}
    nestedScrollEnabled
    directionalLockEnabled
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="none"
    stickyHeaderIndices={[0]}
    contentContainerStyle={styles.incidentFormScrollContent}
  >
    <PanelHeader
      theme={theme}
      themedOverlay={themedOverlay}
      title={selectedBarangay ? selectedBarangay.label : "Incident Reporting"}
      meta={
        selectedBarangay
          ? `${incidentCount} reports in this barangay${
              incidentTopType ? ` | Most reported: ${incidentTopType}` : ""
            }`
          : `${incidentCount} active reports visible`
      }
      onBack={handlePanelBack}
    />

    <View style={[styles.incidentToggleCard, themedOverlay.card]}>
      <View style={styles.incidentToggleHeader}>
        <View>
          <Text style={[styles.incidentToggleEyebrow, themedOverlay.subtext]}>Incident workspace</Text>
          <Text style={[styles.incidentToggleTitle, themedOverlay.text]}>Choose what you want to do</Text>
        </View>
      </View>

      <View style={styles.incidentToggleRow}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[
            styles.incidentToggleBtn,
            incidentPanelTab === "report" && styles.incidentToggleBtnActive,
          ]}
          onPress={() => setIncidentPanelTab("report")}
        >
          <Ionicons name="create-outline" size={18} color={incidentPanelTab === "report" ? "#FFFFFF" : "#14532D"} />
          <Text style={[styles.incidentToggleText, incidentPanelTab === "report" && styles.incidentToggleTextActive]}>Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.88}
          style={[
            styles.incidentToggleBtn,
            incidentPanelTab === "reports" && styles.incidentToggleBtnActive,
          ]}
          onPress={() => setIncidentPanelTab("reports")}
        >
          <Ionicons name="list-outline" size={18} color={incidentPanelTab === "reports" ? "#FFFFFF" : "#14532D"} />
          <Text style={[styles.incidentToggleText, incidentPanelTab === "reports" && styles.incidentToggleTextActive]}>Reports</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.88}
          style={[
            styles.incidentToggleBtn,
            incidentPanelTab === "map" && styles.incidentToggleBtnActive,
          ]}
          onPress={() => setIncidentPanelTab("map")}
        >
          <Ionicons name="map-outline" size={18} color={incidentPanelTab === "map" ? "#FFFFFF" : "#14532D"} />
          <Text style={[styles.incidentToggleText, incidentPanelTab === "map" && styles.incidentToggleTextActive]}>Map</Text>
        </TouchableOpacity>
      </View>
    </View>

    <TouchableOpacity
      activeOpacity={0.88}
      style={[
        styles.debugStatusCard,
        themedOverlay.softCard,
        incidentDebugMode && styles.debugStatusCardActive,
      ]}
      onPress={() => setIncidentDebugMode((value) => !value)}
    >
      <Ionicons
        name={incidentDebugMode ? "bug" : "bug-outline"}
        size={18}
        color={incidentDebugMode ? "#FFFFFF" : "#14532D"}
      />
      <Text
        style={[
          styles.debugStatusText,
          themedOverlay.primaryText,
          incidentDebugMode && styles.debugStatusTextActive,
        ]}
      >
        {incidentDebugMode
          ? "Debug Mode ON: map test location enabled."
          : "Debug Mode OFF: using your real phone location."}
      </Text>
    </TouchableOpacity>

    {incidentPanelTab === "report" && (
      <>
        <View style={[styles.panelSection, themedOverlay.section]}>
          <View style={styles.incidentBarangayHeader}>
            <View style={styles.incidentBarangayIcon}>
              <Ionicons name="location-outline" size={17} color="#14532D" />
            </View>
            <View style={styles.incidentBarangayCopy}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Location setup</Text>
              <Text style={[styles.panelNote, themedOverlay.subtext]}>
                {selectedBarangay
                  ? "The selected barangay is already applied to this report."
                  : "Tap a barangay outline on the map or select a district and barangay below."}
              </Text>
            </View>
          </View>

          {selectedBarangay && (
            <TouchableOpacity style={styles.clearBarangayBtn} onPress={onClearSelectedBarangay}>
              <Text style={styles.clearBarangayText}>Clear selected barangay</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.panelSection}>
          <Text style={styles.sectionLabel}>Incident type</Text>
          <Picker selectedValue={incidentDraft.type} onValueChange={(value) => setIncidentDraft((prev) => ({ ...prev, type: value }))} style={styles.picker}>
            <Picker.Item label="Select incident type" value="" />
            <Picker.Item label="Flood" value="flood" />
            <Picker.Item label="Typhoon" value="typhoon" />
            <Picker.Item label="Fire" value="fire" />
            <Picker.Item label="Earthquake" value="earthquake" />
          </Picker>
          {!!incidentErrors?.type && <Text style={styles.validationText}>{incidentErrors.type}</Text>}

          <Text style={styles.label}>Severity</Text>
          <Picker selectedValue={incidentDraft.level} onValueChange={(value) => setIncidentDraft((prev) => ({ ...prev, level: value }))} style={styles.picker}>
            <Picker.Item label="Select severity" value="" />
            <Picker.Item label="Low" value="low" />
            <Picker.Item label="Medium" value="medium" />
            <Picker.Item label="High" value="high" />
            <Picker.Item label="Critical" value="critical" />
          </Picker>
          {!!incidentErrors?.level && <Text style={styles.validationText}>{incidentErrors.level}</Text>}
        </View>

        <View
          style={styles.panelSection}
          onLayout={(event) => {
            inputY.current.addressSection = event.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.sectionLabel}>Address</Text>

          <Text style={styles.label}>District</Text>
          <View style={styles.input}>
            <Picker
              selectedValue={incidentDraft.district}
              onValueChange={(value) =>
                setIncidentDraft((prev) => ({
                  ...prev,
                  district: value,
                  barangay:
                    value &&
                    findOptionByNormalized(
                      getDistrictBarangayOptions(value),
                      prev.barangay,
                      normalizeBarangayName
                    )
                      ? prev.barangay
                      : "",
                }))
              }
              style={{ color: incidentDraft.district ? "#10251B" : "#94A3B8" }}
            >
              <Picker.Item label="Select district" value="" />
              {getPickerOptionsWithCurrent(
                DISTRICT_OPTIONS,
                incidentDraft.district,
                normalizeDistrictName
              ).map((item) => <Picker.Item key={item} label={item} value={item} />)}
            </Picker>
          </View>
          {!!incidentErrors?.district && <Text style={styles.validationText}>{incidentErrors.district}</Text>}

          <Text style={styles.label}>Barangay</Text>
          <View style={styles.input}>
            <Picker
              selectedValue={incidentDraft.barangay}
              enabled={Boolean(incidentDraft.district || incidentDraft.barangay)}
              onValueChange={(value) => {
                setIncidentDraft((prev) => ({
                  ...prev,
                  barangay: value,
                  district: prev.district || getDistrictFromBarangay(value),
                }));
                const matchedBarangay = homepageBarangays.find(
                  (item) =>
                    normalizeBarangayName(
                      getFeatureBarangayName(item?.feature) || item?.label
                    ) === normalizeBarangayName(value)
                );
                if (matchedBarangay) handleSelectBarangay(matchedBarangay);
              }}
              style={{ color: incidentDraft.barangay ? "#10251B" : "#94A3B8", opacity: incidentDraft.district || incidentDraft.barangay ? 1 : 0.6 }}
            >
              <Picker.Item label={incidentDraft.district || incidentDraft.barangay ? "Select barangay" : "Select district first"} value="" />
              {getPickerOptionsWithCurrent(
                getDistrictBarangayOptions(incidentDraft.district),
                incidentDraft.barangay,
                normalizeBarangayName
              ).map((item) => <Picker.Item key={item} label={item} value={item} />)}
            </Picker>
          </View>
          {!!incidentErrors?.barangay && <Text style={styles.validationText}>{incidentErrors.barangay}</Text>}

          <Text style={styles.label}>Street / Landmark / Details</Text>
          <TextInput
            style={[styles.input, styles.locationInput]}
            placeholder="House no., street, purok, landmark"
            value={incidentDraft.street}
            onFocus={() => focusIncidentField("street")}
            onBlur={() => blurIncidentField("street")}
            onLayout={(event) => {
              inputY.current.street = event.nativeEvent.layout.y;
            }}
            onChangeText={(value) => setIncidentDraft((prev) => ({ ...prev, street: sanitizeStreetDetails(value) }))}
            maxLength={160}
          />
          {!!incidentErrors?.street && <Text style={styles.validationText}>{incidentErrors.street}</Text>}

          <TouchableOpacity style={[styles.locationActionBtn, incidentLocating && styles.disabledBtn]} disabled={incidentLocating} onPress={useCurrentIncidentLocation}>
            <Ionicons name="navigate-outline" size={15} color="#14532D" />
            <Text style={styles.locationActionText}>{incidentLocating ? "Getting location..." : "Use My Current Location"}</Text>
          </TouchableOpacity>

          <Text style={styles.locationStatusText}>
            {selectedIncidentCoordinate
              ? incidentDebugMode
                ? "Debug map point set for this report."
                : "Phone location set for this report."
              : incidentDebugMode
                ? "No map point yet. Tap the map or use current location."
                : "No phone location yet. Use current location to report."}
          </Text>
          {!!incidentErrors?.location && <Text style={styles.validationText}>{incidentErrors.location}</Text>}

          <View style={styles.addressPreviewCard}>
            <Text style={styles.addressPreviewLabel}>Full Address Preview</Text>
            <Text style={styles.addressPreviewText}>
              {buildIncidentAddress({
                district: incidentDraft.district,
                barangay: incidentDraft.barangay,
                street: incidentDraft.street,
                location: incidentDraft.location,
              }) || "No incident address set yet"}
            </Text>
          </View>
        </View>

        <View
          style={styles.panelSection}
          onLayout={(event) => {
            inputY.current.notesSection = event.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.sectionLabel}>Notes and proof</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe what happened"
            multiline
            value={incidentDraft.description}
            onFocus={() => focusIncidentField("description")}
            onBlur={() => blurIncidentField("description")}
            onLayout={(event) => {
              inputY.current.description = event.nativeEvent.layout.y;
            }}
            onChangeText={(value) => setIncidentDraft((prev) => ({ ...prev, description: sanitizeFreeTextInput(value, INCIDENT_DESCRIPTION_MAX_LENGTH) }))}
            maxLength={INCIDENT_DESCRIPTION_MAX_LENGTH}
          />
          {!!incidentErrors?.description && <Text style={styles.validationText}>{incidentErrors.description}</Text>}

          <View style={styles.photoActionRow}>
            <TouchableOpacity style={styles.photoActionBtn} onPress={pickIncidentImage}>
              <Ionicons name="images-outline" size={16} color="#14532D" />
              <Text style={styles.photoActionText}>Upload Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.photoActionBtn,
                getIncidentImageItems(incidentImage).length >= INCIDENT_IMAGE_LIMIT && styles.disabledBtn,
              ]}
              disabled={getIncidentImageItems(incidentImage).length >= INCIDENT_IMAGE_LIMIT}
              onPress={takeIncidentPhoto}
            >
              <Ionicons name="camera-outline" size={16} color="#14532D" />
              <Text style={styles.photoActionText}>Take Photo</Text>
            </TouchableOpacity>
          </View>

          {getIncidentImageItems(incidentImage).length > 0 && (
            <View style={styles.photoPreviewRow}>
              {getIncidentImageItems(incidentImage).map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.photoPreviewWrap}>
                  <Image source={{ uri: item.uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={() => removeIncidentImage(item.uri)}
                  >
                    <Ionicons name="close" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {!!(incidentImageError || incidentErrors?.image) && (
            <Text style={styles.validationText}>{incidentImageError || incidentErrors.image}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            incidentBusy && styles.disabledBtn,
          ]}
          disabled={incidentBusy}
          onPress={submitIncident}
        >
          <Text style={styles.primaryText}>{incidentBusy ? "Submitting..." : "Submit incident"}</Text>
        </TouchableOpacity>
      </>
    )}

    {incidentPanelTab === "reports" && (
      <View style={styles.panelSection}>
        <View style={styles.incidentBarangayHeader}>
          <View style={styles.incidentBarangayIcon}>
            <Ionicons name="newspaper-outline" size={17} color="#14532D" />
          </View>
          <View style={styles.incidentBarangayCopy}>
            <Text style={styles.sectionLabel}>{selectedBarangay ? "Reports in barangay" : "Recent reports"}</Text>
            <Text style={styles.panelNote}>{selectedBarangay ? "Only reports inside the selected barangay are shown." : "Showing the latest visible incident reports. Tap a report to center its marker."}</Text>
          </View>
        </View>

        {safeArray(incidents).length === 0 ? (
          <View style={styles.emptyIncidentState}>
            <Ionicons name="checkmark-circle-outline" size={24} color="#14532D" />
            <Text style={styles.emptyIncidentTitle}>No incidents found</Text>
            <Text style={styles.emptyIncidentText}>{selectedBarangay ? "There are no reports inside this barangay right now." : "No incident reports are currently visible."}</Text>
          </View>
        ) : (
          safeArray(incidents).slice(0, 6).map((incident) => (
            <IncidentListItem
              key={incident?._id || `${incident.latitude}-${incident.longitude}`}
              incident={incident}
              onPress={() => onIncidentPress?.(incident)}
            />
          ))
        )}
      </View>
    )}

    {incidentPanelTab === "map" && (
      <>
        <View style={styles.panelSection}>
          <View style={styles.incidentBarangayHeader}>
            <View style={styles.incidentBarangayIcon}>
              <Ionicons name="map-outline" size={17} color="#14532D" />
            </View>
            <View style={styles.incidentBarangayCopy}>
              <Text style={styles.sectionLabel}>Barangay map view</Text>
              <Text style={styles.panelNote}>{selectedBarangay ? "The map is focused on the selected barangay." : "Tap a barangay outline or label to focus the report view."}</Text>
            </View>
          </View>
          {selectedBarangay && (
            <TouchableOpacity style={styles.clearBarangayBtn} onPress={onClearSelectedBarangay}>
              <Text style={styles.clearBarangayText}>Show all barangays</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.panelSection}>
          <Text style={styles.sectionLabel}>Map visibility</Text>
          <View style={styles.mapToggleGrid}>
            <TouchableOpacity activeOpacity={0.88} style={[styles.mapToggleBtn, showBarangayMarkers && styles.mapToggleBtnActive]} onPress={() => setShowBarangayMarkers((prev) => !prev)}>
              <Ionicons name="pricetag-outline" size={17} color={showBarangayMarkers ? "#FFFFFF" : "#14532D"} />
              <Text style={[styles.mapToggleText, showBarangayMarkers && styles.mapToggleTextActive]}>Barangay Labels</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.88} style={[styles.mapToggleBtn, showIncidentMarkers && styles.mapToggleBtnActive]} onPress={() => setShowIncidentMarkers((prev) => !prev)}>
              <Ionicons name="warning-outline" size={17} color={showIncidentMarkers ? "#FFFFFF" : "#14532D"} />
              <Text style={[styles.mapToggleText, showIncidentMarkers && styles.mapToggleTextActive]}>Incident Pins</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.panelNote}>These controls only affect Incident Reporting. Evac Places keeps incident pins hidden.</Text>
        </View>
      </>
    )}
  </ScrollView>
)}

        {activeModule === "flood" && (
          <ScrollView
            style={styles.panelScroll}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="always"
          >
            <PanelHeader
              theme={theme}
              themedOverlay={themedOverlay}
              title="Flood Map"
              meta="Flood hazard overlay active"
              onBack={handlePanelBack}
            />
            <View style={[styles.panelSection, themedOverlay.section]}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Visible layers</Text>
              <LegendRow color="#065F46" label="Municipal boundary" />
              <Text style={[styles.panelNote, themedOverlay.subtext]}>
                Flood layers are isolated from incidents and routes to keep the
                hazard view readable.
              </Text>
            </View>

            <View style={[styles.panelSection, themedOverlay.section]}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Flood level legend</Text>
              <View style={styles.floodLegendGrid}>
                {FLOOD_LEGEND_ITEMS.map((item) => (
                  <View key={item.key} style={styles.floodLegendItem}>
                    <View
                      style={[
                        styles.floodLegendSwatch,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.floodLegendText}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.panelNote, themedOverlay.subtext]}>
                Legend colors match the current flood overlay palette used on the map.
              </Text>
            </View>
          </ScrollView>
        )}

        {activeModule === "earthquake" && (
          <ScrollView
            style={styles.panelScroll}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
          >
            <PanelHeader
              theme={theme}
              themedOverlay={themedOverlay}
              title="Earthquake Map"
              meta="Earthquake hazard overlay active"
              onBack={handlePanelBack}
            />
            <View style={[styles.panelSection, themedOverlay.section]}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Risk overlay</Text>
              <LegendRow color="#dc2626" label="High-risk earthquake zone" />
              <LegendRow color="#065F46" label="Municipal boundary" />
              <Text style={[styles.panelNote, themedOverlay.subtext]}>
                Use this view for risk review. Route, report, and barangay
                layers stay hidden unless their module is selected.
              </Text>
            </View>
          </ScrollView>
        )}

        {activeModule === "barangay" && (
          <ScrollView
            style={styles.panelScroll}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
          >
            <PanelHeader
              theme={theme}
              themedOverlay={themedOverlay}
              title="Barangay Map"
              meta={`${barangayCount} barangay boundary records loaded`}
              onBack={handlePanelBack}
            />
            <View style={[styles.panelSection, themedOverlay.section]}>
              <View style={styles.barangayFilterHeader}>
                <View style={styles.barangayFilterTitleBlock}>
                  <Text style={[styles.sectionLabel, themedOverlay.text]}>Barangay visibility</Text>
                  <Text style={[styles.panelNote, themedOverlay.subtext]}>
                    Show all barangays by default, or choose specific barangays to focus.
                  </Text>
                </View>
                {barangaySpecificMode && (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    style={styles.barangayClearChip}
                    onPress={() => {
                      onClearBarangayVisibilityFilter?.();
                      setBarangaySpecificMode?.(false);
                      setBarangayFilterOpen(false);
                    }}
                  >
                    <Text style={styles.barangayClearChipText}>Show all</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.barangayFilterButton}
                onPress={() => {
                  setBarangayFilterOpen((prev) => {
                    const nextOpen = !prev;
                    setBarangaySpecificMode?.(
                      nextOpen || (selectedBarangayIds || []).length > 0
                    );
                    return nextOpen;
                  });
                }}
              >
                <View style={styles.barangayFilterButtonIcon}>
                  <Ionicons name="layers-outline" size={18} color="#14532D" />
                </View>
                <View style={styles.barangayFilterButtonCopy}>
                  <Text style={styles.barangayFilterButtonTitle}>
                    {barangaySpecificMode
                      ? (selectedBarangayIds || []).length
                        ? `${selectedBarangayIds.length} selected`
                        : "Choose specific barangays"
                      : "Show all barangays"}
                  </Text>
                  <Text style={styles.barangayFilterButtonMeta}>
                    {barangaySpecificMode
                      ? "Unselected areas become muted"
                      : "Tap to choose specific barangays"}
                  </Text>
                </View>
                <Ionicons
                  name={barangayFilterOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#14532D"
                />
              </TouchableOpacity>

              {barangayFilterOpen && (
                <View style={styles.barangayChoiceGrid}>
                  {homepageBarangays.map((barangay) => {
                    const active = selectedBarangayIdSetForPanel.has(barangay.id);

                    return (
                      <TouchableOpacity
                        key={`barangay-choice-${barangay.id}`}
                        activeOpacity={0.86}
                        style={[
                          styles.barangayChoiceChip,
                          active && {
                            backgroundColor: "#FFFFFF",
                            borderColor: barangay.color,
                            borderWidth: 2,
                          },
                        ]}
                        onPress={() => onToggleBarangayVisibility(barangay.id)}
                      >
                        <View
                          style={[
                            styles.barangayChoiceDot,
                            { backgroundColor: barangay.color },
                          ]}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.barangayChoiceText,
                            active && { color: "#10251B" },
                          ]}
                        >
                          {barangay.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}


              <View style={styles.incidentToggleRow}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.mapToggleBtn, showBarangayMarkers && styles.mapToggleBtnActive]}
                  onPress={() => setShowBarangayMarkers((prev) => !prev)}
                >
                  <Ionicons name="pricetag-outline" size={17} color={showBarangayMarkers ? "#FFFFFF" : "#14532D"} />
                  <Text style={[styles.mapToggleText, showBarangayMarkers && styles.mapToggleTextActive]}>Barangay Labels</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.mapToggleBtn, showIncidentMarkers && styles.mapToggleBtnActive]}
                  onPress={() => setShowIncidentMarkers((prev) => !prev)}
                >
                  <Ionicons name="warning-outline" size={17} color={showIncidentMarkers ? "#FFFFFF" : "#14532D"} />
                  <Text style={[styles.mapToggleText, showIncidentMarkers && styles.mapToggleTextActive]}>Incident Pins</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.panelSection, themedOverlay.section]}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Map style</Text>
              <LegendRow color={homepageBarangays[0]?.color || "#22C55E"} label="All barangays use their assigned colors by default" />
              <LegendRow color="rgba(15, 23, 42, 0.34)" label="Specific mode mutes unselected barangays" />
              <Text style={[styles.panelNote, themedOverlay.subtext]}>
                Show all keeps the entire Jaen map visible. Specific selection focuses only the chosen barangays.
              </Text>
            </View>
          </ScrollView>
        )}

        {activeModule === "evac" && (
          <ScrollView
            style={styles.panelScroll}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={!isNavigating ? [0] : undefined}
            nestedScrollEnabled
            directionalLockEnabled
            keyboardShouldPersistTaps="always"
          >
            {!isNavigating && (
              <PanelHeader
                theme={theme}
                themedOverlay={themedOverlay}
                title="Evac Place"
                meta="Evacuation centers and dynamic pathfinding"
                onBack={handlePanelBack}
              />
            )}

            {isNavigating && (
              <View style={styles.wazeBottomPanel}>
                <View style={styles.wazeBottomStats}>
                  <View style={[styles.wazeBottomStat, styles.wazeBottomStatPrimary, themedOverlay.card]}>
                    <Ionicons name="time-outline" size={16} color={theme.primary} />
                    <Text style={[styles.wazeBottomValue, themedOverlay.text]}>{routeETA}</Text>
                    <Text style={[styles.wazeBottomLabel, themedOverlay.subtext]}>ETA</Text>
                  </View>

                  <View style={[styles.wazeBottomStat, themedOverlay.card]}>
                    <Ionicons name="map-outline" size={16} color={theme.primary} />
                    <Text style={[styles.wazeBottomValue, themedOverlay.text]}>{routeDistance}</Text>
                    <Text style={[styles.wazeBottomLabel, themedOverlay.subtext]}>How far</Text>
                  </View>

                  <View style={[styles.wazeBottomStat, themedOverlay.card]}>
                    <Ionicons name={travelMode === "walking" ? "walk-outline" : travelMode === "cycling" ? "speedometer-outline" : "speedometer-outline"} size={16} color={theme.primary} />
                    <Text style={[styles.wazeBottomValue, themedOverlay.text]}>
                      {["driving", "cycling"].includes(travelMode)
                        ? `${Math.max(0, Math.round(currentSpeedKmh || 0))} km/h`
                        : navigationTopSummary.travelModeLabel}
                    </Text>
                    <Text style={[styles.wazeBottomLabel, themedOverlay.subtext]}>
                      {["driving", "cycling"].includes(travelMode) ? "Speed" : "Mode"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.wazeStopBtn}
                  activeOpacity={0.72}
                  onPress={requestStopNavigation}
                  delayPressIn={0}
                  hitSlop={{ top: 10, right: 10, bottom: 12, left: 10 }}
                  pressRetentionOffset={{ top: 24, right: 24, bottom: 24, left: 24 }}
                  accessibilityRole="button"
                  accessibilityLabel="Stop navigation"
                >
                  <Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.wazeStopText}>Stop navigation</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isNavigating && (
              <>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.debugStatusCard,
                themedOverlay.softCard,
                evacGpsDebugMode && styles.debugStatusCardActive,
                evacGpsLocating && styles.debugStatusCardDisabled,
              ]}
              disabled={evacGpsLocating}
              onPress={() => {
                if (!evacGpsDebugMode && Platform.OS === "web") {
                  Alert.alert(
                    "GPS Unavailable",
                    "Phone GPS is not available in this app view."
                  );
                  return;
                }

                setEvacGpsDebugMode((value) => !value);
              }}
            >
              <Ionicons
                name={evacGpsDebugMode ? "navigate" : "navigate-outline"}
                size={18}
                color={evacGpsDebugMode ? "#FFFFFF" : theme.primary}
              />
              <Text
                style={[
                  styles.debugStatusText,
                  themedOverlay.primaryText,
                  evacGpsDebugMode && styles.debugStatusTextActive,
                ]}
              >
                {evacGpsDebugMode
                  ? "GPS Debug ON: using actual phone location."
                  : "GPS Debug OFF: using demo location for Evac Place."}
              </Text>
            </TouchableOpacity>

            <View style={[styles.panelSection, themedOverlay.section]}>
              <Text style={[styles.sectionLabel, themedOverlay.text]}>Availability overview</Text>
              <View style={styles.statusSummaryRow}>
                {evacStatusSummary.map((item) => {
                  const statusMeta = getEvacStatusCopy(item.key);
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.statusSummaryCard,
                        {
                          backgroundColor: statusMeta.tint,
                          borderColor: statusMeta.border,
                        },
                      ]}
                    >
                      <View style={styles.statusSummaryValueRow}>
                        <View
                          style={[
                            styles.statusSummaryDot,
                            { backgroundColor: getEvacStatusColor(item.key) },
                          ]}
                        />
                        <Text style={[styles.statusSummaryValue, { color: statusMeta.text }]}>
                          {item.count}
                        </Text>
                      </View>
                      <Text style={[styles.statusSummaryLabel, { color: statusMeta.text }]}>
                        {item.key}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {!evac && (
              <>
                <Text style={[styles.sectionLabel, themedOverlay.text]}>Evacuation places</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChipRow}
                >
                  {[
                    ["nearest", "Nearest"],
                    ["most-available", "Most available"],
                    ["full", "Full"],
                    ["has-space", "Has space"],
                    ["barangay", "By barangay"],
                  ].map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.filterChipButton,
                        themedOverlay.card,
                        evacFilter === key && styles.filterChipButtonActive,
                      ]}
                      onPress={() => setEvacFilter(key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          themedOverlay.primaryText,
                          evacFilter === key && styles.filterChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.listSection}>
                  {evacPlacesByStatus.limited.length > 0 && (
                    <View style={styles.evacSection}>
                      <Text style={[styles.evacSectionTitle, themedOverlay.subtext]}>Limited capacity</Text>
                      {evacPlacesByStatus.limited.map(renderEvacCard)}
                    </View>
                  )}

                  {evacPlacesByStatus.full.length > 0 && (
                    <View style={styles.evacSection}>
                      <Text style={[styles.evacSectionTitle, themedOverlay.subtext]}>Full capacity</Text>
                      {evacPlacesByStatus.full.map(renderEvacCard)}
                    </View>
                  )}

                  {evacPlacesByStatus.available.length > 0 && (
                    <View style={styles.evacSection}>
                      <Text style={[styles.evacSectionTitle, themedOverlay.subtext]}>Available</Text>
                      {evacPlacesByStatus.available.map(renderEvacCard)}
                    </View>
                  )}

                  {evacPlacesByStatus.other.length > 0 && (
                    <View style={styles.evacSection}>
                      <Text style={[styles.evacSectionTitle, themedOverlay.subtext]}>Other</Text>
                      {evacPlacesByStatus.other.map(renderEvacCard)}
                    </View>
                  )}
                </View>
              </>
            )}

            {evac && (
              <>
                <View
                  style={[
                    styles.selectedPlace,
                    {
                      borderColor: getEvacStatusCopy(evac.capacityStatus).border,
                      backgroundColor: getEvacStatusCopy(evac.capacityStatus).tint,
                    },
                    themedOverlay.selectedCard,
                  ]}
                >
                  <View style={styles.selectedHeader}>
                    <View
                      style={[
                        styles.evacIconBadgeLarge,
                        { backgroundColor: `${getEvacStatusColor(evac.capacityStatus)}18` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.evacIconText,
                          { color: getEvacStatusColor(evac.capacityStatus) },
                        ]}
                      >
                        E
                      </Text>
                    </View>
                    <View style={styles.evacCardText}>
                      <Text style={[styles.evacName, themedOverlay.text]}>
                        {safeDisplayText(evac?.name, "Evacuation center")}
                      </Text>
                      <Text style={[styles.evacMeta, themedOverlay.subtext]}>
                        {evac.barangayName || evac.location || "Selected evacuation place"}
                      </Text>
                      <View style={styles.recommendationBadgeRow}>
                        {evac.isRecommended ? (
                          <Text style={[styles.recommendationBadge, styles.recommendationBadgePrimary]}>
                            Recommended
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            styles.recommendationBadge,
                            evac.isRecommended
                              ? [styles.recommendationBadgeBarangay, themedOverlay.badge]
                              : [styles.recommendationBadgeNeutral, themedOverlay.badge],
                          ]}
                          numberOfLines={1}
                        >
                          {evac.recommendationScopeLabel ||
                            evac.recommendationBadge ||
                            "Other Evacuation Center"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      styles.selectedStatusChip,
                      {
                        backgroundColor: getEvacStatusCopy(evac.capacityStatus).tint,
                        borderColor: getEvacStatusCopy(evac.capacityStatus).border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: getEvacStatusCopy(evac.capacityStatus).text },
                      ]}
                    >
                      {getEvacStatusCopy(evac.capacityStatus).label}
                    </Text>
                  </View>
                  <View style={styles.warningChip}>
                    <Text style={styles.warningChipText}>
                      {Number(evac.currentOccupants || 0)}/
                      {Number(evac.totalCapacity ?? evac.capacityIndividual ?? 0)} occupants |{" "}
                      {Number(
                        evac.availableSlots ??
                          Math.max(
                            0,
                            Number(evac.capacityIndividual || 0) -
                              Number(evac.currentOccupants || 0)
                          )
                      )}{" "}
                      slots available |{" "}
                      {Number(
                        evac.occupancyPercentage ??
                          (evac.capacityIndividual
                            ? Math.round(
                                (Number(evac.currentOccupants || 0) /
                                  Number(evac.capacityIndividual || 1)) *
                                  100
                              )
                            : 0)
                      )}
                      %
                    </Text>
                  </View>
                </View>

                {panelState === "PLACE_INFO" && (
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.evacRouteAction, themedOverlay.card]}
                      onPress={() => selectEvac(null)}
                      activeOpacity={0.7}
                      delayPressIn={0}
                      hitSlop={{ top: 8, right: 5, bottom: 10, left: 8 }}
                      pressRetentionOffset={{ top: 24, right: 24, bottom: 24, left: 24 }}
                      accessibilityRole="button"
                      accessibilityLabel="Change evacuation place"
                    >
                      <Text style={[styles.secondaryText, themedOverlay.primaryText]}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.evacRouteAction]}
                      onPress={requestRoutes}
                      activeOpacity={0.7}
                      delayPressIn={0}
                      hitSlop={{ top: 8, right: 8, bottom: 10, left: 5 }}
                      pressRetentionOffset={{ top: 24, right: 24, bottom: 24, left: 24 }}
                      accessibilityRole="button"
                      accessibilityLabel="Find route"
                    >
                      <Text style={styles.primaryText}>Find route</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {panelState === "ROUTE_SELECTION" && (
                  <>
                    <Text style={[styles.sectionLabel, themedOverlay.text]}>Travel mode</Text>
                    <View style={styles.modeRow}>
                      {["walking", "cycling", "driving"].map((mode) => {
                        const active = travelMode === mode;
                        return (
                          <TouchableOpacity
                            key={mode}
                            style={[styles.modeBtn, themedOverlay.card, active && styles.modeBtnActive]}
                            onPress={() => changeMode(mode)}
                          >
                            <Text
                              style={[
                                styles.modeText,
                                active && styles.modeTextActive,
                              ]}
                            >
                              {mode}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {routes.length === 0 ? (
                      <View style={[styles.loadingCard, themedOverlay.card]}>
                        <Text style={[styles.panelNote, themedOverlay.subtext]}>Finding available routes...</Text>
                      </View>
                    ) : (
                      routes.map((route, index) => (
                        <TouchableOpacity
                          key={route.id ?? index}
                          style={[
                            styles.routeCard,
                            themedOverlay.card,
                            route.isRecommended && styles.routeRecommended,
                          ]}
                          onPress={() => setActiveRoute(route)}
                        >
                          <Text style={[styles.routeMain, themedOverlay.text]}>
                            {route.summary.displayTime} - {route.summary.km} km
                          </Text>
                          <Text style={[styles.evacMeta, themedOverlay.subtext]}>
                            {route.isRecommended
                              ? "Recommended route"
                              : "Alternate route"}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}

                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={[styles.secondaryBtn, themedOverlay.card]}
                        onPress={() => setPanelState("PLACE_INFO")}
                      >
                        <Text style={[styles.secondaryText, themedOverlay.primaryText]}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.primaryBtn}
                        disabled={!routes.length}
                        onPress={startNavigation}
                      >
                        <Text style={styles.primaryText}>Go now</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {panelState === "NAVIGATION" && (
                  <>
                    <View style={styles.navigationCompactCard}>
                      <View style={styles.navigationMetricRow}>
                        <View style={styles.navigationMetricBox}>
                          <Text style={styles.navigationMetricValue}>
                            {routeSummary ? `${routeSummary.km} km` : "--"}
                          </Text>
                          <Text style={styles.navigationMetricLabel}>Distance left</Text>
                        </View>

                        <View style={styles.navigationMetricBox}>
                          <Text style={styles.navigationMetricValue}>
                            {["driving", "cycling"].includes(travelMode)
                              ? `${Math.max(0, Math.round(currentSpeedKmh || 0))} km/h`
                              : routeSummary
                                ? `${Math.max(1, Math.round(Number(routeSummary.km || 0) * 1300))}`
                                : "--"}
                          </Text>
                          <Text style={styles.navigationMetricLabel}>
                            {["driving", "cycling"].includes(travelMode) ? "Speed" : "Est. steps"}
                          </Text>
                        </View>

                        <View style={styles.navigationMetricBox}>
                          <Text style={styles.navigationMetricValue}>
                            {routeSummary?.displayTime || "--"}
                          </Text>
                          <Text style={styles.navigationMetricLabel}>Time</Text>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity style={styles.dangerBtn} onPress={requestStopNavigation}>
                      <Text style={styles.dangerText}>Stop navigation</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
              </>
            )}
          </ScrollView>
        )}

        <QuickIncidentReportModal
          visible={quickReportVisible}
          incidentDraft={incidentDraft}
          setIncidentDraft={setIncidentDraft}
          incidentImage={incidentImage}
          incidentImageError={incidentImageError}
          incidentErrors={incidentErrors}
          pickIncidentImage={pickIncidentImage}
          takeIncidentPhoto={takeIncidentPhoto}
          removeIncidentImage={removeIncidentImage}
          submitIncident={submitIncident}
          incidentBusy={incidentBusy}
          onClose={() => setQuickReportVisible(false)}
        />

        <Modal
          visible={showStopConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStopConfirm(false)}
        >
          <View style={styles.stopModalBackdrop}>
            <View style={[styles.stopModalCard, themedOverlay.modal]}>
              <View style={styles.stopModalIcon}>
                <Ionicons name="stop-circle-outline" size={28} color="#DC2626" />
              </View>
              <Text style={[styles.stopModalTitle, themedOverlay.text]}>Stop Navigation?</Text>
              <Text style={[styles.stopModalMessage, themedOverlay.subtext]}>
                Do you want to stop navigation?
              </Text>

              <View style={styles.stopModalActions}>
                <TouchableOpacity
                  style={[styles.stopModalNoBtn, themedOverlay.card]}
                  activeOpacity={0.88}
                  onPress={() => setShowStopConfirm(false)}
                  hitSlop={8}
                >
                  <Text style={[styles.stopModalNoText, themedOverlay.text]}>No</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.stopModalYesBtn}
                  activeOpacity={0.88}
                  onPress={performStopNavigation}
                  hitSlop={8}
                >
                  <Text style={styles.stopModalYesText}>Yes, Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function PanelHeader({ title, meta, onBack, theme, themedOverlay }) {
  return (
    <View
      style={[
        styles.panelHeader,
        {
          backgroundColor: theme?.panel || "#FFFFFF",
          borderBottomColor: theme?.border || "#e8f0eb",
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.panelBack, themedOverlay?.softCard]}
        onPress={onBack}
        activeOpacity={0.72}
        hitSlop={{ top: 8, right: 12, bottom: 8, left: 12 }}
        pressRetentionOffset={{ top: 18, right: 18, bottom: 18, left: 18 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={[styles.panelBackText, { color: theme?.primary || "#14532D" }]}>Back</Text>
      </TouchableOpacity>
      <View style={styles.panelTitleBlock}>
        <Text style={[styles.panelTitle, themedOverlay?.text]}>{title}</Text>
        <Text style={[styles.panelMeta, themedOverlay?.subtext]}>{meta}</Text>
      </View>
    </View>
  );
}

function QuickIncidentReportModal({
  visible,
  incidentDraft,
  setIncidentDraft,
  incidentImage,
  incidentImageError,
  incidentErrors,
  pickIncidentImage,
  takeIncidentPhoto,
  removeIncidentImage,
  submitIncident,
  incidentBusy,
  onClose,
}) {
  const imageItems = getIncidentImageItems(incidentImage);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.quickReportBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.quickReportSheet}>
          <View style={styles.quickReportHeader}>
            <View>
              <Text style={styles.quickReportTitle}>Report Incident</Text>
              <Text style={styles.quickReportMeta} numberOfLines={1}>
                {incidentDraft.location || "Jaen, Nueva Ecija"}
              </Text>
            </View>
            <TouchableOpacity style={styles.quickReportClose} onPress={onClose}>
              <Ionicons name="close" size={20} color="#10251B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.quickReportLocationCard}>
              <View style={styles.quickReportLocationIcon}>
                <Ionicons name="location-outline" size={18} color="#14532D" />
              </View>
              <View style={styles.quickReportLocationCopy}>
                <Text style={styles.quickReportLocationText} numberOfLines={2}>
                  {incidentDraft.location || "Jaen, Nueva Ecija"}
                </Text>
                <Text style={styles.quickReportLocationMeta} numberOfLines={1}>
                  {incidentDraft.barangay || "Unknown barangay"}
                  {incidentDraft.street ? ` | ${incidentDraft.street}` : ""}
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Incident Type</Text>
            <Picker
              selectedValue={incidentDraft.type}
              style={styles.picker}
              onValueChange={(value) =>
                setIncidentDraft((prev) => ({ ...prev, type: value }))
              }
            >
              <Picker.Item label="Choose category" value="" />
              <Picker.Item label="Flood" value="flood" />
              <Picker.Item label="Typhoon" value="typhoon" />
              <Picker.Item label="Fire" value="fire" />
              <Picker.Item label="Earthquake" value="earthquake" />
            </Picker>
            {!!incidentErrors?.type && <Text style={styles.validationText}>{incidentErrors.type}</Text>}

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe what you see"
              multiline
              value={incidentDraft.description}
              onChangeText={(value) =>
                setIncidentDraft((prev) => ({
                  ...prev,
                  description: sanitizeFreeTextInput(
                    value,
                    INCIDENT_DESCRIPTION_MAX_LENGTH
                  ),
                }))
              }
              maxLength={INCIDENT_DESCRIPTION_MAX_LENGTH}
            />
            {!!incidentErrors?.description && (
              <Text style={styles.validationText}>{incidentErrors.description}</Text>
            )}

            <View style={styles.photoActionRow}>
              <TouchableOpacity style={styles.photoActionBtn} onPress={pickIncidentImage}>
                <Ionicons name="images-outline" size={16} color="#14532D" />
                <Text style={styles.photoActionText}>Upload Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.photoActionBtn,
                  imageItems.length >= INCIDENT_IMAGE_LIMIT && styles.disabledBtn,
                ]}
                disabled={imageItems.length >= INCIDENT_IMAGE_LIMIT}
                onPress={takeIncidentPhoto}
              >
                <Ionicons name="camera-outline" size={16} color="#14532D" />
                <Text style={styles.photoActionText}>Take Photo</Text>
              </TouchableOpacity>
            </View>

            {imageItems.length > 0 && (
              <View style={styles.photoPreviewRow}>
                {imageItems.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.photoPreviewWrap}>
                    <Image source={{ uri: item.uri }} style={styles.thumb} />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => removeIncidentImage(item.uri)}
                    >
                      <Ionicons name="close" size={13} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {!!(incidentImageError || incidentErrors?.image) && (
              <Text style={styles.validationText}>{incidentImageError || incidentErrors.image}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, incidentBusy && styles.disabledBtn]}
              disabled={incidentBusy}
              onPress={submitIncident}
            >
              <Text style={styles.primaryText}>
                {incidentBusy ? "Submitting..." : "Submit report"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LegendRow({ color, label }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function createMapOverlayThemeStyles(theme) {
  return StyleSheet.create({
    panel: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    navigationPanel: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
    },
    navigationTop: {
      backgroundColor: theme.panel,
      borderBottomColor: theme.border,
      shadowColor: theme.mode === "dark" ? "#000000" : "#0f2319",
    },
    modal: {
      backgroundColor: theme.modalBackground,
      borderColor: theme.border,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    recommendedCard: {
      backgroundColor: theme.mode === "dark" ? "#172A21" : "#f0fdf4",
      borderColor: theme.mode === "dark" ? "#3C6650" : "#86efac",
    },
    selectedCard: {
      backgroundColor: theme.mode === "dark" ? "#172A21" : theme.primarySoft,
      borderColor: theme.mode === "dark" ? "#3C6650" : theme.border,
    },
    badge: {
      backgroundColor: theme.mode === "dark" ? "#244536" : theme.surfaceAlt,
      color: theme.text,
    },
    softCard: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    section: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    floatingButton: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    handle: {
      backgroundColor: theme.border,
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  mapWeatherOverlay: {
    position: "absolute",
    top: Platform.OS === "ios" ? 132 : 102,
    left: 14,
    right: 14,
    zIndex: 2200,
    elevation: 2200,
    pointerEvents: "box-none",
  },

  wazeTopOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 48 : 18,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.97)",
    zIndex: 2500,
    elevation: 2500,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(220,231,225,0.95)",
    shadowColor: "#0f2319",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },

  wazeTopTurnIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#EAF4EE",
    alignItems: "center",
    justifyContent: "center",
  },

  wazeTopCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },

  wazeTopInstruction: {
    color: "#10251B",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    textAlign: "center",
  },

  wazeTopRoad: {
    marginTop: 2,
    color: "#166534",
    fontSize: 14,
    fontWeight: "900",
  },

  wazeTopDistance: {
    color: "#14532D",
    fontSize: 18,
    fontWeight: "900",
    minWidth: 64,
    textAlign: "right",
  },

  routeHazardBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 112 : 88,
    left: 16,
    right: 16,
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: "rgba(194,65,12,0.97)",
    borderWidth: 1,
    borderColor: "rgba(254,215,170,0.72)",
    zIndex: 2550,
    elevation: 2550,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    shadowColor: "#450A0A",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  routeHazardBannerUrgent: {
    backgroundColor: "rgba(127,29,29,0.98)",
    borderColor: "rgba(254,202,202,0.78)",
  },

  routeHazardIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "#EA580C",
    alignItems: "center",
    justifyContent: "center",
  },

  routeHazardIconUrgent: {
    backgroundColor: "#DC2626",
  },

  routeHazardCopy: {
    flex: 1,
    minWidth: 0,
  },

  routeHazardText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },

  routeHazardDistance: {
    marginTop: 3,
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  navigationFloatingControls: {
    position: "absolute",
    left: 16,
    right: 16,
    top: -74,
    minHeight: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 12,
    elevation: 12,
  },

  navigationFloatingButton: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE9E3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f2319",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },

  navigationFloatingReportButton: {
    width: 118,
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFF7F7",
    borderColor: "#FECACA",
  },

  navigationFloatingReportText: {
    color: "#7F1D1D",
    fontSize: 14,
    fontWeight: "900",
  },

  navigationArrowShell: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },

  navigationArrowHalo: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(14,165,233,0.18)",
    borderWidth: 2,
    borderColor: "rgba(14,165,233,0.28)",
  },

  navigationArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#06B6D4",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#083344",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
    zIndex: 2,
  },

  switcher: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    zIndex: 2000,
    elevation: 2000,
    paddingHorizontal: 12,
  },

  switcherContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 24,
  },

  moduleButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },

  moduleActive: {
    backgroundColor: "#14532d",
    borderColor: "#14532d",
  },

  moduleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },

  moduleTextActive: {
    color: "#ffffff",
  },

  backButton: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },

  backText: {
    color: "#ffffff",
  },

  actionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 112,
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 8,
    zIndex: 1500,
    elevation: 1500,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },

  evacRouteAction: {
    minHeight: 58,
    justifyContent: "center",
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#14532d",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
  },

  primaryText: {
    color: "#ffffff",
    fontWeight: "800",
  },

  secondaryBtn: {
    flex: 1,
    backgroundColor: "#f8fbf9",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dce7e1",
  },

  secondaryText: {
    color: "#111827",
    fontWeight: "700",
  },

  dangerBtn: {
    backgroundColor: "#b91c1c",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "#991b1b",
  },

  dangerText: {
    color: "#ffffff",
    fontWeight: "800",
  },

  navigationTopCard: {
    marginBottom: 12,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E7DF",
    shadowColor: "#0f2319",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  wazeInstructionBar: {
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#14532D",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  wazeTurnIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  wazeInstructionTextWrap: {
    flex: 1,
  },

  wazeInstructionText: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
  },

  wazeInstructionSubtext: {
    marginTop: 3,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "800",
  },

  wazeTripCard: {
    margin: 12,
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#E1ECE6",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  wazeEtaBlock: {
    minWidth: 88,
    alignItems: "flex-start",
  },

  wazeEtaValue: {
    color: "#10251B",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
  },

  wazeEtaLabel: {
    marginTop: 2,
    color: "#64756B",
    fontSize: 11,
    fontWeight: "900",
  },

  wazeDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#DDE9E3",
  },

  wazeTripStat: {
    flex: 1,
  },

  wazeTripValue: {
    color: "#14532D",
    fontSize: 14,
    fontWeight: "900",
  },

  wazeTripLabel: {
    marginTop: 3,
    color: "#64756B",
    fontSize: 10,
    fontWeight: "800",
  },

  wazeDestinationRow: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  wazeDestinationText: {
    flex: 1,
    color: "#10251B",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },

  wazeStatusPill: {
    alignSelf: "flex-start",
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 10,
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  wazeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },

  wazeStatusText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
  },

  wazeStopBtn: {
    marginTop: 14,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#D92D20",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#7F1D1D",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },

  wazeStopText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  wazeBottomPanel: {
    paddingTop: 2,
    paddingBottom: 4,
  },

  wazeBottomStats: {
    flexDirection: "row",
    gap: 9,
  },

  wazeBottomStat: {
    flex: 1,
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: "#FAFCFB",
    borderWidth: 1,
    borderColor: "#DDE9E3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 9,
    shadowColor: "#0f2319",
    shadowOpacity: 0.06,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  wazeBottomStatPrimary: {
    backgroundColor: "#EAF7EF",
    borderColor: "#BFE7CB",
  },

  wazeBottomValue: {
    marginTop: 4,
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  wazeBottomLabel: {
    marginTop: 3,
    color: "#64756B",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },

  navigationTopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  navigationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#14532D",
    alignItems: "center",
    justifyContent: "center",
  },

  navigationTitleBlock: {
    flex: 1,
  },

  navigationEyebrow: {
    color: "#64756B",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  navigationDestination: {
    marginTop: 2,
    color: "#10251B",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },

  navigationStatusText: {
    marginTop: 10,
    color: "#52645A",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  navigationCompactCard: {
    marginTop: 4,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#f8fbf9",
    borderWidth: 1,
    borderColor: "#dce7e1",
  },

  navigationMetricRow: {
    flexDirection: "row",
    gap: 8,
  },

  navigationMetricBox: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5eee8",
    paddingHorizontal: 6,
  },

  navigationMetricValue: {
    color: "#14532d",
    fontSize: 14,
    fontWeight: "900",
  },

  navigationMetricLabel: {
    marginTop: 4,
    color: "#64756b",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },

  disabledBtn: {
    opacity: 0.6,
  },

  panelWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    pointerEvents: "box-none",
  },

  panel: {
    height: PANEL_HEIGHT,
    maxHeight: PANEL_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.99)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(220,231,225,0.95)",
    shadowColor: "#0f2319",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 16,
    overflow: "hidden",
  },

  panelScroll: {
    flex: 1,
    minHeight: 0,
  },

  navigationPanelSurface: {
    height: NAV_PANEL_HEIGHT,
    maxHeight: NAV_PANEL_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.985)",
    borderColor: "rgba(210,226,218,0.98)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 0,
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: "visible",
    shadowColor: "#0f2319",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },

  dragZone: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -18,
    marginBottom: 2,
  },

  dragHandleTouchTarget: {
    width: 116,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  handle: {
    width: 68,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#A7BAAF",
    alignSelf: "center",
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
    zIndex: 30,
    elevation: 8,
  },

  panelBack: {
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce7e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4faf6",
  },

  panelBackText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
  },

  panelTitleBlock: {
    flex: 1,
    minWidth: 0,
  },

  panelTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#10251b",
  },

  panelMeta: {
    marginTop: 3,
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },

  picker: {
    minHeight: 46,
    backgroundColor: "#fbfdfc",
    borderRadius: 14,
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#DCE7E1",
    borderRadius: 16,
    padding: 13,
    backgroundColor: "#FFFFFF",
    marginBottom: 11,
    fontSize: 14,
    color: "#10251B",
  },

  incidentFormScrollContent: {
    paddingBottom: INCIDENT_FORM_KEYBOARD_PADDING,
    paddingTop: 2,
  },

  label: {
    marginBottom: 6,
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },

  textArea: {
    minHeight: 76,
    textAlignVertical: "top",
  },

  locationCaptureBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dce7e1",
    backgroundColor: "#ffffff",
    padding: 12,
    marginBottom: 10,
  },

  locationCaptureHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  locationIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F5ED",
    borderWidth: 1,
    borderColor: "#CFE5D4",
    marginRight: 10,
  },

  locationCopy: {
    flex: 1,
  },

  locationTitle: {
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
  },

  locationHelp: {
    marginTop: 3,
    color: "#647067",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

  locationInput: {
    marginBottom: 8,
  },

  locationActionRow: {
    flexDirection: "row",
    marginBottom: 8,
  },

  locationActionBtn: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: "#E7F5ED",
    borderWidth: 1,
    borderColor: "#CFE5D4",
  },

  locationActionText: {
    marginLeft: 7,
    color: "#14532D",
    fontSize: 12,
    fontWeight: "900",
  },

  locationStatusText: {
    color: "#647067",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

  formRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  photoActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },

  photoActionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#DCE7E1",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 8,
  },

  photoActionText: {
    color: "#14532D",
    fontSize: 12,
    fontWeight: "900",
  },

  photoPreviewRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },

  photoPreviewWrap: {
    width: 56,
    height: 56,
  },

  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },

  photoRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },

  validationText: {
    marginTop: -2,
    marginBottom: 4,
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800",
  },

  quickReportBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.42)",
  },

  quickReportSheet: {
    maxHeight: Math.min(SCREEN_HEIGHT * 0.78, 620),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE9E3",
  },

  quickReportHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  quickReportTitle: {
    color: "#10251B",
    fontSize: 19,
    fontWeight: "900",
  },

  quickReportMeta: {
    marginTop: 3,
    color: "#647067",
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 280,
  },

  quickReportClose: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#F4FAF6",
    borderWidth: 1,
    borderColor: "#DCE7E1",
    alignItems: "center",
    justifyContent: "center",
  },

  quickReportLocationCard: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#DCE7E1",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  quickReportLocationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EAF7EF",
    borderWidth: 1,
    borderColor: "#CFE5D4",
    alignItems: "center",
    justifyContent: "center",
  },

  quickReportLocationCopy: {
    flex: 1,
    minWidth: 0,
  },

  quickReportLocationText: {
    color: "#10251B",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  quickReportLocationMeta: {
    marginTop: 4,
    color: "#647067",
    fontSize: 11,
    fontWeight: "800",
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf2ef",
  },

  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    marginRight: 10,
  },

  legendText: {
    color: "#374151",
    fontWeight: "600",
  },

  floodLegendGrid: {
    gap: 8,
  },

  floodLegendItem: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf2ef",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  floodLegendSwatch: {
    width: 18,
    height: 18,
    borderRadius: 5,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.14)",
  },

  floodLegendText: {
    flex: 1,
    color: "#374151",
    fontSize: 12,
    fontWeight: "800",
  },

  evacMarkerShell: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 58,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 5,
    overflow: "visible",
  },

  evacMarkerLabelWrap: {
    marginBottom: 6,
    maxWidth: 160,
    overflow: "visible",
  },

  evacMarkerLabel: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  evacMarkerLabelText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#14532D",
  },

  evacMarkerBadge: {
    alignSelf: "center",
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#14532D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },

  evacMarkerBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },

  evacMarkerPin: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  evacMarkerPinSelected: {
    borderWidth: 4,
  },

  evacMarkerCore: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  evacMarkerBaseShadow: {
    width: 18,
    height: 5,
    borderRadius: 999,
    marginTop: 3,
    opacity: 0.24,
    transform: [{ scaleX: 1.35 }],
  },

barangayMarkerShell: {
  minWidth: 110,
  maxWidth: 176,
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
},

barangayMarker: {
  minHeight: 38,
  maxWidth: 176,
  paddingLeft: 8,
  paddingRight: 10,
  paddingVertical: 7,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.97)",
  borderWidth: 1,
  flexDirection: "row",
  alignItems: "center",
  position: "relative",
  shadowColor: "#000",
  shadowOpacity: 0.14,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
},

barangayMarkerSelected: {
  backgroundColor: "#FFFFFF",
  borderWidth: 1.5,
  shadowOpacity: 0.2,
  shadowRadius: 8,
  elevation: 6,
},

barangayMarkerIcon: {
  width: 18,
  height: 18,
  borderRadius: 9,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 6,
  borderWidth: 1,
  flexShrink: 0,
},

barangayMarkerDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},

barangayMarkerText: {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  lineHeight: 13,
  fontWeight: "800",
  color: "#1F2937",
},

barangayMarkerTextSelected: {
  color: "#111827",
},

barangayIncidentBadge: {
  minWidth: 18,
  height: 18,
  paddingHorizontal: 4,
  borderRadius: 9,
  backgroundColor: "#14532D",
  marginLeft: 6,
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
},

barangayIncidentBadgeText: {
  color: "#FFFFFF",
  fontSize: 10,
  fontWeight: "900",
},

barangayIncidentTooltip: {
  position: "absolute",
  left: 8,
  right: 8,
  top: 38,
  minHeight: 19,
  paddingHorizontal: 7,
  borderRadius: 9,
  backgroundColor: "rgba(127,29,29,0.95)",
  alignItems: "center",
  justifyContent: "center",
},

barangayIncidentTooltipText: {
  color: "#FFFFFF",
  fontSize: 9,
  lineHeight: 11,
  fontWeight: "900",
},

  barangayLegendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  barangayLegendItem: {
    width: "48%",
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf2ef",
    paddingHorizontal: 8,
  },

  barangayLegendSwatch: {
    width: 13,
    height: 13,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.18)",
  },

  barangayLegendText: {
    flex: 1,
    color: "#374151",
    fontSize: 11,
    fontWeight: "800",
  },


  barangayFilterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  barangayFilterTitleBlock: {
    flex: 1,
    minWidth: 0,
  },

  barangayClearChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
  },

  barangayClearChipText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
  },

  barangayFilterButton: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E8DF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },

  barangayFilterButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },

  barangayFilterButtonCopy: {
    flex: 1,
    minWidth: 0,
  },

  barangayFilterButtonTitle: {
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
  },

  barangayFilterButtonMeta: {
    marginTop: 2,
    color: "#647067",
    fontSize: 11,
    fontWeight: "800",
  },

  barangayChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  barangayChoiceChip: {
    width: "48%",
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#E2ECE6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  barangayChoiceChipActive: {
    backgroundColor: "#14532D",
    borderColor: "#166534",
  },

  barangayChoiceDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.16)",
  },

  barangayChoiceText: {
    flex: 1,
    color: "#374151",
    fontSize: 11,
    fontWeight: "900",
  },

  barangayChoiceTextActive: {
    color: "#FFFFFF",
  },

  panelNote: {
    marginTop: 4,
    color: "#526158",
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
  },

  panelSection: {
    backgroundColor: "#F8FBF9",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2ECE6",
    padding: 15,
    marginBottom: 13,
    shadowColor: "#0f2319",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  sectionLabel: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    textTransform: "uppercase",
  },

  listSection: {
    backgroundColor: "#f6faf8",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e3ece7",
    padding: 9,
    marginBottom: 12,
  },

  evacSection: {
    marginBottom: 8,
  },

  evacSectionTitle: {
    marginBottom: 8,
    color: "#516353",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  filterChipRow: {
    gap: 8,
    paddingBottom: 10,
  },

  filterChipButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE7E1",
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipButtonActive: {
    backgroundColor: "#14532D",
    borderColor: "#14532D",
  },

  filterChipText: {
    color: "#14532D",
    fontSize: 11,
    fontWeight: "900",
  },

  filterChipTextActive: {
    color: "#FFFFFF",
  },

  evacCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#edf2ef",
    backgroundColor: "#ffffff",
    marginBottom: 8,
    shadowColor: "#0f2319",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  evacCardRecommended: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },

  evacIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#e7f5ed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  evacIconBadgeLarge: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#dff2e8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  evacIconText: {
    color: "#14532d",
    fontSize: 13,
    fontWeight: "900",
  },

  evacCardText: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },

  evacName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },

  evacMeta: {
    marginTop: 3,
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },

  recommendationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 7,
  },

  recommendationBadge: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "900",
  },

  recommendationBadgePrimary: {
    color: "#FFFFFF",
    backgroundColor: "#14532D",
  },

  recommendationBadgeBarangay: {
    color: "#14532D",
    backgroundColor: "#DCFCE7",
  },

  recommendationBadgeNeutral: {
    color: "#374151",
    backgroundColor: "#F3F4F6",
  },

  selectedPlace: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1fae5",
    backgroundColor: "#f0fdf4",
    padding: 15,
    marginBottom: 12,
    shadowColor: "#14532d",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  statusSummaryRow: {
    flexDirection: "row",
    gap: 8,
  },

  statusSummaryCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },

  statusSummaryValue: {
    fontSize: 20,
    fontWeight: "900",
  },

  statusSummaryValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  statusSummaryDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.16)",
  },

  statusSummaryLabel: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },

  statusChipText: {
    color: "#166534",
    fontSize: 10,
    fontWeight: "900",
  },

  selectedStatusChip: {
    alignSelf: "flex-start",
    marginTop: 12,
  },

  warningChip: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },

  warningChipText: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "700",
  },

  incidentBarangayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  incidentBarangayIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8D8",
    borderWidth: 1,
    borderColor: "#FACC15",
    marginRight: 10,
  },

  incidentBarangayCopy: {
    flex: 1,
  },

  clearBarangayBtn: {
    marginTop: 12,
    minHeight: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F5ED",
    borderWidth: 1,
    borderColor: "#CFE5D4",
  },

  clearBarangayText: {
    color: "#14532D",
    fontSize: 12,
    fontWeight: "900",
  },

  incidentListItem: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf2ef",
    padding: 12,
    marginBottom: 8,
  },

  incidentListIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  incidentListCopy: {
    flex: 1,
    minWidth: 0,
  },

  incidentListTitle: {
    flex: 1,
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  incidentListTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  incidentStatusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#ffffff",
  },

  incidentStatusText: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  incidentListMeta: {
    marginTop: 3,
    color: "#516353",
    fontSize: 11,
    fontWeight: "800",
  },

  incidentListSubMeta: {
    marginTop: 3,
    color: "#7A877D",
    fontSize: 10,
    fontWeight: "700",
  },

  incidentListDescription: {
    marginTop: 5,
    color: "#647067",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },

  incidentPhotoRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },

  incidentPhotoThumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },

  incidentLevelChip: {
    marginLeft: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#FFFBEB",
  },

  incidentLevelText: {
    fontSize: 9,
    fontWeight: "900",
  },

  emptyIncidentState: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf2ef",
    padding: 18,
  },

  emptyIncidentTitle: {
    marginTop: 8,
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
  },

  emptyIncidentText: {
    marginTop: 4,
    color: "#647067",
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },

  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  modeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },

  modeBtnActive: {
    backgroundColor: "#14532d",
    borderColor: "#14532d",
  },

  modeText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },

  modeTextActive: {
    color: "#ffffff",
  },

  routeCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e3ece7",
    backgroundColor: "#ffffff",
    marginBottom: 8,
    shadowColor: "#0f2319",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  loadingCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e3ece7",
    backgroundColor: "#ffffff",
    marginBottom: 8,
  },

  routeRecommended: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },

  routeMain: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },


  incidentToggleCard: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  incidentToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  incidentToggleEyebrow: {
    color: "#14532D",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  incidentToggleTitle: {
    marginTop: 3,
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
  },

  incidentToggleRow: {
    flexDirection: "row",
    gap: 8,
  },

  incidentToggleBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  incidentToggleBtnActive: {
    backgroundColor: "#14532D",
    borderColor: "#14532D",
  },

  incidentToggleText: {
    color: "#14532D",
    fontSize: 11,
    fontWeight: "900",
  },

  incidentToggleTextActive: {
    color: "#FFFFFF",
  },

  debugStatusCard: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  debugStatusCardActive: {
    backgroundColor: "#14532D",
    borderColor: "#14532D",
  },

  debugStatusCardDisabled: {
    opacity: 0.7,
  },

  debugStatusText: {
    flex: 1,
    color: "#14532D",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },

  debugStatusTextActive: {
    color: "#FFFFFF",
  },

  locationAllowedCard: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  locationAllowedText: {
    flex: 1,
    color: "#166534",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

  mapToggleGrid: {
    flexDirection: "row",
    gap: 10,
  },

  mapToggleBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  mapToggleBtnActive: {
    backgroundColor: "#14532D",
    borderColor: "#14532D",
  },

  mapToggleText: {
    color: "#14532D",
    fontSize: 11,
    fontWeight: "900",
  },

  mapToggleTextActive: {
    color: "#FFFFFF",
  },

  addressPreviewCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F7FAF8",
    borderWidth: 1,
    borderColor: "#E4ECE7",
  },

  addressPreviewLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#647067",
    marginBottom: 4,
    textTransform: "uppercase",
  },

  addressPreviewText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#10251B",
    fontWeight: "700",
  },

  stopModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  stopModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F1D6D6",
    padding: 20,
    alignItems: "center",
    shadowColor: "#7F1D1D",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },

  stopModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  stopModalTitle: {
    color: "#10251B",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  stopModalMessage: {
    marginTop: 8,
    color: "#647067",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },

  stopModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    width: "100%",
  },

  stopModalNoBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#F8FBF9",
    borderWidth: 1,
    borderColor: "#DDE9E3",
    alignItems: "center",
    justifyContent: "center",
  },

  stopModalNoText: {
    color: "#14532D",
    fontSize: 14,
    fontWeight: "900",
  },

  stopModalYesBtn: {
    flex: 1.15,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7F1D1D",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  stopModalYesText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    width: "80%",
  },

  modalText: {
    marginBottom: 16,
    fontSize: 16,
    fontWeight: "700",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  modalNo: {
    color: "#374151",
    fontWeight: "700",
  },

  modalYes: {
    color: "#dc2626",
    fontWeight: "800",
  },
});
