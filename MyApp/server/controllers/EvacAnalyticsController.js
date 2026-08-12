const PDFDocument = require("pdfkit");
const EvacPlace = require("../models/EvacPlace");
const EHistory = require("../models/EvacHistory");
const { callAiAnalyticsProvider } = require("../utils/aiAnalyticsProvider");

const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || 2 * 60 * 60 * 1000);
let evacAiCache = null;
let evacAiCacheTime = 0;

/* =========================
   HELPERS
   ========================= */

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => normalizeString(value).toLowerCase();

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatWhole = (value) => Number(toNumber(value)).toLocaleString();

const safePercent = (value, total) => {
  const v = toNumber(value);
  const t = toNumber(total);
  if (t <= 0) return 0;
  return Math.round((v / t) * 100);
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
};

const startOfMonth = (date) => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const getDateKey = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateValue = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatLabel = (value) => {
  const text = normalizeString(value);
  if (!text) return "-";

  return text
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getAiSourceLabel = (ai) => {
  const source = normalizeLower(ai?.source);
  if (!ai?.aiAvailable || source === "rule_based_fallback") return "Rule-based Fallback";
  if (source === "bedrock") return "AWS Bedrock";
  if (source === "gemini") return "Gemini AI";
  return `${formatLabel(source || "AI")} AI`;
};

const incrementMap = (map, key, amount = 1) => {
  const finalKey = normalizeString(key) || "Unspecified";
  map[finalKey] = toNumber(map[finalKey]) + toNumber(amount);
};

const buildTopList = (map, labelKey = "name", valueKey = "value", limit = 8) => {
  return Object.entries(map)
    .map(([label, value]) => ({
      [labelKey]: label,
      [valueKey]: value,
    }))
    .sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]))
    .slice(0, limit);
};

const buildDailyTrend = (records = [], dateGetter, days = 7) => {
  const now = new Date();
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));

  const map = {};

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map[getDateKey(d)] = 0;
  }

  records.forEach((record) => {
    const date = dateGetter(record);
    if (!date) return;

    const key = getDateKey(date);
    if (map[key] !== undefined) {
      map[key] += 1;
    }
  });

  return Object.entries(map).map(([date, count]) => ({
    _id: date,
    date,
    count,
  }));
};

const average = (numbers = []) => {
  const valid = numbers.filter((num) => typeof num === "number" && !Number.isNaN(num));
  if (!valid.length) return 0;

  const total = valid.reduce((sum, num) => sum + num, 0);
  return Math.round((total / valid.length) * 10) / 10;
};

