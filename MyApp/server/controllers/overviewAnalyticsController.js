const InventoryItem = require("../models/InventoryItem");
const ReliefRequest = require("../models/ReliefRequest");
const ReliefRelease = require("../models/ReliefRelease");
const IncidentModel = require("../models/Incident");
const EvacPlace = require("../models/EvacPlace");
const { callAiAnalyticsProvider } = require("../utils/aiAnalyticsProvider");

const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || 2 * 60 * 60 * 1000);
let overviewAiCache = null;
let overviewAiCacheTime = 0;

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

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

const getExpiryMeta = (expirationDate) => {
  if (!expirationDate) {
    return {
      expiryStatus: "no_expiry",
      daysUntilExpiration: null,
    };
  }

  const today = startOfDay(new Date());
  const expiry = startOfDay(expirationDate);
  const diffMs = expiry.getTime() - today.getTime();
  const daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) {
    return { expiryStatus: "expired", daysUntilExpiration };
  }

  if (daysUntilExpiration <= 30) {
    return { expiryStatus: "expiring_soon", daysUntilExpiration };
  }

  return { expiryStatus: "ok", daysUntilExpiration };
};

const getIncidentStatusKey = (status) => {
  const value = normalizeString(status).toLowerCase();
  if (!value) return "reported";
  if (value === "onprocess" || value === "on process" || value === "in_progress") {
    return "onProcess";
  }
  if (value === "resolved") return "resolved";
  return value;
};

const getEvacStatusKey = (place) => {
  const explicit = normalizeString(place?.capacityStatus).toLowerCase();
  if (explicit === "available" || explicit === "limited" || explicit === "full") {
    return explicit;
  }

  const current = toNumber(place?.currentOccupants);
  const capacity = toNumber(place?.capacityIndividual);
  const occupancyPercent = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  if (capacity > 0 && current >= capacity) return "full";
  if (capacity > 0 && occupancyPercent >= 75) return "limited";
  return "available";
};

