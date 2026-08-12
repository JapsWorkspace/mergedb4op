import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowDown,
  FaArrowUp,
  FaBell,
  FaCloudSun,
  FaEdit,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaFacebookF,
  FaMapMarkedAlt,
  FaSearch,
  FaPhoneAlt,
  FaSave,
  FaShieldAlt,
  FaSms,
  FaTimes,
  FaTrash,
  FaUpload,
  FaMap,
  FaHome,
  FaCheckCircle,
} from "react-icons/fa";
import "../css/Dashboard.css";

import jaenlogo from "../../assets/images/jaenlogo.png";
import hero1 from "../../assets/images/hero1.jpg";
import hero2 from "../../assets/images/hero2.jpg";
import hero3 from "../../assets/images/hero3.jpg";
import EvacMap from "../map/Map";
import PublicDigitalTwinPanel from "./PublicDigitalTwinPanel";
import FloodVirtualTwin from "./FloodVirtualTwin";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;

const JAEN_COORDS = {
  latitude: 15.3274,
  longitude: 120.9192,
};

const fallbackHeroImages = [hero2, hero1, hero3].map((fileUrl, index) => ({
  _id: `fallback-hero-${index + 1}`,
  fileUrl,
  fileName: `Default hero image ${index + 1}`,
  caption: "",
}));

const DEFAULT_SITE_CONTENT = {
  hero: {
    title: "Jaen MDRRMO Public Information Portal",
    subtitle:
      "Official weather, evacuation areas, advisories, emergency contacts, and barangay-focused public safety information for Jaen, Nueva Ecija.",
    primaryCtaLabel: "View Weather",
    secondaryCtaLabel: "Emergency Contacts",
  },
  alert: {
    enabled: true,
    level: "Advisory",
    text: "Monitor official weather updates and keep emergency contact lines accessible.",
  },
  announcements: [
    {
      id: `ann-${Date.now()}-1`,
      title: "Preparedness Reminder",
      body: "Keep go-bags ready, secure important documents, and monitor MDRRMO advisories during unstable weather.",
      tag: "Public Advisory",
    },
    {
      id: `ann-${Date.now()}-2`,
      title: "Evacuation Readiness",
      body: "Barangays should review local evacuation areas and identify households needing priority assistance.",
      tag: "Operations",
    },
  ],
  tips: [
    { id: "tip-1", text: "Prepare a go-bag for each household member." },
    { id: "tip-2", text: "Keep flashlights, batteries, and water ready." },
    { id: "tip-3", text: "Save emergency numbers on every family phone." },
    { id: "tip-4", text: "Follow official advisories and avoid rumor-based posts." },
  ],
  hotlines: [
    {
      id: "hot-1",
      label: "Emergency Hotline",
      number: "0999-000-0000",
      type: "call",
    },
    {
      id: "hot-2",
      label: "SMS Hotline",
      number: "0999-000-0001",
      type: "sms",
    },
    {
      id: "hot-3",
      label: "Email",
      number: "jaenmdrrmo@example.com",
      type: "email",
    },
    {
      id: "hot-4",
      label: "Facebook Page",
      number: "https://facebook.com/",
      type: "link",
    },
  ],
  office: {
    name: "Jaen MDRRMO",
    address: "Jaen, Nueva Ecija",
    hours: "Office hours may vary during emergencies.",
    email: "jaenmdrrmo@example.com",
    facebook: "https://facebook.com/",
  },
  heroImages: [],
  incidentFeedMode: "all",
};

const LIMITS = {
  announcements: 5,
  tips: 6,
  hotlines: 4,
};

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "weather", label: "Weather" },
  { id: "public-evac-map", label: "Evacuation" },
  { id: "hazard-focus", label: "Hazard" },
  { id: "incident-focus", label: "Incidents" },
  { id: "updates", label: "Updates" },
  { id: "footer-info", label: "Contacts" },
];

const TWIN_NAV_ITEMS = [
  { id: "digital-twin", label: "Digital Twin" },
  { id: "virtual-twin", label: "Virtual Twin" },
];

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function safeLower(value) {
  return String(value || "").toLowerCase().trim();
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function countGeoJsonFeatures(geojson) {
  if (!geojson) return 0;
  if (geojson.type === "FeatureCollection") {
    return Array.isArray(geojson.features) ? geojson.features.length : 0;
  }
  if (geojson.type === "Feature") return 1;
  return 0;
}

function formatDateTime(value) {
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
}

function weatherCodeLabel(code) {
  const map = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Rain",
    65: "Heavy rain",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Severe thunderstorm",
  };

  return map[code] || "Weather update";
}

function weatherIconTone(code) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([45, 48].includes(code)) return "fog";
  if ([0, 1, 2].includes(code)) return "clear";
  return "cloud";
}

function getRainAdvisory(rainChance) {
  const value = Number(rainChance || 0);
  if (value >= 70) return "High likelihood of rain today";
  if (value >= 40) return "Possible rain later today";
  if (value >= 20) return "Low to moderate chance of rain";
  return "Minimal chance of rain today";
}

function normalizeSitePayload(payload) {
  return {
    hero: {
      ...DEFAULT_SITE_CONTENT.hero,
      ...(payload?.hero || {}),
    },
    alert: {
      ...DEFAULT_SITE_CONTENT.alert,
      ...(payload?.alert || {}),
    },
    announcements: Array.isArray(payload?.announcements)
      ? payload.announcements.slice(0, LIMITS.announcements)
      : DEFAULT_SITE_CONTENT.announcements,
    tips: Array.isArray(payload?.tips)
      ? payload.tips.slice(0, LIMITS.tips)
      : DEFAULT_SITE_CONTENT.tips,
    hotlines: Array.isArray(payload?.hotlines)
      ? payload.hotlines.slice(0, LIMITS.hotlines)
      : DEFAULT_SITE_CONTENT.hotlines,
    office: {
      ...DEFAULT_SITE_CONTENT.office,
      ...(payload?.office || {}),
    },
    heroImages: Array.isArray(payload?.heroImages)
      ? payload.heroImages
          .map((item, index) => ({
            _id: item?._id || `hero-${index + 1}`,
            fileName: item?.fileName || `Landing image ${index + 1}`,
            fileUrl: item?.fileUrl || "",
            public_id: item?.public_id || "",
            caption: item?.caption || "",
          }))
          .filter((item) => item.fileUrl)
      : [],
    incidentFeedMode:
      payload?.incidentFeedMode === "resolved-only" ? "resolved-only" : "all",
  };
}

function sanitizeSearchInput(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, 100);
}

function getIncidentStatusLabel(status) {
  if (!status || status === "reported") return "Reported";
  if (status === "onProcess") return "On Process";
  if (status === "resolved") return "Resolved";
  return status;
}

function getSeverityTone(level) {
  const normalized = safeLower(level);
  if (normalized.includes("high")) return "danger";
  if (normalized.includes("medium")) return "warning";
  if (normalized.includes("low")) return "success";
  return "neutral";
}