const buildAnalyticsSnapshot = async () => {
  const [places, histories] = await Promise.all([
    EvacPlace.find({ isArchived: false }).sort({ barangayName: 1, name: 1 }).lean(),
    EHistory.find({}).sort({ createdAt: -1 }).limit(300).lean(),
  ]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const statusBreakdown = {
    available: 0,
    limited: 0,
    full: 0,
  };

  const facilityBreakdown = {
    femaleCR: 0,
    maleCR: 0,
    commonCR: 0,
    potableWater: 0,
    nonPotableWater: 0,
    permanent: 0,
    covidFacility: 0,
    landingVisible: 0,
    requestVisible: 0,
  };

  const barangayPlaceMap = {};
  const barangayIndividualCapacityMap = {};
  const barangayFamilyCapacityMap = {};
  const barangayBedCapacityMap = {};
  const barangayFullMap = {};
  const barangayLimitedMap = {};
  const statusCapacityMap = {};
  const floorAreaMap = {};

  const summary = places.reduce(
    (acc, place) => {
      const status = normalizeLower(place.capacityStatus) || "available";
      const barangay = normalizeString(place.barangayName) || "Unspecified";
      const createdAt = place.createdAt ? new Date(place.createdAt) : null;

      if (statusBreakdown[status] !== undefined) {
        statusBreakdown[status] += 1;
      } else {
        statusBreakdown[status] = 1;
      }

      const individual = toNumber(place.capacityIndividual);
      const family = toNumber(place.capacityFamily);
      const beds = toNumber(place.bedCapacity);
      const currentOccupants = toNumber(place.currentOccupants);
      const currentFamilies = toNumber(place.currentFamilies);
      const occupiedBeds = toNumber(place.occupiedBeds);
      const floorArea = toNumber(place.floorArea);

      acc.totalPlaces += 1;
      acc.totalIndividualCapacity += individual;
      acc.totalFamilyCapacity += family;
      acc.totalBedCapacity += beds;
      acc.totalCurrentOccupants += currentOccupants;
      acc.totalCurrentFamilies += currentFamilies;
      acc.totalOccupiedBeds += occupiedBeds;
      acc.totalFloorArea += floorArea;

      if (place.femaleCR) facilityBreakdown.femaleCR += 1;
      if (place.maleCR) facilityBreakdown.maleCR += 1;
      if (place.commonCR) facilityBreakdown.commonCR += 1;
      if (place.potableWater) facilityBreakdown.potableWater += 1;
      if (place.nonPotableWater) facilityBreakdown.nonPotableWater += 1;
      if (place.isPermanent) facilityBreakdown.permanent += 1;
      if (place.isCovidFacility) facilityBreakdown.covidFacility += 1;
      if (place.showOnLanding !== false) facilityBreakdown.landingVisible += 1;
      if (place.isRequestVisible !== false) facilityBreakdown.requestVisible += 1;

      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        if (createdAt >= todayStart && createdAt <= todayEnd) acc.addedToday += 1;
        if (createdAt >= weekStart && createdAt <= todayEnd) acc.addedThisWeek += 1;
        if (createdAt >= monthStart && createdAt <= todayEnd) acc.addedThisMonth += 1;
      }

      incrementMap(barangayPlaceMap, barangay, 1);
      incrementMap(barangayIndividualCapacityMap, barangay, individual);
      incrementMap(barangayFamilyCapacityMap, barangay, family);
      incrementMap(barangayBedCapacityMap, barangay, beds);
      incrementMap(statusCapacityMap, status, individual);
      incrementMap(floorAreaMap, barangay, floorArea);

      if (status === "full") incrementMap(barangayFullMap, barangay, 1);
      if (status === "limited") incrementMap(barangayLimitedMap, barangay, 1);

      return acc;
    },
    {
      totalPlaces: 0,
      totalIndividualCapacity: 0,
      totalFamilyCapacity: 0,
      totalBedCapacity: 0,
      totalCurrentOccupants: 0,
      totalCurrentFamilies: 0,
      totalOccupiedBeds: 0,
      totalFloorArea: 0,
      addedToday: 0,
      addedThisWeek: 0,
      addedThisMonth: 0,
    }
  );

  summary.availablePlaces = toNumber(statusBreakdown.available);
  summary.limitedPlaces = toNumber(statusBreakdown.limited);
  summary.fullPlaces = toNumber(statusBreakdown.full);

  summary.availableRate = safePercent(summary.availablePlaces, summary.totalPlaces);
  summary.limitedRate = safePercent(summary.limitedPlaces, summary.totalPlaces);
  summary.fullRate = safePercent(summary.fullPlaces, summary.totalPlaces);
  summary.landingVisibilityRate = safePercent(facilityBreakdown.landingVisible, summary.totalPlaces);
  summary.potableWaterRate = safePercent(facilityBreakdown.potableWater, summary.totalPlaces);
  summary.crCoverageRate = safePercent(
    places.filter((p) => p.femaleCR || p.maleCR || p.commonCR).length,
    summary.totalPlaces
  );

  summary.averageIndividualCapacity = average(places.map((p) => toNumber(p.capacityIndividual)));
  summary.averageFamilyCapacity = average(places.map((p) => toNumber(p.capacityFamily)));
  summary.averageBedCapacity = average(places.map((p) => toNumber(p.bedCapacity)));
  summary.occupancyRate = safePercent(
    summary.totalCurrentOccupants,
    summary.totalIndividualCapacity
  );
  summary.bedOccupancyRate = safePercent(summary.totalOccupiedBeds, summary.totalBedCapacity);

  const barangayBreakdown = Object.keys(barangayPlaceMap)
    .map((barangayName) => {
      const barangayPlaces = places.filter(
        (place) => normalizeString(place.barangayName) === barangayName
      );

      return {
        barangayName,
        totalPlaces: toNumber(barangayPlaceMap[barangayName]),
        available: barangayPlaces.filter((p) => normalizeLower(p.capacityStatus) === "available")
          .length,
        limited: barangayPlaces.filter((p) => normalizeLower(p.capacityStatus) === "limited")
          .length,
        full: barangayPlaces.filter((p) => normalizeLower(p.capacityStatus) === "full").length,
        totalIndividualCapacity: toNumber(barangayIndividualCapacityMap[barangayName]),
        totalFamilyCapacity: toNumber(barangayFamilyCapacityMap[barangayName]),
        totalBedCapacity: toNumber(barangayBedCapacityMap[barangayName]),
        totalFloorArea: toNumber(floorAreaMap[barangayName]),
      };
    })
    .sort((a, b) => b.totalIndividualCapacity - a.totalIndividualCapacity);

  const criticalBarangays = barangayBreakdown
    .filter((item) => item.full > 0 || item.available === 0)
    .sort((a, b) => b.full - a.full || b.limited - a.limited)
    .slice(0, 8);

  const topBarangaysByPlaces = buildTopList(barangayPlaceMap, "barangayName", "totalPlaces", 8);
  const topBarangaysByIndividualCapacity = buildTopList(
    barangayIndividualCapacityMap,
    "barangayName",
    "totalIndividualCapacity",
    8
  );
  const topBarangaysByFamilyCapacity = buildTopList(
    barangayFamilyCapacityMap,
    "barangayName",
    "totalFamilyCapacity",
    8
  );
  const topBarangaysByBedCapacity = buildTopList(
    barangayBedCapacityMap,
    "barangayName",
    "totalBedCapacity",
    8
  );
  const topBarangaysByFloorArea = buildTopList(
    floorAreaMap,
    "barangayName",
    "totalFloorArea",
    8
  );

  const highCapacityPlaces = places
    .map((place) => ({
      _id: place._id,
      name: place.name,
      barangayName: place.barangayName,
      location: place.location,
      capacityStatus: place.capacityStatus,
      capacityIndividual: toNumber(place.capacityIndividual),
      capacityFamily: toNumber(place.capacityFamily),
      bedCapacity: toNumber(place.bedCapacity),
      currentOccupants: toNumber(place.currentOccupants),
      currentFamilies: toNumber(place.currentFamilies),
      occupiedBeds: toNumber(place.occupiedBeds),
      occupancyPercent: safePercent(
        toNumber(place.currentOccupants),
        toNumber(place.capacityIndividual)
      ),
      isPermanent: Boolean(place.isPermanent),
      showOnLanding: place.showOnLanding !== false,
    }))
    .sort((a, b) => b.capacityIndividual - a.capacityIndividual)
    .slice(0, 8);

  const attentionPlaces = places
    .filter((place) => {
      const status = normalizeLower(place.capacityStatus);
      return status === "full" || status === "limited" || !place.potableWater;
    })
    .map((place) => ({
      _id: place._id,
      name: place.name,
      barangayName: place.barangayName,
      capacityStatus: place.capacityStatus,
      capacityIndividual: toNumber(place.capacityIndividual),
      capacityFamily: toNumber(place.capacityFamily),
      bedCapacity: toNumber(place.bedCapacity),
      currentOccupants: toNumber(place.currentOccupants),
      currentFamilies: toNumber(place.currentFamilies),
      occupiedBeds: toNumber(place.occupiedBeds),
      occupancyPercent: safePercent(
        toNumber(place.currentOccupants),
        toNumber(place.capacityIndividual)
      ),
      potableWater: Boolean(place.potableWater),
      showOnLanding: place.showOnLanding !== false,
    }))
    .sort((a, b) => {
      const rank = { full: 3, limited: 2, available: 1 };
      return rank[normalizeLower(b.capacityStatus)] - rank[normalizeLower(a.capacityStatus)];
    })
    .slice(0, 8);

  const actionBreakdown = histories.reduce((acc, item) => {
    incrementMap(acc, item.action || "UNKNOWN", 1);
    return acc;
  }, {});

  const roleBreakdown = histories.reduce((acc, item) => {
    incrementMap(acc, item.performedByRole || "unknown", 1);
    return acc;
  }, {});

  const historySummary = histories.reduce(
    (acc, item) => {
      const date = item.createdAt ? new Date(item.createdAt) : null;

      acc.totalHistoryLogs += 1;

      if (date && !Number.isNaN(date.getTime())) {
        if (date >= todayStart && date <= todayEnd) acc.logsToday += 1;
        if (date >= weekStart && date <= todayEnd) acc.logsThisWeek += 1;
        if (date >= monthStart && date <= todayEnd) acc.logsThisMonth += 1;
      }

      return acc;
    },
    {
      totalHistoryLogs: 0,
      logsToday: 0,
      logsThisWeek: 0,
      logsThisMonth: 0,
    }
  );

  const placeTrend = buildDailyTrend(places, (place) => place.createdAt, 7);
  const activityTrend = buildDailyTrend(histories, (item) => item.createdAt, 7);

  const recentActivities = histories.slice(0, 8).map((item) => ({
    _id: item._id,
    action: item.action,
    placeName: item.placeName,
    barangayName: item.barangayName,
    performedBy: item.performedBy,
    performedByRole: item.performedByRole,
    createdAt: item.createdAt,
  }));

  return {
    generatedAt: new Date(),
    summary,
    historySummary,
    statusBreakdown,
    facilityBreakdown,
    barangayBreakdown,
    criticalBarangays,
    topBarangaysByPlaces,
    topBarangaysByIndividualCapacity,
    topBarangaysByFamilyCapacity,
    topBarangaysByBedCapacity,
    topBarangaysByFloorArea,
    highCapacityPlaces,
    attentionPlaces,
    actionBreakdown,
    roleBreakdown,
    placeTrend,
    activityTrend,
    recentActivities,
  };
};