const buildAnalyticsSnapshot = async () => {
  const [inventoryItems, reliefRequests, reliefReleases, incidents, evacPlaces] = await Promise.all([
    InventoryItem.find({ isArchive: false }).lean(),
    ReliefRequest.find({ isArchived: false }).lean(),
    ReliefRelease.find({ isArchived: false }).lean(),
    IncidentModel.find().lean(),
    EvacPlace.find({ isArchived: false }).lean(),
  ]);

  const inventorySummary = {
    totalEntries: 0,
    goodsEntries: 0,
    monetaryEntries: 0,
    totalGoodsQuantity: 0,
    totalMonetaryAmount: 0,
    lowStockGoods: 0,
    outOfStockGoods: 0,
    expiredGoods: 0,
    expiringSoonGoods: 0,
  };

  inventoryItems.forEach((item) => {
    inventorySummary.totalEntries += 1;

    if (normalizeString(item.type).toLowerCase() === "goods") {
      inventorySummary.goodsEntries += 1;
      const quantity = toNumber(item.quantity);
      inventorySummary.totalGoodsQuantity += quantity;

      if (quantity <= 0) inventorySummary.outOfStockGoods += 1;
      if (quantity > 0 && quantity < 20) inventorySummary.lowStockGoods += 1;

      const expiryMeta = getExpiryMeta(item.expirationDate);
      if (expiryMeta.expiryStatus === "expired") inventorySummary.expiredGoods += 1;
      if (expiryMeta.expiryStatus === "expiring_soon") inventorySummary.expiringSoonGoods += 1;
    }

    if (normalizeString(item.type).toLowerCase() === "monetary") {
      inventorySummary.monetaryEntries += 1;
      inventorySummary.totalMonetaryAmount += toNumber(item.amount);
    }
  });

  inventorySummary.needsAttention =
    inventorySummary.lowStockGoods +
    inventorySummary.outOfStockGoods +
    inventorySummary.expiredGoods +
    inventorySummary.expiringSoonGoods;

  const reliefSummary = {
    totalRequests: reliefRequests.length,
    pendingRequests: 0,
    approvedRequests: 0,
    releasedRequests: 0,
    receivedRequests: 0,
    rejectedRequests: 0,
    pendingReceipt: 0,
    totalRequestedFoodPacks: 0,
    totalFoodPacksReleased: 0,
  };

  reliefRequests.forEach((request) => {
    const status = normalizeString(request.status).toLowerCase();
    if (status === "pending") reliefSummary.pendingRequests += 1;
    if (status === "approved") reliefSummary.approvedRequests += 1;
    if (status === "released") reliefSummary.releasedRequests += 1;
    if (status === "received") reliefSummary.receivedRequests += 1;
    if (status === "rejected") reliefSummary.rejectedRequests += 1;
    reliefSummary.totalRequestedFoodPacks += toNumber(request?.totals?.requestedFoodPacks);
  });

  reliefReleases.forEach((release) => {
    const releaseStatus = normalizeString(release.releaseStatus).toLowerCase();
    if (releaseStatus === "released" && !release.receivedAt) {
      reliefSummary.pendingReceipt += 1;
    }

    if (releaseStatus === "received") {
      reliefSummary.receivedRequests += 1;
    }

    reliefSummary.totalFoodPacksReleased += toNumber(release.foodPacksReleased);
  });

  reliefSummary.backlog =
    reliefSummary.pendingRequests + reliefSummary.approvedRequests + reliefSummary.pendingReceipt;
  reliefSummary.foodPackGap = Math.max(
    0,
    reliefSummary.totalRequestedFoodPacks - reliefSummary.totalFoodPacksReleased
  );

  const incidentSummary = {
    totalIncidents: incidents.length,
    reportedIncidents: 0,
    onProcessIncidents: 0,
    resolvedIncidents: 0,
    unresolvedIncidents: 0,
    verificationPending: 0,
    verificationRejected: 0,
    withImage: 0,
  };

  incidents.forEach((incident) => {
    const status = getIncidentStatusKey(incident.status);
    if (status === "reported") incidentSummary.reportedIncidents += 1;
    if (status === "onProcess") incidentSummary.onProcessIncidents += 1;
    if (status === "resolved") incidentSummary.resolvedIncidents += 1;

    const verificationStatus = normalizeString(incident?.verification?.status).toLowerCase();
    if (verificationStatus === "pending") incidentSummary.verificationPending += 1;
    if (verificationStatus === "rejected") incidentSummary.verificationRejected += 1;

    if (incident?.image?.fileUrl) incidentSummary.withImage += 1;
  });

  incidentSummary.unresolvedIncidents = Math.max(
    0,
    incidentSummary.totalIncidents - incidentSummary.resolvedIncidents
  );

  const evacSummary = {
    totalPlaces: evacPlaces.length,
    availablePlaces: 0,
    limitedPlaces: 0,
    fullPlaces: 0,
    totalCurrentOccupants: 0,
    totalIndividualCapacity: 0,
    occupancyRate: 0,
  };

  evacPlaces.forEach((place) => {
    const status = getEvacStatusKey(place);

    if (status === "available") evacSummary.availablePlaces += 1;
    if (status === "limited") evacSummary.limitedPlaces += 1;
    if (status === "full") evacSummary.fullPlaces += 1;

    evacSummary.totalCurrentOccupants += toNumber(place.currentOccupants);
    evacSummary.totalIndividualCapacity += toNumber(place.capacityIndividual);
  });

  evacSummary.occupancyRate = safePercent(
    evacSummary.totalCurrentOccupants,
    evacSummary.totalIndividualCapacity
  );
  evacSummary.needsAttention = evacSummary.limitedPlaces + evacSummary.fullPlaces;

  const scores = {
    inventory: Math.max(0, 100 - inventorySummary.needsAttention * 8),
    donations:
      inventorySummary.totalGoodsQuantity > 0 || inventorySummary.totalMonetaryAmount > 0
        ? 100
        : 65,
    relief: Math.max(0, 100 - (reliefSummary.backlog * 6 + reliefSummary.foodPackGap * 0.04)),
    incidents: Math.max(
      0,
      100 - (incidentSummary.unresolvedIncidents + incidentSummary.verificationPending) * 7
    ),
    evacuation: Math.max(0, 100 - evacSummary.needsAttention * 10),
  };

  scores.overall = Math.round(
    (scores.inventory + scores.donations + scores.relief + scores.incidents + scores.evacuation) /
      5
  );

  return {
    generatedAt: new Date(),
    summary: {
      scores,
      inventoryIssues: inventorySummary.needsAttention,
      reliefBacklog: reliefSummary.backlog,
      reliefFoodPackGap: reliefSummary.foodPackGap,
      incidentIssues: incidentSummary.unresolvedIncidents + incidentSummary.verificationPending,
      evacIssues: evacSummary.needsAttention,
    },
    inventory: inventorySummary,
    relief: reliefSummary,
    incidents: incidentSummary,
    evacuation: evacSummary,
  };
};