function PublicMapLegend({ showHazardOverlay = false }) {
  return (
    <div className="public-map-legend" aria-label="Map legend">
      <div className="public-map-legend-title">Map Legend</div>

      <div className="public-map-legend-items">
        <div className="public-map-legend-item">
          <span className="public-map-dot available" />
          <span>Available</span>
        </div>

        <div className="public-map-legend-item">
          <span className="public-map-dot limited" />
          <span>Limited</span>
        </div>

        <div className="public-map-legend-item">
          <span className="public-map-dot full" />
          <span>Full</span>
        </div>

        {showHazardOverlay ? (
          <>
            <div className="public-map-legend-item">
              <span className="public-map-swatch susceptible" />
              <span>Susceptible</span>
            </div>

            <div className="public-map-legend-item">
              <span className="public-map-swatch medium" />
              <span>Medium</span>
            </div>

            <div className="public-map-legend-item">
              <span className="public-map-swatch safe" />
              <span>Safe</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [currentHero, setCurrentHero] = useState(0);

  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT);
  const [draftContent, setDraftContent] = useState(DEFAULT_SITE_CONTENT);

  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [activeSection, setActiveSection] = useState("home");

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingHeroImage, setIsUploadingHeroImage] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [userRole, setUserRole] = useState("");
  const [isVisitorMode, setIsVisitorMode] = useState(false);

  const [publicPlaces, setPublicPlaces] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [selectedPublicPlaceId, setSelectedPublicPlaceId] = useState(null);
  const [publicBarangayFilter, setPublicBarangayFilter] = useState("all");
  const [publicSelectedBarangays, setPublicSelectedBarangays] = useState([]);
  const [publicBarangayBounds, setPublicBarangayBounds] = useState([]);
  const [hazardLayers, setHazardLayers] = useState(null);
  const [hazardLoading, setHazardLoading] = useState(true);
  const [hazardError, setHazardError] = useState("");
  const [showHazardOverlay, setShowHazardOverlay] = useState(false);

  const [publicIncidents, setPublicIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [incidentsError, setIncidentsError] = useState("");
  const [activeTwinView, setActiveTwinView] = useState("");

  const observerRef = useRef(null);
  const heroImageInputRef = useRef(null);
  const navigate = useNavigate();

  const isPrivilegedUser = useMemo(() => {
    return ["drrmo", "admin"].includes(safeLower(userRole));
  }, [userRole]);
  const isTwinViewActive = Boolean(activeTwinView);

  const canEdit = isPrivilegedUser && !isVisitorMode;
  const isInlineEditing = canEdit && isEditorOpen;
  const pageContent = isInlineEditing ? draftContent : siteContent;

  const activeHeroImages = useMemo(() => {
    return pageContent.heroImages?.length ? pageContent.heroImages : fallbackHeroImages;
  }, [pageContent.heroImages]);

  const heroBg = activeHeroImages[currentHero]?.fileUrl || null;
  const topWeather = weather?.current || null;

  const todaySummary = useMemo(() => {
    if (!weather?.daily) {
      return {
        high: "--",
        low: "--",
        rain: "--",
      };
    }

    return {
      high: Math.round(weather.daily.temperature_2m_max?.[0] || 0),
      low: Math.round(weather.daily.temperature_2m_min?.[0] || 0),
      rain: weather.daily.precipitation_probability_max?.[0] ?? 0,
    };
  }, [weather]);

  const forecastCards = useMemo(() => {
    const days = weather?.daily?.time || [];

    return days.slice(0, 3).map((day, idx) => ({
      key: day,
      label:
        idx === 0
          ? "Today"
          : idx === 1
          ? "Tomorrow"
          : new Date(day).toLocaleDateString("en-PH", { weekday: "short" }),
      condition: weatherCodeLabel(weather?.daily?.weather_code?.[idx]),
      high: Math.round(weather?.daily?.temperature_2m_max?.[idx] || 0),
      low: Math.round(weather?.daily?.temperature_2m_min?.[idx] || 0),
      rain: weather?.daily?.precipitation_probability_max?.[idx] ?? 0,
      code: weather?.daily?.weather_code?.[idx],
    }));
  }, [weather]);

  const publicBarangayOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        publicPlaces
          .map((item) => String(item?.barangayName || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return names;
  }, [publicPlaces]);

  const filteredPublicPlaces = useMemo(() => {
    if (!publicSelectedBarangays.length) return publicPlaces;

    const selectedKeys = new Set(
      publicSelectedBarangays.map((name) => safeLower(name))
    );
    return publicPlaces.filter(
      (item) => selectedKeys.has(safeLower(item?.barangayName))
    );
  }, [publicPlaces, publicSelectedBarangays]);

  const publicMapSummary = useMemo(() => {
    const source = filteredPublicPlaces;

    const availableCount = source.filter(
      (item) => safeLower(item?.capacityStatus) === "available"
    ).length;

    const limitedCount = source.filter(
      (item) => safeLower(item?.capacityStatus) === "limited"
    ).length;

    const fullCount = source.filter(
      (item) => safeLower(item?.capacityStatus) === "full"
    ).length;

    return {
      total: source.length,
      availableCount,
      limitedCount,
      fullCount,
    };
  }, [filteredPublicPlaces]);

  const selectedPublicPlace = useMemo(() => {
    return (
      filteredPublicPlaces.find(
        (item) => String(item?._id) === String(selectedPublicPlaceId)
      ) || null
    );
  }, [filteredPublicPlaces, selectedPublicPlaceId]);

  const handlePublicBarangayFilterChange = (nextBarangay) => {
    setPublicBarangayFilter(nextBarangay);
    setSelectedPublicPlaceId(null);

    if (nextBarangay === "all") {
      setPublicSelectedBarangays([]);
      return;
    }

    setPublicSelectedBarangays((current) => {
      const exists = current.some(
        (name) => safeLower(name) === safeLower(nextBarangay)
      );

      if (exists) {
        const nextSelected = current.filter(
          (name) => safeLower(name) !== safeLower(nextBarangay)
        );
        if (!nextSelected.length) {
          setPublicBarangayFilter("all");
        }
        return nextSelected;
      }

      return [...current, nextBarangay];
    });
  };

  const focusedBarangayLabel = !publicSelectedBarangays.length
    ? "All Barangays"
    : publicSelectedBarangays.length === 1
    ? publicSelectedBarangays[0]
    : `${publicSelectedBarangays.length} barangays selected`;

  const hazardSummary = useMemo(() => {
    return {
      safe: countGeoJsonFeatures(hazardLayers?.safe),
      medium: countGeoJsonFeatures(hazardLayers?.medium),
      susceptible: countGeoJsonFeatures(hazardLayers?.susceptible),
    };
  }, [hazardLayers]);

  const incidentSummary = useMemo(() => {
    const total = publicIncidents.length;

    const reported = publicIncidents.filter(
      (item) => !item.status || item.status === "reported" || item.status === ""
    ).length;

    const onProcess = publicIncidents.filter(
      (item) => item.status === "onProcess"
    ).length;

    const resolved = publicIncidents.filter(
      (item) => item.status === "resolved"
    ).length;

    return {
      total,
      reported,
      onProcess,
      resolved,
    };
  }, [publicIncidents]);

  const incidentFeedMode =
    safeLower(siteContent?.incidentFeedMode) === "resolved-only"
      ? "resolved-only"
      : "all";

  const incidentFeedList = useMemo(() => {
    const source =
      incidentFeedMode === "resolved-only"
        ? publicIncidents.filter((item) => item.status === "resolved")
        : publicIncidents;

    return source
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt || a.date || 0).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt || b.date || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 4);
  }, [incidentFeedMode, publicIncidents]);

  const filteredIncidentFeedList = useMemo(() => {
    if (!publicSelectedBarangays.length) return incidentFeedList;

    const selectedKeys = publicSelectedBarangays.map((name) => safeLower(name));

    return incidentFeedList.filter((item) => {
      const barangayName = safeLower(item.barangayName);
      const location = safeLower(item.location);
      const address = safeLower(item.address);

      return selectedKeys.some(
        (barangay) =>
          barangayName.includes(barangay) ||
          location.includes(barangay) ||
          address.includes(barangay)
      );
    });
  }, [incidentFeedList, publicSelectedBarangays]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHero((prev) =>
        activeHeroImages.length ? (prev + 1) % activeHeroImages.length : 0
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [activeHeroImages.length]);

  useEffect(() => {
    if (!canEdit && isEditorOpen) {
      setIsEditorOpen(false);
    }
  }, [canEdit, isEditorOpen]);

  useEffect(() => {
    if (!activeHeroImages.length) {
      setCurrentHero(0);
      return;
    }

    if (currentHero >= activeHeroImages.length) {
      setCurrentHero(0);
    }
  }, [activeHeroImages, currentHero]);

  useEffect(() => {
    if (!filteredPublicPlaces.length) {
      setSelectedPublicPlaceId(null);
      return;
    }

    const stillExists = filteredPublicPlaces.some(
      (item) => String(item?._id) === String(selectedPublicPlaceId)
    );

    if (!stillExists) {
      setSelectedPublicPlaceId(filteredPublicPlaces[0]?._id || null);
    }
  }, [filteredPublicPlaces, selectedPublicPlaceId]);

  useEffect(() => {
    if (isTwinViewActive) {
      observerRef.current?.disconnect();
      setActiveSection(activeTwinView);
      return undefined;
    }

    const sectionIds = NAV_ITEMS.map((item) => item.id);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!elements.length) return undefined;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.35, 0.5, 0.8],
      }
    );

    elements.forEach((element) => observerRef.current.observe(element));

    return () => observerRef.current?.disconnect();
  }, [
    activeTwinView,
    isTwinViewActive,
    filteredPublicPlaces.length,
    filteredIncidentFeedList,
    weatherLoading,
    mapLoading,
    incidentsLoading,
  ]);

  const scrollToId = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const scrollToWeather = () => scrollToId("weather");
  const scrollToMap = () => scrollToId("public-evac-map");
  const scrollToUpdates = () => scrollToId("updates");
  const scrollToPreparedness = () => scrollToId("preparedness");
  const scrollToFooter = () => scrollToId("footer-info");
  const openTwinView = (viewId) => {
    setActiveTwinView(viewId);
    setActiveSection(viewId);
    setIsEditorOpen(false);
  };

  function handleNavClick(id) {
    if (id === "digital-twin" || id === "virtual-twin") {
      openTwinView(id);
      return;
    }

    if (isTwinViewActive) {
      setActiveTwinView("");
    }

    setActiveSection(id);
    scrollToId(id);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();

    const value = sanitizeSearchInput(searchText).trim().toLowerCase();

    if (!value) return;

    setSearchText(value);

    if (
      value.includes("weather") ||
      value.includes("rain") ||
      value.includes("forecast") ||
      value.includes("wind")
    ) {
      scrollToWeather();
      return;
    }

    if (
      value.includes("evac") ||
      value.includes("map") ||
      value.includes("barangay") ||
      value.includes("shelter")
    ) {
      scrollToMap();
      return;
    }

    if (
      value.includes("hazard") ||
      value.includes("flood") ||
      value.includes("risk")
    ) {
      scrollToId("hazard-focus");
      return;
    }

    if (
      value.includes("incident") ||
      value.includes("report") ||
      value.includes("resolved") ||
      value.includes("emergency case")
    ) {
      scrollToId("incident-focus");
      return;
    }

    if (
      value.includes("announcement") ||
      value.includes("update") ||
      value.includes("advisory")
    ) {
      scrollToUpdates();
      return;
    }

    if (
      value.includes("prepared") ||
      value.includes("guide") ||
      value.includes("tip") ||
      value.includes("safety")
    ) {
      scrollToPreparedness();
      return;
    }

    if (
      value.includes("contact") ||
      value.includes("office") ||
      value.includes("hotline") ||
      value.includes("email")
    ) {
      scrollToFooter();
      return;
    }

    scrollToId("home");
  }

  async function detectRole() {
    try {
      const res = await fetch(`${BASE_URL}/api/debug-session`, {
        credentials: "include",
      });

      if (!res.ok) {
        setUserRole("");
        return;
      }

      const data = await res.json();
      const sessionRole = safeLower(data?.role || data?.session?.role || "");

      if (sessionRole === "admin" || sessionRole === "drrmo") {
        setUserRole(sessionRole);
        return;
      }

      setUserRole("");
    } catch (err) {
      setUserRole("");
    }
  }

  function goBackToModules() {
    const role = safeLower(userRole);

    if (role === "admin") {
      navigate("/admin/dashboard");
      return;
    }

    if (role === "drrmo") {
      navigate("/drrmo/dashboard");
      return;
    }

    navigate(-1);
  }

  async function loadPublicContent() {
    try {
      const res = await fetch(`${BASE_URL}/api/public-site`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        const source = data?.data || data;
        const normalized = normalizeSitePayload(source);

        setSiteContent(normalized);
        setDraftContent(normalized);
        localStorage.setItem("publicSiteContent", JSON.stringify(normalized));
        return;
      }
    } catch (err) {
      // fallback below
    }

    const localData = safeJsonParse(
      localStorage.getItem("publicSiteContent"),
      DEFAULT_SITE_CONTENT
    );

    const normalized = normalizeSitePayload(localData);

    setSiteContent(normalized);
    setDraftContent(normalized);
  }

  async function fetchWeather() {
    setWeatherLoading(true);
    setWeatherError("");

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${JAEN_COORDS.latitude}` +
        `&longitude=${JAEN_COORDS.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
        `&timezone=auto&forecast_days=3`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data?.error) {
        throw new Error(data?.reason || "Unable to load weather.");
      }

      setWeather({
        current: data.current,
        daily: data.daily,
      });
    } catch (err) {
      setWeatherError("Weather unavailable right now.");
    } finally {
      setWeatherLoading(false);
    }
  }

  const fetchPublicPlaces = useCallback(async () => {
    setMapLoading(true);
    setMapError("");

    try {
      const res = await fetch(`${BASE_URL}/evacs/public`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load public evacuation areas.");
      }

      const data = await res.json();
      const payload = Array.isArray(data) ? data : [];

      setPublicPlaces(payload);
      setSelectedPublicPlaceId((prev) => prev || payload[0]?._id || null);
    } catch (err) {
      console.error("fetchPublicPlaces error:", err);
      setMapError("Public evacuation map is unavailable right now.");
      setPublicPlaces([]);
    } finally {
      setMapLoading(false);
    }
  }, []);

  const fetchPublicBarangayBounds = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/barangays/bounds`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load barangay boundaries.");
      }

      const data = await res.json();
      setPublicBarangayBounds(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("fetchPublicBarangayBounds error:", err);
      setPublicBarangayBounds([]);
    }
  }, []);

  const fetchHazardLayers = useCallback(async () => {
    setHazardLoading(true);
    setHazardError("");

    try {
      const res = await fetch(`${BASE_URL}/api/hazard-layers`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load hazard layers.");
      }

      const data = await res.json();
      setHazardLayers({
        safe: data?.safe || null,
        medium: data?.medium || null,
        susceptible: data?.susceptible || null,
      });
    } catch (err) {
      console.error("fetchHazardLayers error:", err);
      setHazardError("Hazard layer is unavailable right now.");
      setHazardLayers(null);
    } finally {
      setHazardLoading(false);
    }
  }, []);

  async function fetchPublicIncidents() {
    setIncidentsLoading(true);
    setIncidentsError("");

    try {
      const res = await fetch(`${BASE_URL}/incident/getIncidents`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load incidents.");
      }

      const data = await res.json();
      const payload = Array.isArray(data) ? data : [];

      setPublicIncidents(payload);
    } catch (err) {
      console.error("fetchPublicIncidents error:", err);
      setIncidentsError("Resolved incident information is unavailable right now.");
      setPublicIncidents([]);
    } finally {
      setIncidentsLoading(false);
    }
  }

  useEffect(() => {
    loadPublicContent();
    detectRole();
    fetchWeather();
    fetchPublicPlaces();
    fetchPublicBarangayBounds();
    fetchHazardLayers();
    fetchPublicIncidents();
  }, [fetchHazardLayers, fetchPublicBarangayBounds, fetchPublicPlaces]);

  function updateDraft(path, value) {
    setDraftContent((prev) => {
      const next =
        typeof structuredClone === "function"
          ? structuredClone(prev)
          : JSON.parse(JSON.stringify(prev));

      const keys = path.split(".");
      let ref = next;

      for (let i = 0; i < keys.length - 1; i += 1) {
        if (!ref[keys[i]]) ref[keys[i]] = {};
        ref = ref[keys[i]];
      }

      ref[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function updateArrayItem(section, index, field, value) {
    setDraftContent((prev) => {
      const nextItems = [...(prev[section] || [])];

      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };

      return {
        ...prev,
        [section]: nextItems,
      };
    });
  }

  function addItem(section, template) {
    setDraftContent((prev) => {
      if ((prev[section] || []).length >= LIMITS[section]) return prev;

      return {
        ...prev,
        [section]: [
          ...(prev[section] || []),
          {
            id: `${section}-${Date.now()}`,
            ...template,
          },
        ],
      };
    });
  }

  function removeItem(section, id) {
    setDraftContent((prev) => {
      const currentItems = prev[section] || [];

      if (currentItems.length <= 1) return prev;

      return {
        ...prev,
        [section]: currentItems.filter((item) => item.id !== id),
      };
    });
  }

  function startInlineEditing() {
    setDraftContent(siteContent);
    setSaveMessage("");
    setIsEditorOpen(true);
  }

  function closeInlineEditing() {
    setDraftContent(siteContent);
    setSaveMessage("");
    setIsEditorOpen(false);
  }

  function resetDraftContent() {
    setDraftContent(siteContent);
    setSaveMessage("Draft reset to current saved content.");
  }

  async function saveSiteContent() {
    if (!canEdit) return;

    setIsSaving(true);
    setSaveMessage("");

    const trimmedPayload = normalizeSitePayload({
      ...draftContent,
      announcements: (draftContent.announcements || []).map((item) => ({
        ...item,
        title: item.title?.slice(0, 80) || "",
        body: item.body?.slice(0, 180) || "",
        tag: item.tag?.slice(0, 32) || "",
      })),
      tips: (draftContent.tips || []).map((item) => ({
        ...item,
        text: item.text?.slice(0, 120) || "",
      })),
      hotlines: (draftContent.hotlines || []).map((item) => ({
        ...item,
        label: item.label?.slice(0, 40) || "",
        number: item.number?.slice(0, 120) || "",
        type: item.type || "call",
      })),
      hero: {
        ...draftContent.hero,
        title: draftContent.hero?.title?.slice(0, 90) || "",
        subtitle: draftContent.hero?.subtitle?.slice(0, 180) || "",
        primaryCtaLabel:
          draftContent.hero?.primaryCtaLabel?.slice(0, 24) || "",
        secondaryCtaLabel:
          draftContent.hero?.secondaryCtaLabel?.slice(0, 24) || "",
      },
      alert: {
        ...draftContent.alert,
        level: draftContent.alert?.level?.slice(0, 20) || "",
        text: draftContent.alert?.text?.slice(0, 180) || "",
        enabled: Boolean(draftContent.alert?.enabled),
      },
      office: {
        ...draftContent.office,
        name: draftContent.office?.name?.slice(0, 50) || "",
        address: draftContent.office?.address?.slice(0, 120) || "",
        hours: draftContent.office?.hours?.slice(0, 120) || "",
        email: draftContent.office?.email?.slice(0, 80) || "",
        facebook: draftContent.office?.facebook?.slice(0, 120) || "",
      },
      heroImages: (draftContent.heroImages || []).map((item) => ({
        _id: item?._id,
        fileName: item?.fileName?.slice(0, 200) || "",
        fileUrl: item?.fileUrl || "",
        public_id: item?.public_id || "",
        caption: item?.caption?.slice(0, 80) || "",
      })),
    });

    try {
      const res = await fetch(`${BASE_URL}/api/public-site`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(trimmedPayload),
      });

      if (!res.ok) {
        throw new Error("Failed to save.");
      }

      const result = await res.json();
      const normalized = normalizeSitePayload(result?.data || trimmedPayload);

      setSiteContent(normalized);
      setDraftContent(normalized);
      localStorage.setItem("publicSiteContent", JSON.stringify(normalized));
      setSaveMessage("Landing page updated.");
      setIsEditorOpen(false);
    } catch (err) {
      localStorage.setItem("publicSiteContent", JSON.stringify(trimmedPayload));
      setSiteContent(trimmedPayload);
      setDraftContent(trimmedPayload);
      setSaveMessage("Saved locally. Check API if database save is unavailable.");
      setIsEditorOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  function applyPublicSiteUpdate(nextContent, message) {
    const normalized = normalizeSitePayload(nextContent);
    setSiteContent(normalized);
    setDraftContent(normalized);
    localStorage.setItem("publicSiteContent", JSON.stringify(normalized));
    setSaveMessage(message || "");
  }

  async function handleHeroImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !canEdit) return;

    const formData = new FormData();
    formData.append("image", file);

    setIsUploadingHeroImage(true);
    setSaveMessage("");

    try {
      const res = await fetch(`${BASE_URL}/api/public-site/hero-images`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.message || "Failed to upload landing image.");
      }

      applyPublicSiteUpdate(result?.data || siteContent, "Landing image uploaded.");
    } catch (err) {
      setSaveMessage(err.message || "Failed to upload landing image.");
    } finally {
      setIsUploadingHeroImage(false);
      if (heroImageInputRef.current) {
        heroImageInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveHeroImage(imageId) {
    if (!canEdit || !imageId) return;

    setIsUploadingHeroImage(true);
    setSaveMessage("");

    try {
      const res = await fetch(`${BASE_URL}/api/public-site/hero-images/${imageId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.message || "Failed to remove landing image.");
      }

      applyPublicSiteUpdate(result?.data || siteContent, "Landing image removed.");
    } catch (err) {
      setSaveMessage(err.message || "Failed to remove landing image.");
    } finally {
      setIsUploadingHeroImage(false);
    }
  }

  async function handleMoveHeroImage(index, direction) {
    const currentImages = draftContent.heroImages || [];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (
      !canEdit ||
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= currentImages.length
    ) {
      return;
    }

    const reordered = [...currentImages];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setIsUploadingHeroImage(true);
    setSaveMessage("");

    try {
      const res = await fetch(`${BASE_URL}/api/public-site/hero-images/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageIds: reordered.map((item) => item._id),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.message || "Failed to reorder landing images.");
      }

      applyPublicSiteUpdate(
        result?.data || { ...siteContent, heroImages: reordered },
        "Landing image order updated."
      );
    } catch (err) {
      setSaveMessage(err.message || "Failed to reorder landing images.");
    } finally {
      setIsUploadingHeroImage(false);
    }
  }

  function updateHeroImageCaption(index, value) {
    setDraftContent((prev) => {
      const nextImages = [...(prev.heroImages || [])];
      if (!nextImages[index]) return prev;

      nextImages[index] = {
        ...nextImages[index],
        caption: value,
      };

      return {
        ...prev,
        heroImages: nextImages,
      };
    });
  }

  function getHotlineIcon(type) {
    const currentType = safeLower(type);

    if (currentType === "sms") return <FaSms />;
    if (currentType === "email") return <FaEnvelope />;
    if (currentType === "link") return <FaFacebookF />;

    return <FaPhoneAlt />;
  }

  return (
    <div
      className={`dashboard-page ${
        isInlineEditing ? "landing-inline-editing" : ""
      }`}
    >
      <div className="dashboard">
        <header className="dashboard-header">
          <div className="dashboard-header-shell">
            <div className="brand-left">
              {jaenlogo ? (
                <img src={jaenlogo} alt="Jaen Logo" className="logo-img" />
              ) : (
                <div className="logo-fallback">LOGO</div>
              )}

              <div className="brand-text">
                <div className="brand-topline">MUNICIPALITY OF JAEN</div>
                <div className="brand-name">JAEN, NUEVA ECIJA</div>
                <div className="brand-sub">
                  MDRRMO Public Safety and Information Portal
                </div>
              </div>
            </div>

            <div className="header-right">
              <div className="header-public-actions">
                <form className="header-search-wrap" onSubmit={handleSearchSubmit}>
                  <div className="header-search-shell">
                    <FaSearch className="header-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      className="header-search"
                      placeholder="Search weather, hazard, incident, barangay, contacts..."
                      value={searchText}
                      onChange={(e) =>
                        setSearchText(sanitizeSearchInput(e.target.value))
                      }
                    />
                  </div>
                </form>
              </div>

              {isPrivilegedUser && (
                <div className="mode-toggle-wrap">
                  <button
                    type="button"
                    className={`mode-toggle-btn ${
                      !isVisitorMode ? "active" : ""
                    }`}
                    onClick={() => setIsVisitorMode(false)}
                  >
                    <FaEdit />
                    <span>Editor Mode</span>
                  </button>

                  <button
                    type="button"
                    className={`mode-toggle-btn ${
                      isVisitorMode ? "active" : ""
                    }`}
                    onClick={() => {
                      setIsVisitorMode(true);
                      setIsEditorOpen(false);
                    }}
                  >
                    <FaEye />
                    <span>Visitor Mode</span>
                  </button>
                </div>
              )}

              {isPrivilegedUser && (
                <button
                  className="editor-toggle-btn"
                  onClick={goBackToModules}
                  type="button"
                >
                  <span>Back</span>
                </button>
              )}

              {canEdit && !isInlineEditing && (
                <button
                  className="editor-toggle-btn"
                  onClick={startInlineEditing}
                  type="button"
                >
                  <FaEdit />
                  <span>Edit Landing</span>
                </button>
              )}

              {canEdit && isInlineEditing && (
                <button
                  className="editor-toggle-btn"
                  onClick={closeInlineEditing}
                  type="button"
                  disabled={isSaving}
                >
                  <FaTimes />
                  <span>Close Editor</span>
                </button>
              )}
            </div>
          </div>

          <div className="dashboard-nav-shell">
            <nav className="nav-links" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-link-btn ${
                    activeSection === item.id ? "active" : ""
                  }`}
                  onClick={() => handleNavClick(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="header-twin-links" aria-label="Twin views">
              {TWIN_NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-link-btn twin-link-btn ${
                    activeSection === item.id ? "active" : ""
                  }`}
                  onClick={() => handleNavClick(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {isTwinViewActive ? (
          <section className="landing-twin-shell" id={activeTwinView}>
            <div className="landing-wide-shell">
              {activeTwinView === "digital-twin" ? (
                <PublicDigitalTwinPanel />
              ) : (
                <FloodVirtualTwin />
              )}
            </div>
          </section>
        ) : (
          <>
        {isPrivilegedUser && (
          <section className="mode-preview-bar">
            <div className="mode-preview-left">
              {isVisitorMode ? <FaEye /> : <FaEyeSlash />}
              <strong>{isVisitorMode ? "Visitor Mode" : "Editor Mode"}</strong>
            </div>

            <p>
              {isVisitorMode
                ? "You are previewing the public landing page exactly like a normal visitor."
                : isInlineEditing
                ? "Inline editing is active. Public text fields are now editable directly on the landing page."
                : "You can edit the landing page. Click Edit Landing to turn the public text into editable fields."}
            </p>
          </section>
        )}

        {isInlineEditing && (
          <section className="inline-editor-toolbar">
            <div className="inline-editor-toolbar-left">
              <FaEdit />
              <div>
                <strong>Inline Landing Editor</strong>
                <span>Edit text directly on the page. Save when finished.</span>
              </div>
            </div>

            <div className="inline-editor-toolbar-actions">
              {saveMessage && (
                <span className="inline-save-message">{saveMessage}</span>
              )}

              <button
                type="button"
                className="inline-editor-action secondary"
                onClick={resetDraftContent}
                disabled={isSaving}
              >
                Reset
              </button>

              <button
                type="button"
                className="inline-editor-action primary"
                onClick={saveSiteContent}
                disabled={isSaving}
              >
                <FaSave />
                {isSaving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                className="inline-editor-action ghost"
                onClick={closeInlineEditing}
                disabled={isSaving}
              >
                <FaTimes />
                Close
              </button>
            </div>
          </section>
        )}

        {(pageContent.alert.enabled || isInlineEditing) && (
          <section
            className={`alert-strip ${
              !pageContent.alert.enabled ? "alert-strip-disabled" : ""
            }`}
            aria-label="Public advisory"
          >
            <div className="alert-left">
              <FaBell />

              {isInlineEditing ? (
                <input
                  className="landing-inline-input alert-level-input"
                  type="text"
                  value={draftContent.alert.level}
                  maxLength={20}
                  onChange={(e) => updateDraft("alert.level", e.target.value)}
                  placeholder="Alert level"
                />
              ) : (
                <span
                  className={`alert-badge alert-${safeLower(
                    pageContent.alert.level
                  )}`}
                >
                  {pageContent.alert.level}
                </span>
              )}
            </div>

            {isInlineEditing ? (
              <textarea
                className="landing-inline-textarea alert-text-input"
                value={draftContent.alert.text}
                maxLength={180}
                rows={2}
                onChange={(e) => updateDraft("alert.text", e.target.value)}
                placeholder="Public advisory text"
              />
            ) : (
              <p>{pageContent.alert.text}</p>
            )}

            {isInlineEditing && (
              <label className="inline-check-control">
                <input
                  type="checkbox"
                  checked={Boolean(draftContent.alert.enabled)}
                  onChange={(e) => updateDraft("alert.enabled", e.target.checked)}
                />
                <span>Show alert</span>
              </label>
            )}
          </section>
        )}

        <section
          className={`landing-hero ${heroBg ? "landing-hero-has-bg" : ""}`}
          style={heroBg ? { backgroundImage: `url(${heroBg})` } : {}}
          id="home"
        >
          <div className="landing-hero-overlay">
            <div className="landing-wide-shell">
              <div className="landing-hero-grid">
                <div className="landing-hero-copy">
                  <div className="hero-kicker">
                    Municipal Disaster Risk Reduction and Management Office
                  </div>

                  {isInlineEditing ? (
                    <div className="inline-edit-block hero-edit-block">
                      <label className="inline-edit-label">Hero Title</label>
                      <textarea
                        className="landing-inline-textarea hero-title-input"
                        value={draftContent.hero.title}
                        maxLength={90}
                        rows={2}
                        onChange={(e) => updateDraft("hero.title", e.target.value)}
                        placeholder="Hero title"
                      />

                      <label className="inline-edit-label">Hero Subtitle</label>
                      <textarea
                        className="landing-inline-textarea hero-subtitle-input"
                        value={draftContent.hero.subtitle}
                        maxLength={180}
                        rows={3}
                        onChange={(e) =>
                          updateDraft("hero.subtitle", e.target.value)
                        }
                        placeholder="Hero subtitle"
                      />
                    </div>
                  ) : (
                    <>
                      <h1>{pageContent.hero.title}</h1>
                      <p>{pageContent.hero.subtitle}</p>
                    </>
                  )}

                  {isInlineEditing && (
                    <div className="landing-hero-image-manager">
                      <div className="landing-hero-image-manager-head">
                        <div>
                          <strong>Hero Images</strong>
                          <span>Upload, remove, and reorder the landing visuals.</span>
                        </div>

                        <div className="landing-hero-image-manager-actions">
                          <input
                            ref={heroImageInputRef}
                            type="file"
                            accept="image/*"
                            className="landing-image-input-hidden"
                            onChange={handleHeroImageUpload}
                            disabled={isUploadingHeroImage}
                          />

                          <button
                            type="button"
                            className="landing-hero-image-upload-btn"
                            onClick={() => heroImageInputRef.current?.click()}
                            disabled={isUploadingHeroImage}
                          >
                            <FaUpload />
                            {isUploadingHeroImage ? "Uploading..." : "Upload Image"}
                          </button>
                        </div>
                      </div>

                      {draftContent.heroImages?.length ? (
                        <div className="landing-hero-image-grid">
                          {draftContent.heroImages.map((image, index) => (
                            <div className="landing-hero-image-card" key={image._id}>
                              <div
                                className="landing-hero-image-preview"
                                style={{ backgroundImage: `url(${image.fileUrl})` }}
                              />

                              <div className="landing-hero-image-copy">
                                <strong>{image.fileName || `Image ${index + 1}`}</strong>
                                <span>Slide {index + 1}</span>
                              </div>

                              <label className="inline-edit-label">Caption</label>
                              <input
                                type="text"
                                className="landing-inline-input"
                                value={image.caption || ""}
                                maxLength={80}
                                onChange={(e) =>
                                  updateHeroImageCaption(index, e.target.value)
                                }
                                placeholder="Optional caption"
                              />

                              <div className="landing-hero-image-card-actions">
                                <button
                                  type="button"
                                  className="landing-hero-card-btn"
                                  onClick={() => handleMoveHeroImage(index, "up")}
                                  disabled={index === 0 || isUploadingHeroImage}
                                  title="Move image up"
                                >
                                  <FaArrowUp />
                                </button>

                                <button
                                  type="button"
                                  className="landing-hero-card-btn"
                                  onClick={() => handleMoveHeroImage(index, "down")}
                                  disabled={
                                    index === (draftContent.heroImages?.length || 0) - 1 ||
                                    isUploadingHeroImage
                                  }
                                  title="Move image down"
                                >
                                  <FaArrowDown />
                                </button>

                                <button
                                  type="button"
                                  className="landing-hero-card-btn danger"
                                  onClick={() => handleRemoveHeroImage(image._id)}
                                  disabled={isUploadingHeroImage}
                                  title="Remove image"
                                >
                                  <FaTrash />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="landing-hero-image-empty">
                          Upload a custom hero image to replace the default landing visuals.
                        </div>
                      )}
                    </div>
                  )}

                </div>

                <div className="landing-hero-side">
                  <div className="hero-status-panel">
                    <div className="hero-status-head">
                      <span>Current focus</span>
                      <strong>{focusedBarangayLabel}</strong>
                    </div>

                    {weatherLoading ? (
                      <div className="weather-loading-box">Loading weather…</div>
                    ) : weatherError ? (
                      <div className="weather-loading-box error">
                        {weatherError}
                      </div>
                    ) : (
                      <div
                        className={`hero-weather-compact tone-${weatherIconTone(
                          topWeather?.weather_code
                        )}`}
                      >
                        <div className="hero-weather-compact-main">
                          <div className="hero-weather-icon">
                            <FaCloudSun />
                          </div>

                          <div className="hero-weather-compact-copy">
                            <strong>
                              {Math.round(topWeather?.temperature_2m || 0)}°C
                            </strong>
                            <span>{weatherCodeLabel(topWeather?.weather_code)}</span>
                          </div>

                          <div className="hero-weather-compact-rain">
                            <label>Rain</label>
                            <b>{todaySummary.rain}%</b>
                          </div>
                        </div>

                        <div className="hero-weather-compact-grid">
                          <div>
                            <label>High / Low</label>
                            <strong>
                              {todaySummary.high}° / {todaySummary.low}°
                            </strong>
                          </div>

                          <div>
                            <label>Feels Like</label>
                            <strong>
                              {Math.round(topWeather?.apparent_temperature || 0)}°
                            </strong>
                          </div>

                          <div>
                            <label>Humidity</label>
                            <strong>{topWeather?.relative_humidity_2m ?? 0}%</strong>
                          </div>

                          <div>
                            <label>Wind</label>
                            <strong>
                              {Math.round(topWeather?.wind_speed_10m || 0)} km/h
                            </strong>
                          </div>
                        </div>

                        <div className="hero-weather-note">
                          {getRainAdvisory(todaySummary.rain)}
                        </div>
                      </div>
                    )}

                    <div className="hero-incident-compact">
                      <div>
                        <span>Resolved incidents</span>
                        <strong>{formatNumber(incidentSummary.resolved)}</strong>
                      </div>
                      <div>
                        <span>Active reports</span>
                        <strong>
                          {formatNumber(
                            incidentSummary.reported + incidentSummary.onProcess
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-lower-dock">
                <div className="hero-highlights">
                  <div className="hero-highlight-card">
                    <FaCloudSun />
                    <div>
                      <strong>Live Weather Outlook</strong>
                      <span>Quick rain, wind, and temperature view for Jaen.</span>
                    </div>
                  </div>

                  <div className="hero-highlight-card">
                    <FaMap />
                    <div>
                      <strong>Barangay-Based Public Map</strong>
                      <span>Focus the page on a specific barangay when needed.</span>
                    </div>
                  </div>

                  <div className="hero-highlight-card">
                    <FaBell />
                    <div>
                      <strong>Official Advisories</strong>
                      <span>Updates, preparedness, contacts, and public guidance.</span>
                    </div>
                  </div>
                </div>

                <div className="hero-slide-indicators" aria-hidden="true">
                  {activeHeroImages.map((_, index) => (
                    <span
                      key={`hero-dot-${index}`}
                      className={`hero-slide-dot ${
                        currentHero === index ? "active" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <main className="landing-main">
          <div className="landing-wide-shell">
            <section className="weather-landing-section" id="weather">
              <div className="landing-section-head landing-section-head-spread">
                <div>
                  <span className="section-kicker">Weather Overview</span>
                  <h2>Local Weather Forecast</h2>
                  <p>
                    Today’s conditions, rain outlook, and short-term forecast for
                    Jaen.
                  </p>
                </div>

                <button
                  className="inline-action-btn"
                  onClick={fetchWeather}
                  type="button"
                >
                  Refresh
                </button>
              </div>

              {weatherLoading ? (
                <div className="panel-empty">Loading weather…</div>
              ) : weatherError ? (
                <div className="panel-empty error">{weatherError}</div>
              ) : (
                <section
                  className={`weather-connected-surface tone-${weatherIconTone(
                    topWeather?.weather_code
                  )}`}
                >
                  <div className="weather-connected-main">
                    <div className="weather-connected-summary">
                      <div className="weather-connected-heading">
                        <span className="muted-label">
                          Now in {focusedBarangayLabel}
                        </span>

                        <div className="weather-connected-pill">
                          <FaCloudSun />
                          <span>{todaySummary.rain}% rain chance</span>
                        </div>
                      </div>

                      <div className="weather-connected-temp-row">
                        <div className="weather-connected-temp-block">
                          <h3>{Math.round(topWeather?.temperature_2m || 0)}°C</h3>
                          <p>{weatherCodeLabel(topWeather?.weather_code)}</p>
                        </div>

                        <div className="weather-connected-story">
                          <strong>Today at a glance</strong>
                          <span>
                            {getRainAdvisory(todaySummary.rain)} with expected
                            high of {todaySummary.high}° and low of{" "}
                            {todaySummary.low}°.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="weather-connected-stats">
                      <div className="weather-connected-stat">
                        <label>Feels Like</label>
                        <strong>
                          {Math.round(topWeather?.apparent_temperature || 0)}°C
                        </strong>
                      </div>

                      <div className="weather-connected-stat">
                        <label>Humidity</label>
                        <strong>{topWeather?.relative_humidity_2m ?? 0}%</strong>
                      </div>

                      <div className="weather-connected-stat">
                        <label>Wind</label>
                        <strong>
                          {Math.round(topWeather?.wind_speed_10m || 0)} km/h
                        </strong>
                      </div>

                      <div className="weather-connected-stat">
                        <label>High / Low</label>
                        <strong>
                          {todaySummary.high}° / {todaySummary.low}°
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="weather-connected-forecast">
                    {forecastCards.map((item) => (
                      <article
                        key={item.key}
                        className={`weather-outlook-card tone-${weatherIconTone(
                          item.code
                        )}`}
                      >
                        <div className="weather-outlook-head">
                          <div>
                            <span>{item.label}</span>
                            <small>{item.condition}</small>
                          </div>
                        </div>

                        <div className="weather-outlook-temp">
                          <strong>{item.high}°</strong>
                          <span>{item.low}°</span>
                        </div>

                        <div className="weather-outlook-rain">
                          {item.rain}% rain
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>

                        <section className="landing-content-grid">
              <section className="landing-map-column" id="public-evac-map">
                <div className="landing-map-shell">
                  <div className="landing-section-head">
                    <div>
                      <span className="section-kicker">Evacuation Areas</span>
                      <h2>Public Evacuation Map</h2>
                    </div>
                  </div>

                  <div className="public-map-toolbar">
                    <label className="public-map-filter">
                      <span>Barangay</span>
                      <select
                        value={publicBarangayFilter}
                        onChange={(e) =>
                          handlePublicBarangayFilterChange(e.target.value)
                        }
                      >
                        <option value="all">All Barangays</option>
                        {publicBarangayOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    {publicSelectedBarangays.length ? (
                      <button
                        type="button"
                        className="public-map-clear-selection"
                        onClick={() => handlePublicBarangayFilterChange("all")}
                      >
                        Clear Barangays
                      </button>
                    ) : null}

                    <div className="public-map-mini-summary">
                      <span className="mini-status available">
                        {formatNumber(publicMapSummary.availableCount)} available
                      </span>
                      <span className="mini-status limited">
                        {formatNumber(publicMapSummary.limitedCount)} limited
                      </span>
                      <span className="mini-status full">
                        {formatNumber(publicMapSummary.fullCount)} full
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`public-hazard-toggle ${
                        showHazardOverlay ? "on" : "off"
                      }`}
                      onClick={() =>
                        setShowHazardOverlay((current) => !current)
                      }
                      disabled={hazardLoading || Boolean(hazardError)}
                    >
                      {showHazardOverlay ? "Hide Hazard Layer" : "Show Hazard Layer"}
                    </button>
                  </div>

                  {mapLoading ? (
                    <div className="panel-empty">Loading evacuation map…</div>
                  ) : mapError ? (
                    <div className="panel-empty error">{mapError}</div>
                  ) : (
                    <div className="landing-map-layout map-minimal-layout">
                      <div className="landing-map-main">
                        <div className="landing-map-stage map-dominant-stage">
                          <EvacMap
                            places={filteredPublicPlaces}
                            barangayBounds={publicBarangayBounds}
                            selectedPlaceId={selectedPublicPlaceId}
                            onSelectPlace={(place) =>
                              setSelectedPublicPlaceId(place?._id || null)
                            }
                            selectedBarangayName=""
                            selectedBarangayNames={publicSelectedBarangays}
                            onSelectBarangay={handlePublicBarangayFilterChange}
                            readOnly
                            publicMode
                            hazardLayers={hazardLayers}
                            showHazardOverlay={showHazardOverlay}
                          />

                          <div className="public-map-overlay legend-overlay">
                            <PublicMapLegend
                              showHazardOverlay={showHazardOverlay}
                            />
                          </div>

                          <div className="public-map-overlay place-overlay">
                            {selectedPublicPlace ? (
                              <div className="public-place-inline-card">
                                <strong>
                                  {selectedPublicPlace?.name || "Evacuation area"}
                                </strong>
                                <span
                                  className={`public-status-pill ${safeLower(
                                    selectedPublicPlace.capacityStatus
                                  )}`}
                                >
                                  {selectedPublicPlace.capacityStatus ||
                                    "Status unavailable"}
                                </span>
                                <small>
                                  {selectedPublicPlace.barangayName || "Unknown barangay"}
                                  {selectedPublicPlace.location
                                    ? ` • ${selectedPublicPlace.location}`
                                    : ""}
                                </small>
                              </div>
                            ) : (
                              <div className="public-place-inline-card empty">
                                <strong>Select an evacuation area</strong>
                                <small>Tap any marker on the map to preview status.</small>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <aside className="landing-side-column">
                <section className="landing-side-card focus-card" id="hazard-focus">
                  <div className="landing-section-head">
                    <span className="section-kicker">Hazard Focus</span>
                    <h2>Hazard Monitoring</h2>
                  </div>

                  <div className="focus-info-grid">
                    <div className="focus-info-item">
                      <label>Focused Barangay</label>
                      <strong>{focusedBarangayLabel}</strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Evac Areas Visible</label>
                      <strong>{formatNumber(publicMapSummary.total)}</strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Available</label>
                      <strong>
                        {formatNumber(publicMapSummary.availableCount)}
                      </strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Full</label>
                      <strong>{formatNumber(publicMapSummary.fullCount)}</strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Hazard Overlay</label>
                      <strong>
                        {hazardLoading
                          ? "Loading"
                          : hazardError
                          ? "Unavailable"
                          : showHazardOverlay
                          ? "Visible"
                          : "Hidden"}
                      </strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Susceptible Zones</label>
                      <strong>{formatNumber(hazardSummary.susceptible)}</strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Medium Zones</label>
                      <strong>{formatNumber(hazardSummary.medium)}</strong>
                    </div>

                    <div className="focus-info-item">
                      <label>Safe Zones</label>
                      <strong>{formatNumber(hazardSummary.safe)}</strong>
                    </div>
                  </div>

                  {hazardError ? (
                    <p className="landing-empty-copy">{hazardError}</p>
                  ) : null}
                </section>

                <section className="landing-side-card focus-card" id="incident-focus">
                  <div className="landing-section-head">
                    <span className="section-kicker">Incident Focus</span>
                    <h2>Incident Reports</h2>
                  </div>

                  {incidentsLoading ? (
                    <div className="panel-empty landing-incident-loading">
                      Loading incidents…
                    </div>
                  ) : incidentsError ? (
                    <div className="panel-empty error">{incidentsError}</div>
                  ) : (
                    <>
                      <div className="public-incident-summary-grid">
                        <div className="public-incident-stat">
                          <span className="public-incident-stat-icon success">
                            <FaCheckCircle />
                          </span>
                          <label>Resolved</label>
                          <strong>{formatNumber(incidentSummary.resolved)}</strong>
                        </div>

                        <div className="public-incident-stat">
                          <span className="public-incident-stat-icon neutral">
                            <FaBell />
                          </span>
                          <label>Total</label>
                          <strong>{formatNumber(incidentSummary.total)}</strong>
                        </div>
                      </div>

                      <div className="resolved-incident-public-list">
                        <div className="resolved-incident-public-head">
                          <h3>
                            {incidentFeedMode === "resolved-only"
                              ? "Recently Resolved"
                              : "Recent Incidents"}
                          </h3>
                          <span>{formatNumber(filteredIncidentFeedList.length)}</span>
                        </div>

                        {filteredIncidentFeedList.length ? (
                          filteredIncidentFeedList.map((incident) => (
                            <article
                              className="resolved-incident-public-card"
                              key={incident._id}
                            >
                              <div className="resolved-incident-public-top">
                                <span
                                  className={`resolved-severity-badge ${getSeverityTone(
                                    incident.level
                                  )}`}
                                >
                                  {incident.level || "unknown"}
                                </span>

                                <span className="resolved-status-badge">
                                  {getIncidentStatusLabel(incident.status)}
                                </span>
                              </div>

                              <h4>{incident.type || "Incident"}</h4>

                              <p>
                                {incident.location ||
                                  incident.address ||
                                  "Location not specified"}
                              </p>

                                <small>
                                 {incidentFeedMode === "resolved-only"
                                   ? "Resolved:"
                                   : "Updated:"}{" "}
                                 {formatDateTime(
                                   incident.updatedAt ||
                                     incident.createdAt ||
                                    incident.date ||
                                    incident.reportedAt
                                )}
                              </small>
                            </article>
                          ))
                        ) : (
                          <div className="resolved-incident-empty">
                            <FaCheckCircle />
                            <strong>
                              {incidentFeedMode === "resolved-only"
                                ? "No resolved incidents for this focus."
                                : "No incidents available for this focus."}
                            </strong>
                            <span>
                              {incidentFeedMode === "resolved-only"
                                ? "Resolved reports will appear here after incident status is marked as resolved."
                                : "Incident reports will appear here when available for this barangay focus."}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </aside>
            </section>

            <section className="lower-info-grid">
              <section className="landing-side-card updates-card" id="updates">
                <div className="landing-section-head landing-section-head-spread">
                  <div>
                    <span className="section-kicker">Official Notices</span>
                    <h2>More Official Updates</h2>
                  </div>

                  {isInlineEditing && (
                    <button
                      type="button"
                      className="inline-action-btn"
                      onClick={() =>
                        addItem("announcements", {
                          title: "New Announcement",
                          body: "Write the announcement details here.",
                          tag: "Public Advisory",
                        })
                      }
                      disabled={
                        (draftContent.announcements || []).length >=
                        LIMITS.announcements
                      }
                    >
                      Add Notice
                    </button>
                  )}
                </div>

                <div className="inline-list-stack">
                  {(pageContent.announcements || []).map((item, index) => (
                    <article
                      className={`inline-editable-item ${
                        isInlineEditing ? "is-editable" : ""
                      }`}
                      key={item.id || `announcement-${index}`}
                    >
                      {isInlineEditing ? (
                        <>
                          <div className="inline-edit-row">
                            <label className="inline-edit-mini-field">
                              <span>Tag</span>
                              <input
                                type="text"
                                className="landing-inline-input"
                                value={draftContent.announcements[index]?.tag || ""}
                                maxLength={32}
                                onChange={(e) =>
                                  updateArrayItem(
                                    "announcements",
                                    index,
                                    "tag",
                                    e.target.value
                                  )
                                }
                                placeholder="Notice tag"
                              />
                            </label>

                            <button
                              type="button"
                              className="inline-delete-btn"
                              onClick={() =>
                                removeItem(
                                  "announcements",
                                  draftContent.announcements[index]?.id
                                )
                              }
                              disabled={
                                (draftContent.announcements || []).length <= 1
                              }
                              title="Remove announcement"
                            >
                              <FaTrash />
                            </button>
                          </div>

                          <label className="inline-edit-field">
                            <span>Title</span>
                            <input
                              type="text"
                              className="landing-inline-input"
                              value={
                                draftContent.announcements[index]?.title || ""
                              }
                              maxLength={80}
                              onChange={(e) =>
                                updateArrayItem(
                                  "announcements",
                                  index,
                                  "title",
                                  e.target.value
                                )
                              }
                              placeholder="Announcement title"
                            />
                          </label>

                          <label className="inline-edit-field">
                            <span>Details</span>
                            <textarea
                              className="landing-inline-textarea"
                              value={draftContent.announcements[index]?.body || ""}
                              maxLength={180}
                              rows={4}
                              onChange={(e) =>
                                updateArrayItem(
                                  "announcements",
                                  index,
                                  "body",
                                  e.target.value
                                )
                              }
                              placeholder="Announcement details"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <p>{item.tag}</p>
                          <h3>{item.title}</h3>
                          <p>{item.body}</p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </section>

                            <section
                className="landing-side-card preparedness-card"
                id="preparedness"
              >
                <div className="landing-section-head landing-section-head-spread">
                  <div>
                    <span className="section-kicker">Preparedness</span>
                    <h2>What to Prepare</h2>
                  </div>

                  {isInlineEditing && (
                    <button
                      type="button"
                      className="inline-action-btn"
                      onClick={() =>
                        addItem("tips", {
                          text: "Write another preparedness reminder.",
                        })
                      }
                      disabled={(draftContent.tips || []).length >= LIMITS.tips}
                    >
                      Add Tip
                    </button>
                  )}
                </div>

                <div className="preparedness-list compact">
                  {(pageContent.tips || []).map((tip, index) => (
                    <div
                      className={`preparedness-item ${
                        isInlineEditing ? "is-editable" : ""
                      }`}
                      key={tip.id || `tip-${index}`}
                    >
                      <FaShieldAlt />

                      {isInlineEditing ? (
                        <div className="preparedness-inline-edit">
                          <input
                            type="text"
                            className="landing-inline-input"
                            value={draftContent.tips[index]?.text || ""}
                            maxLength={120}
                            onChange={(e) =>
                              updateArrayItem(
                                "tips",
                                index,
                                "text",
                                e.target.value
                              )
                            }
                            placeholder="Preparedness reminder"
                          />

                          <button
                            type="button"
                            className="inline-delete-btn"
                            onClick={() =>
                              removeItem("tips", draftContent.tips[index]?.id)
                            }
                            disabled={(draftContent.tips || []).length <= 1}
                            title="Remove tip"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      ) : (
                        <span>{tip.text}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </section>
          </div>

          <footer className="dashboard-footer site-footer" id="footer-info">
            <div className="landing-wide-shell">
              <div className="site-footer-main">
                <div className="site-footer-brand">
                  <div className="site-footer-brand-top">
                    {jaenlogo ? (
                      <img
                        src={jaenlogo}
                        alt="Jaen Logo"
                        className="site-footer-logo"
                      />
                    ) : (
                      <div className="site-footer-logo-fallback">J</div>
                    )}

                    <div className="site-footer-brand-copy">
                      {isInlineEditing ? (
                        <>
                          <label className="footer-inline-field">
                            <span>Office Name</span>
                            <input
                              type="text"
                              className="landing-inline-input"
                              value={draftContent.office.name}
                              maxLength={50}
                              onChange={(e) =>
                                updateDraft("office.name", e.target.value)
                              }
                              placeholder="Office name"
                            />
                          </label>

                          <label className="footer-inline-field">
                            <span>Address</span>
                            <input
                              type="text"
                              className="landing-inline-input"
                              value={draftContent.office.address}
                              maxLength={120}
                              onChange={(e) =>
                                updateDraft("office.address", e.target.value)
                              }
                              placeholder="Office address"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <strong>{pageContent.office.name}</strong>
                          <span>{pageContent.office.address}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="site-footer-description">
                    Official public portal for weather, advisories, evacuation
                    information, and emergency contact access in Jaen, Nueva Ecija.
                  </p>
                </div>

                <div className="site-footer-center">
                  <div className="site-footer-section-head">
                    <h3>Emergency Contacts</h3>

                    {isInlineEditing && (
                      <button
                        type="button"
                        className="inline-action-btn footer-add-btn"
                        onClick={() =>
                          addItem("hotlines", {
                            label: "New Contact",
                            number: "Enter contact detail",
                            type: "call",
                          })
                        }
                        disabled={
                          (draftContent.hotlines || []).length >= LIMITS.hotlines
                        }
                      >
                        Add Contact
                      </button>
                    )}
                  </div>

                  <div className="site-contact-list compact">
                    {(pageContent.hotlines || []).map((item, index) => (
                      <div
                        key={item.id || `${item.label}-${index}`}
                        className={`site-contact-row single-icon-layout ${
                          isInlineEditing ? "is-editable" : ""
                        }`}
                      >
                        <div className="site-contact-action-left">
                          <span className="site-contact-icon-badge">
                            {getHotlineIcon(item.type)}
                          </span>

                          <div className="site-contact-copy">
                            {isInlineEditing ? (
                              <>
                                <div className="footer-contact-edit-head">
                                  <label className="footer-inline-field">
                                    <span>Label</span>
                                    <input
                                      type="text"
                                      className="landing-inline-input"
                                      value={
                                        draftContent.hotlines[index]?.label || ""
                                      }
                                      maxLength={40}
                                      onChange={(e) =>
                                        updateArrayItem(
                                          "hotlines",
                                          index,
                                          "label",
                                          e.target.value
                                        )
                                      }
                                      placeholder="Contact label"
                                    />
                                  </label>

                                  <label className="footer-inline-field">
                                    <span>Type</span>
                                    <select
                                      className="landing-inline-input footer-contact-type"
                                      value={
                                        draftContent.hotlines[index]?.type ||
                                        "call"
                                      }
                                      onChange={(e) =>
                                        updateArrayItem(
                                          "hotlines",
                                          index,
                                          "type",
                                          e.target.value
                                        )
                                      }
                                    >
                                      <option value="call">Call</option>
                                      <option value="sms">SMS</option>
                                      <option value="email">Email</option>
                                      <option value="link">Link</option>
                                    </select>
                                  </label>

                                  <button
                                    type="button"
                                    className="inline-delete-btn footer-delete-btn"
                                    onClick={() =>
                                      removeItem(
                                        "hotlines",
                                        draftContent.hotlines[index]?.id
                                      )
                                    }
                                    disabled={
                                      (draftContent.hotlines || []).length <= 1
                                    }
                                    title="Remove contact"
                                  >
                                    <FaTrash />
                                  </button>
                                </div>

                                <label className="footer-inline-field">
                                  <span>Contact Detail</span>
                                  <input
                                    type="text"
                                    className="landing-inline-input"
                                    value={
                                      draftContent.hotlines[index]?.number || ""
                                    }
                                    maxLength={120}
                                    onChange={(e) =>
                                      updateArrayItem(
                                        "hotlines",
                                        index,
                                        "number",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Phone, SMS, email, or link"
                                  />
                                </label>
                              </>
                            ) : (
                              <>
                                <strong>{item.label}</strong>
                                <span>{item.number}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="site-footer-right">
                  <h3>Office Information</h3>

                  <div className="site-office-list compact">
                    <div className="site-office-row">
                      <FaMapMarkedAlt />

                      {isInlineEditing ? (
                        <label className="footer-inline-field full">
                          <span>Office Address</span>
                          <input
                            type="text"
                            className="landing-inline-input"
                            value={draftContent.office.address}
                            maxLength={120}
                            onChange={(e) =>
                              updateDraft("office.address", e.target.value)
                            }
                            placeholder="Office address"
                          />
                        </label>
                      ) : (
                        <span>{pageContent.office.address}</span>
                      )}
                    </div>

                    <div className="site-office-row">
                      <FaHome />

                      {isInlineEditing ? (
                        <label className="footer-inline-field full">
                          <span>Office Hours</span>
                          <input
                            type="text"
                            className="landing-inline-input"
                            value={draftContent.office.hours}
                            maxLength={120}
                            onChange={(e) =>
                              updateDraft("office.hours", e.target.value)
                            }
                            placeholder="Office hours"
                          />
                        </label>
                      ) : (
                        <span>{pageContent.office.hours}</span>
                      )}
                    </div>

                    <div className="site-office-row">
                      <FaEnvelope />

                      {isInlineEditing ? (
                        <label className="footer-inline-field full">
                          <span>Email Address</span>
                          <input
                            type="text"
                            className="landing-inline-input"
                            value={draftContent.office.email}
                            maxLength={80}
                            onChange={(e) =>
                              updateDraft("office.email", e.target.value)
                            }
                            placeholder="Office email"
                          />
                        </label>
                      ) : (
                        <span>{pageContent.office.email}</span>
                      )}
                    </div>

                    <div className="site-office-row">
                      <FaFacebookF />

                      {isInlineEditing ? (
                        <label className="footer-inline-field full">
                          <span>Facebook Page</span>
                          <input
                            type="text"
                            className="landing-inline-input"
                            value={draftContent.office.facebook}
                            maxLength={120}
                            onChange={(e) =>
                              updateDraft("office.facebook", e.target.value)
                            }
                            placeholder="Facebook page link"
                          />
                        </label>
                      ) : (
                        <span>{pageContent.office.facebook}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="site-footer-bottom site-footer-bottom-simple">
                <div className="site-footer-meta">
                  <span>Privacy</span>
                  <span>Terms</span>
                  <span>© 2026 Jaen MDRRMO</span>
                </div>
              </div>
            </div>
          </footer>
        </main>
          </>
        )}
      </div>
    </div>
  );
}