/* =========================
   AI INSIGHTS
   ========================= */

const buildRuleBasedAi = (snapshot, fallbackReason = "") => {
  const { summary, criticalBarangays, attentionPlaces, facilityBreakdown } = snapshot;
  const insights = [];

  if (summary.fullPlaces > 0) {
    insights.push({
      type: "full_evacuation_areas",
      severity: "warning",
      title: "Full evacuation areas detected",
      message: `${summary.fullPlaces} evacuation area${
        summary.fullPlaces === 1 ? " is" : "s are"
      } marked full.`,
      action: "Check nearby available or limited evacuation areas for overflow planning.",
    });
  }

  if (summary.limitedPlaces > 0) {
    insights.push({
      type: "limited_capacity",
      severity: "notice",
      title: "Limited capacity areas need monitoring",
      message: `${summary.limitedPlaces} evacuation area${
        summary.limitedPlaces === 1 ? " is" : "s are"
      } marked limited.`,
      action: "Monitor status changes and prepare backup facilities.",
    });
  }

  if (criticalBarangays.length > 0) {
    insights.push({
      type: "barangay_capacity_attention",
      severity: "warning",
      title: "Barangay capacity attention needed",
      message: `${criticalBarangays.length} barangay record${
        criticalBarangays.length === 1 ? "" : "s"
      } show full areas or no available areas.`,
      action: "Review barangay-level capacity distribution before emergencies peak.",
    });
  }

  if (summary.potableWaterRate < 70 && summary.totalPlaces > 0) {
    insights.push({
      type: "potable_water_gap",
      severity: "warning",
      title: "Potable water coverage is low",
      message: `${summary.potableWaterRate}% of active evacuation areas have potable water marked available.`,
      action: "Prioritize water readiness checks for evacuation areas without potable water.",
    });
  }

  if (summary.crCoverageRate < 70 && summary.totalPlaces > 0) {
    insights.push({
      type: "comfort_room_gap",
      severity: "notice",
      title: "CR coverage needs review",
      message: `${summary.crCoverageRate}% of active evacuation areas have at least one CR type marked.`,
      action: "Validate CR availability for facilities missing sanitation details.",
    });
  }

  if (facilityBreakdown.landingVisible < summary.totalPlaces) {
    const hidden = summary.totalPlaces - facilityBreakdown.landingVisible;

    insights.push({
      type: "landing_visibility_gap",
      severity: "info",
      title: "Some areas are hidden from landing page",
      message: `${hidden} evacuation area${hidden === 1 ? "" : "s"} are not visible publicly.`,
      action: "Confirm whether hidden evacuation areas should remain internal only.",
    });
  }

  if (!insights.length) {
    insights.push({
      type: "stable_evacuation_readiness",
      severity: "success",
      title: "Evacuation readiness looks stable",
      message: "No urgent evacuation area capacity or facility issue was detected.",
      action: "Continue monitoring capacity status, public visibility, and facility readiness.",
    });
  }

  const severityRank = {
    critical: 4,
    warning: 3,
    notice: 2,
    info: 1,
    success: 0,
  };

  const overallSeverity = insights.reduce((highest, insight) => {
    return severityRank[insight.severity] > severityRank[highest]
      ? insight.severity
      : highest;
  }, "success");

  return {
    generatedAt: new Date(),
    source: "rule_based_fallback",
    model: "local_rules",
    aiAvailable: false,
    overallSeverity,
    executiveSummary:
      fallbackReason ||
      (overallSeverity === "warning"
        ? "Evacuation readiness has active areas that need DRRMO review, mainly full areas, limited capacity, or facility gaps."
        : "Evacuation area readiness appears generally stable based on current records."),
    priorityActions: insights.slice(0, 4).map((item) => item.action),
    insights: insights.slice(0, 5),
    summary: {
      totalPlaces: summary.totalPlaces,
      availablePlaces: summary.availablePlaces,
      limitedPlaces: summary.limitedPlaces,
      fullPlaces: summary.fullPlaces,
      totalIndividualCapacity: summary.totalIndividualCapacity,
      totalFamilyCapacity: summary.totalFamilyCapacity,
      totalBedCapacity: summary.totalBedCapacity,
      potableWaterRate: summary.potableWaterRate,
      crCoverageRate: summary.crCoverageRate,
      attentionCount: attentionPlaces.length,
    },
    fallbackReason,
    cacheHit: false,
  };
};