const buildRuleBasedAi = (snapshot, fallbackReason = "") => {
  const insights = [];

  if (snapshot.inventory.needsAttention > 0) {
    insights.push({
      type: "inventory_attention",
      severity: snapshot.inventory.expiredGoods > 0 || snapshot.inventory.outOfStockGoods > 0 ? "critical" : "warning",
      title: "Inventory needs attention",
      message: `${snapshot.inventory.needsAttention} stock or expiry warning is currently open.`,
      action: "Prioritize expired and out-of-stock items before routine stock updates.",
    });
  }

  if (snapshot.relief.backlog > 0 || snapshot.relief.foodPackGap > 0) {
    insights.push({
      type: "relief_backlog",
      severity: snapshot.relief.backlog > 5 ? "critical" : "warning",
      title: "Relief queue is building up",
      message: `${snapshot.relief.backlog} queue item and ${snapshot.relief.foodPackGap} uncovered food packs were detected.`,
      action: "Release approved requests and close pending receipt confirmations.",
    });
  }

  if (snapshot.incidents.unresolvedIncidents > 0 || snapshot.incidents.verificationPending > 0) {
    insights.push({
      type: "incident_followup",
      severity: snapshot.incidents.unresolvedIncidents > 0 ? "warning" : "notice",
      title: "Incident monitoring needs follow-up",
      message: `${snapshot.incidents.unresolvedIncidents} unresolved incident and ${snapshot.incidents.verificationPending} pending verification record are active.`,
      action: "Resolve active incidents and clear pending evidence review.",
    });
  }

  if (snapshot.evacuation.needsAttention > 0) {
    insights.push({
      type: "evacuation_capacity",
      severity: snapshot.evacuation.fullPlaces > 0 ? "critical" : "warning",
      title: "Evacuation capacity needs review",
      message: `${snapshot.evacuation.limitedPlaces} limited and ${snapshot.evacuation.fullPlaces} full evacuation area are active.`,
      action: "Rebalance evac occupants or open additional centers before surges.",
    });
  }

  if (!insights.length) {
    insights.push({
      type: "operations_stable",
      severity: "success",
      title: "Operations look stable",
      message:
        "No major cross-module warnings were detected from inventory, relief, incidents, and evacuation readiness.",
      action: "Continue routine monitoring and keep records updated.",
    });
  }

  const severityRank = { success: 1, info: 2, notice: 3, warning: 4, critical: 5 };

  const overallSeverity = insights.reduce((highest, insight) => {
    return severityRank[insight.severity] > severityRank[highest] ? insight.severity : highest;
  }, "success");

  return {
    source: "rule_based_fallback",
    model: "local_rules",
    aiAvailable: false,
    overallSeverity,
    executiveSummary:
      fallbackReason ||
      (overallSeverity === "warning" || overallSeverity === "critical"
        ? "Operations need prioritized action in one or more modules."
        : "Operations are currently stable across core modules."),
    priorityActions: insights.slice(0, 4).map((item) => item.action),
    insights: insights.slice(0, 5),
    generatedAt: new Date(),
    fallbackReason,
    cacheHit: false,
  };
};

const getOverviewAnalyticsOverview = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("Get Overview Analytics Overview Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getOverviewAiInsights = async (req, res) => {
  if (overviewAiCache && Date.now() - overviewAiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...overviewAiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - overviewAiCacheTime,
    });
  }

  try {
    const snapshot = await buildAnalyticsSnapshot();
    const fallback = buildRuleBasedAi(snapshot);

    const facts = {
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      inventory: snapshot.inventory,
      relief: snapshot.relief,
      incidents: snapshot.incidents,
      evacuation: snapshot.evacuation,
    };

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO operations overview dashboard.
Analyze only the provided facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and practical for DRRMO decisions.
- Provide cross-module insights only, such as relief demand vs inventory readiness, evacuation pressure vs incident activity, unresolved incidents affecting operations, priority barangays across modules, and operational bottlenecks.
- Do not duplicate each module's detailed analytics.
- Do not invent barangays, requests, incidents, or evacuation places.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Overview Analytics",
      prompt,
      fallback,
    });

    overviewAiCache = finalPayload;
    overviewAiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Overview AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getOverviewAnalyticsOverview,
  getOverviewAiInsights,
};