/* =========================
   API CONTROLLERS
   ========================= */

const getEvacAnalyticsOverview = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("Get Evac Analytics Overview Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacSummary = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      historySummary: snapshot.historySummary,
    });
  } catch (err) {
    console.error("Get Evac Summary Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacStatusBreakdown = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      statusBreakdown: snapshot.statusBreakdown,
      facilityBreakdown: snapshot.facilityBreakdown,
    });
  } catch (err) {
    console.error("Get Evac Status Breakdown Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacBarangayCapacity = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      barangayBreakdown: snapshot.barangayBreakdown,
      criticalBarangays: snapshot.criticalBarangays,
      topBarangaysByPlaces: snapshot.topBarangaysByPlaces,
      topBarangaysByIndividualCapacity: snapshot.topBarangaysByIndividualCapacity,
      topBarangaysByFamilyCapacity: snapshot.topBarangaysByFamilyCapacity,
      topBarangaysByBedCapacity: snapshot.topBarangaysByBedCapacity,
      topBarangaysByFloorArea: snapshot.topBarangaysByFloorArea,
    });
  } catch (err) {
    console.error("Get Evac Barangay Capacity Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacRecentTrend = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      placeTrend: snapshot.placeTrend,
      activityTrend: snapshot.activityTrend,
    });
  } catch (err) {
    console.error("Get Evac Recent Trend Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacFacilityReadiness = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      facilityBreakdown: snapshot.facilityBreakdown,
      highCapacityPlaces: snapshot.highCapacityPlaces,
      attentionPlaces: snapshot.attentionPlaces,
    });
  } catch (err) {
    console.error("Get Evac Facility Readiness Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacActivityPerformance = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      historySummary: snapshot.historySummary,
      actionBreakdown: snapshot.actionBreakdown,
      roleBreakdown: snapshot.roleBreakdown,
      recentActivities: snapshot.recentActivities,
    });
  } catch (err) {
    console.error("Get Evac Activity Performance Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getEvacAiInsights = async (req, res) => {
  if (evacAiCache && Date.now() - evacAiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...evacAiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - evacAiCacheTime,
    });
  }

  try {
    const snapshot = await buildAnalyticsSnapshot();
    const fallback = buildRuleBasedAi(snapshot);

    const facts = {
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      historySummary: snapshot.historySummary,
      statusBreakdown: snapshot.statusBreakdown,
      facilityBreakdown: snapshot.facilityBreakdown,
      criticalBarangays: snapshot.criticalBarangays.slice(0, 5),
      topBarangaysByIndividualCapacity: snapshot.topBarangaysByIndividualCapacity.slice(0, 5),
      topBarangaysByPlaces: snapshot.topBarangaysByPlaces.slice(0, 5),
      highCapacityPlaces: snapshot.highCapacityPlaces.slice(0, 5),
      attentionPlaces: snapshot.attentionPlaces.slice(0, 5),
      recentActivities: snapshot.recentActivities.slice(0, 5),
    };

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO evacuation management system.
Analyze only the provided evacuation area facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and dashboard-friendly.
- Use facts such as total evacuation places, available/limited/full counts, occupancy totals, capacity and utilization, barangays with limited or full facilities, public visibility, and recent changes only when supported by data.
- Focus recommendations on overcrowding risk, underused capacity, barangays needing monitoring, occupancy data completeness, and public visibility management.
- If occupancy fields exist, use them instead of relying only on manual status.
- Do not invent barangays, facilities, or history entries.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Evacuation Analytics",
      prompt,
      fallback,
    });

    evacAiCache = finalPayload;
    evacAiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Evac AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================
   PDF DESIGN
   ========================= */

const PDF_THEME = {
  dark: "#111111",
  green: "#111111",
  green2: "#222222",
  green3: "#333333",
  softGreen: "#f4f4f4",
  paleGreen: "#fafafa",
  gold: "#444444",
  softGold: "#f4f4f4",
  red: "#333333",
  softRed: "#f4f4f4",
  blue: "#3a3a3a",
  softBlue: "#f4f4f4",
  gray: "#6b7280",
  darkText: "#222222",
  line: "#d1d5db",
  light: "#f9fafb",
  white: "#ffffff",
};

const getPdfPageWidth = (doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const ensurePdfPageSpace = (doc, neededSpace = 80) => {
  const safeBottom = doc.page.height - doc.page.margins.bottom - 36;

  if (doc.y + neededSpace > safeBottom) {
    doc.addPage();
  }
};

const drawPdfRoundRect = (doc, x, y, width, height, radius, fill, stroke = fill) => {
  doc.roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke);
};

const drawPdfHeader = (doc, snapshot) => {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top;
  const width = getPdfPageWidth(doc);

  drawPdfRoundRect(doc, x, y, width, 78, 18, PDF_THEME.dark, PDF_THEME.dark);

  doc
    .fillColor(PDF_THEME.white)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Evacuation AI Analytics Report", x + 20, y + 18, {
      width: width - 40,
      lineBreak: false,
    });

  doc
    .fillColor(PDF_THEME.light)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(`Generated: ${formatDateValue(snapshot.generatedAt)}`, x + 20, y + 50, {
      width: width - 40,
      lineBreak: false,
    });

  doc.y = y + 96;
};

const getSeverityTheme = (severity) => {
  const value = normalizeLower(severity);

  if (value === "critical") {
    return { bg: PDF_THEME.softRed, color: PDF_THEME.red, label: "Critical" };
  }

  if (value === "warning") {
    return { bg: PDF_THEME.softGold, color: PDF_THEME.gold, label: "Warning" };
  }

  if (value === "notice") {
    return { bg: PDF_THEME.softGold, color: PDF_THEME.gold, label: "Notice" };
  }

  if (value === "success") {
    return { bg: PDF_THEME.softGreen, color: PDF_THEME.green2, label: "Success" };
  }

  return { bg: PDF_THEME.softBlue, color: PDF_THEME.blue, label: "Info" };
};

const drawPdfSectionTitle = (doc, title, subtitle = "") => {
  ensurePdfPageSpace(doc, 42);

  const x = doc.page.margins.left;
  const width = getPdfPageWidth(doc);

  doc
    .fillColor(PDF_THEME.dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(title, x, doc.y, { width });

  if (subtitle) {
    doc
      .moveDown(0.15)
      .fillColor(PDF_THEME.gray)
      .font("Helvetica")
      .fontSize(8.5)
      .text(subtitle, x, doc.y, { width });
  }

  doc.moveDown(0.55);
};

const drawPdfInfoCard = (doc, title, body, options = {}) => {
  ensurePdfPageSpace(doc, options.height || 78);

  const x = doc.page.margins.left;
  const width = getPdfPageWidth(doc);
  const y = doc.y;
  const height = options.height || 72;
  const tone = options.tone || "green";

  const bg =
    tone === "warning"
      ? PDF_THEME.softGold
      : tone === "danger"
      ? PDF_THEME.softRed
      : tone === "info"
      ? PDF_THEME.softBlue
      : PDF_THEME.paleGreen;

  const accent =
    tone === "warning"
      ? PDF_THEME.gold
      : tone === "danger"
      ? PDF_THEME.red
      : tone === "info"
      ? PDF_THEME.blue
      : PDF_THEME.green2;

  drawPdfRoundRect(doc, x, y, width, height, 14, bg, bg);
  doc.rect(x, y, 5, height).fill(accent);

  doc
    .fillColor(PDF_THEME.dark)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(title, x + 16, y + 12, { width: width - 28 });

  doc
    .fillColor(PDF_THEME.darkText)
    .font("Helvetica")
    .fontSize(9.2)
    .text(body || "-", x + 16, y + 30, {
      width: width - 28,
      lineGap: 2,
      height: height - 36,
    });

  doc.y = y + height + 14;
};

const drawPdfKpiGrid = (doc, cards = []) => {
  const x = doc.page.margins.left;
  const gap = 10;
  const width = getPdfPageWidth(doc);
  const cardWidth = (width - gap * 3) / 4;
  const cardHeight = 66;

  ensurePdfPageSpace(doc, cardHeight + 20);

  const y = doc.y;

  cards.slice(0, 4).forEach((card, index) => {
    const cx = x + index * (cardWidth + gap);
    const tone = card.tone || "green";

    const bg =
      tone === "warning"
        ? PDF_THEME.softGold
        : tone === "danger"
        ? PDF_THEME.softRed
        : tone === "info"
        ? PDF_THEME.softBlue
        : PDF_THEME.softGreen;

    const accent =
      tone === "warning"
        ? PDF_THEME.gold
        : tone === "danger"
        ? PDF_THEME.red
        : tone === "info"
        ? PDF_THEME.blue
        : PDF_THEME.green2;

    drawPdfRoundRect(doc, cx, y, cardWidth, cardHeight, 13, bg, "#d9eadb");

    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(card.value, cx + 11, y + 12, {
        width: cardWidth - 22,
        align: "left",
        lineBreak: false,
      });

    doc
      .fillColor(PDF_THEME.dark)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(card.label, cx + 11, y + 36, {
        width: cardWidth - 22,
        lineBreak: false,
      });

    doc
      .fillColor(PDF_THEME.gray)
      .font("Helvetica")
      .fontSize(7)
      .text(card.sub || "", cx + 11, y + 49, {
        width: cardWidth - 22,
        lineBreak: false,
      });
  });

  doc.y = y + cardHeight + 18;
};

const drawPdfMiniBar = (doc, x, y, width, percent, color) => {
  const safe = Math.max(0, Math.min(100, percent));
  doc.roundedRect(x, y, width, 6, 3).fill("#eaf4ec");
  doc.roundedRect(x, y, Math.max(4, (width * safe) / 100), 6, 3).fill(color);
};

const drawPdfCleanTable = (doc, title, rows = [], columns = [], options = {}) => {
  drawPdfSectionTitle(doc, title, options.subtitle || "");

  if (!rows.length) {
    drawPdfInfoCard(doc, "No data available", "No records available for this section.", {
      height: 56,
      tone: "info",
    });
    return;
  }

  const x = doc.page.margins.left;
  const width = getPdfPageWidth(doc);
  const rowHeight = options.rowHeight || 28;
  const headerHeight = 24;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const finalColumns =
    tableWidth > width
      ? columns.map((col) => ({
          ...col,
          width: Math.max(col.minWidth || 48, Math.floor(col.width * (width / tableWidth))),
        }))
      : columns.map((col, index) => ({
          ...col,
          width: index === columns.length - 1 ? col.width + (width - tableWidth) : col.width,
        }));

  ensurePdfPageSpace(doc, headerHeight + rowHeight + 18);

  let y = doc.y;

  drawPdfRoundRect(doc, x, y, width, headerHeight, 8, PDF_THEME.green, PDF_THEME.green);

  let cx = x;
  finalColumns.forEach((col) => {
    doc
      .fillColor(PDF_THEME.white)
      .font("Helvetica-Bold")
      .fontSize(7.8)
      .text(col.label, cx + 8, y + 8, {
        width: col.width - 16,
        align: col.align || "left",
        height: headerHeight - 10,
        ellipsis: true,
        lineBreak: false,
      });

    cx += col.width;
  });

  doc.y = y + headerHeight;

  rows.forEach((row, index) => {
    ensurePdfPageSpace(doc, rowHeight + 16);

    y = doc.y;
    const bg = index % 2 === 0 ? PDF_THEME.white : PDF_THEME.light;

    doc.rect(x, y, width, rowHeight).fill(bg);

    cx = x;
    finalColumns.forEach((col) => {
      const rawValue = row[col.key] ?? "-";
      const value = col.format ? col.format(rawValue, row) : rawValue;

      doc
        .fillColor(PDF_THEME.darkText)
        .font(col.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .text(String(value), cx + 8, y + 8, {
          width: col.width - 16,
          align: col.align || "left",
          height: rowHeight - 10,
          ellipsis: true,
          lineBreak: false,
        });

      cx += col.width;
    });

    doc
      .moveTo(x, y + rowHeight)
      .lineTo(x + width, y + rowHeight)
      .strokeColor(PDF_THEME.line)
      .lineWidth(0.5)
      .stroke();

    doc.y = y + rowHeight;
  });

  doc.moveDown(0.8);
};

const drawPdfActionList = (doc, title, actions = []) => {
  if (!actions.length) return;

  drawPdfSectionTitle(doc, title);

  actions.slice(0, 5).forEach((action, index) => {
    ensurePdfPageSpace(doc, 36);

    const x = doc.page.margins.left;
    const width = getPdfPageWidth(doc);
    const y = doc.y;

    drawPdfRoundRect(doc, x, y, width, 32, 10, PDF_THEME.softGreen, "#cdebd4");

    doc
      .fillColor(PDF_THEME.green2)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${index + 1}`, x + 10, y + 10, {
        width: 16,
        lineBreak: false,
      });

    doc
      .fillColor(PDF_THEME.darkText)
      .font("Helvetica")
      .fontSize(8.8)
      .text(action, x + 32, y + 9, {
        width: width - 44,
        height: 16,
        lineBreak: false,
      });

    doc.y = y + 40;
  });
};

const drawPdfInsights = (doc, insights = []) => {
  if (!insights.length) return;

  drawPdfSectionTitle(doc, "AI Insights");

  insights.slice(0, 5).forEach((insight, index) => {
    ensurePdfPageSpace(doc, 96);

    const x = doc.page.margins.left;
    const width = getPdfPageWidth(doc);
    const y = doc.y;
    const theme = getSeverityTheme(insight.severity);

    drawPdfRoundRect(doc, x, y, width, 84, 14, theme.bg, theme.bg);
    doc.rect(x, y, 5, 84).fill(theme.color);

    doc
      .fillColor(PDF_THEME.dark)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${index + 1}. ${insight.title || "Insight"}`, x + 16, y + 12, {
        width: width - 112,
        lineBreak: false,
      });

    drawPdfRoundRect(doc, x + width - 86, y + 10, 72, 18, 9, PDF_THEME.white, "#e5e7eb");

    doc
      .fillColor(theme.color)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(theme.label.toUpperCase(), x + width - 78, y + 15, {
        width: 56,
        align: "center",
        lineBreak: false,
      });

    doc
      .fillColor(PDF_THEME.darkText)
      .font("Helvetica")
      .fontSize(8.5)
      .text(insight.message || "-", x + 16, y + 34, {
        width: width - 32,
        lineGap: 1.5,
        height: 22,
      });

    doc
      .fillColor(PDF_THEME.green)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Action: ", x + 16, y + 61, {
        continued: true,
      });

    doc
      .fillColor(PDF_THEME.darkText)
      .font("Helvetica")
      .fontSize(8)
      .text(insight.action || "Review this area.", {
        width: width - 32,
        height: 14,
        lineBreak: false,
      });

    doc.y = y + 96;
  });
};

const exportEvacAnalyticsPdf = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    const ai = evacAiCache || buildRuleBasedAi(snapshot);
    const severityTheme = getSeverityTheme(ai.overallSeverity);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="evacuation-ai-analytics-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 36,
      bufferPages: false,
    });

    doc.pipe(res);

    drawPdfHeader(doc, snapshot);

    drawPdfSectionTitle(doc, "AI Analytics Summary");

    drawPdfInfoCard(
      doc,
      `${getAiSourceLabel(ai)} • ${severityTheme.label}`,
      ai.executiveSummary || "No AI summary available.",
      {
        tone:
          ai.overallSeverity === "critical"
            ? "danger"
            : ai.overallSeverity === "warning" || ai.overallSeverity === "notice"
            ? "warning"
            : ai.overallSeverity === "info"
            ? "info"
            : "green",
        height: 78,
      }
    );

    drawPdfKpiGrid(doc, [
      {
        label: "Evac Areas",
        value: formatWhole(snapshot.summary.totalPlaces),
        sub: "Active records",
        tone: "green",
      },
      {
        label: "Individual Cap.",
        value: formatWhole(snapshot.summary.totalIndividualCapacity),
        sub: "Total capacity",
        tone: "green",
      },
      {
        label: "Limited / Full",
        value: formatWhole(snapshot.summary.limitedPlaces + snapshot.summary.fullPlaces),
        sub: "Needs monitoring",
        tone:
          snapshot.summary.limitedPlaces + snapshot.summary.fullPlaces > 0
            ? "warning"
            : "green",
      },
      {
        label: "Water Ready",
        value: `${formatWhole(snapshot.summary.potableWaterRate)}%`,
        sub: "Potable water",
        tone: snapshot.summary.potableWaterRate >= 70 ? "green" : "warning",
      },
    ]);

    drawPdfSectionTitle(doc, "Key Metrics");

    drawPdfKpiGrid(doc, [
      {
        label: "Available",
        value: formatWhole(snapshot.summary.availablePlaces),
        sub: "Open capacity",
        tone: "green",
      },
      {
        label: "Limited",
        value: formatWhole(snapshot.summary.limitedPlaces),
        sub: "Monitor",
        tone: snapshot.summary.limitedPlaces > 0 ? "warning" : "green",
      },
      {
        label: "Full",
        value: formatWhole(snapshot.summary.fullPlaces),
        sub: "No capacity",
        tone: snapshot.summary.fullPlaces > 0 ? "danger" : "green",
      },
      {
        label: "Public Visible",
        value: `${formatWhole(snapshot.summary.landingVisibilityRate)}%`,
        sub: "Landing page",
        tone: "info",
      },
    ]);

    drawPdfKpiGrid(doc, [
      {
        label: "Family Cap.",
        value: formatWhole(snapshot.summary.totalFamilyCapacity),
        sub: "Total family slots",
        tone: "green",
      },
      {
        label: "Bed Cap.",
        value: formatWhole(snapshot.summary.totalBedCapacity),
        sub: "Total beds",
        tone: "green",
      },
      {
        label: "CR Coverage",
        value: `${formatWhole(snapshot.summary.crCoverageRate)}%`,
        sub: "Any CR type",
        tone: snapshot.summary.crCoverageRate >= 70 ? "green" : "warning",
      },
      {
        label: "Activities",
        value: formatWhole(snapshot.historySummary.logsThisWeek),
        sub: "This week",
        tone: "info",
      },
    ]);

    drawPdfActionList(doc, "AI Priority Actions", ai.priorityActions || []);
    drawPdfInsights(doc, ai.insights || []);

    drawPdfCleanTable(
      doc,
      "Top Barangays by Individual Capacity",
      snapshot.topBarangaysByIndividualCapacity,
      [
        { label: "Barangay", key: "barangayName", width: 280, bold: true },
        {
          label: "Capacity",
          key: "totalIndividualCapacity",
          width: 110,
          align: "right",
          format: formatWhole,
        },
      ]
    );

    drawPdfCleanTable(
      doc,
      "Barangays Needing Attention",
      snapshot.criticalBarangays,
      [
        { label: "Barangay", key: "barangayName", width: 190, bold: true },
        { label: "Areas", key: "totalPlaces", width: 70, align: "right", format: formatWhole },
        { label: "Available", key: "available", width: 75, align: "right", format: formatWhole },
        { label: "Limited", key: "limited", width: 70, align: "right", format: formatWhole },
        { label: "Full", key: "full", width: 60, align: "right", format: formatWhole },
      ]
    );

    drawPdfCleanTable(
      doc,
      "High Capacity Evacuation Areas",
      snapshot.highCapacityPlaces,
      [
        { label: "Area", key: "name", width: 180, bold: true },
        { label: "Barangay", key: "barangayName", width: 120 },
        {
          label: "Status",
          key: "capacityStatus",
          width: 80,
          format: formatLabel,
        },
        {
          label: "Capacity",
          key: "capacityIndividual",
          width: 80,
          align: "right",
          format: formatWhole,
        },
      ]
    );

    drawPdfSectionTitle(doc, "Operational Rates");

    const rateX = doc.page.margins.left;
    const rateWidth = getPdfPageWidth(doc);
    const rateRows = [
      {
        label: "Available Rate",
        value: snapshot.summary.availableRate,
        color: PDF_THEME.green2,
      },
      {
        label: "Limited Rate",
        value: snapshot.summary.limitedRate,
        color: PDF_THEME.gold,
      },
      {
        label: "Full Rate",
        value: snapshot.summary.fullRate,
        color: PDF_THEME.red,
      },
      {
        label: "Landing Visibility",
        value: snapshot.summary.landingVisibilityRate,
        color: PDF_THEME.blue,
      },
      {
        label: "Potable Water",
        value: snapshot.summary.potableWaterRate,
        color: PDF_THEME.green2,
      },
    ];

    rateRows.forEach((row) => {
      ensurePdfPageSpace(doc, 26);

      const y = doc.y;

      doc
        .fillColor(PDF_THEME.dark)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(row.label, rateX, y, {
          width: 150,
          lineBreak: false,
        });

      drawPdfMiniBar(doc, rateX + 155, y + 3, rateWidth - 210, row.value, row.color);

      doc
        .fillColor(PDF_THEME.dark)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(`${formatWhole(row.value)}%`, rateX + rateWidth - 45, y, {
          width: 45,
          align: "right",
          lineBreak: false,
        });

      doc.y = y + 22;
    });

    ensurePdfPageSpace(doc, 32);
    doc.moveDown(1);

    doc
      .fillColor(PDF_THEME.gray)
      .font("Helvetica")
      .fontSize(8)
      .text(`Document generated on ${formatDateValue(new Date())}`, {
        align: "right",
        lineBreak: false,
      });

    doc.end();
  } catch (err) {
    console.error("Export Evac Analytics PDF Error:", err);

    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = {
  getEvacAnalyticsOverview,
  getEvacSummary,
  getEvacStatusBreakdown,
  getEvacBarangayCapacity,
  getEvacRecentTrend,
  getEvacFacilityReadiness,
  getEvacActivityPerformance,
  getEvacAiInsights,
  exportEvacAnalyticsPdf,
};
