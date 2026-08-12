const PDFDocument = require("pdfkit");
const ReliefRequest = require("../models/ReliefRequest");
const ReliefRelease = require("../models/ReliefRelease");
const { callAiAnalyticsProvider } = require("../utils/aiAnalyticsProvider");

const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || 2 * 60 * 60 * 1000);
let reliefAiCache = null;
let reliefAiCacheTime = 0;

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

const formatWhole = (value) => {
  return Number(toNumber(value)).toLocaleString();
};

const safePercent = (value, total) => {
  const v = toNumber(value);
  const t = toNumber(total);
  if (t <= 0) return 0;
  return Math.round((v / t) * 100);
};

const getRequestDate = (request) => {
  return request?.requestDate || request?.createdAt || null;
};

const getReleaseDate = (release) => {
  return release?.releasedAt || release?.createdAt || null;
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

const getAffectedTotal = (request) => {
  const totals = request?.totals || {};
  return (
    toNumber(totals.male) +
    toNumber(totals.female) +
    toNumber(totals.lgbtq) +
    toNumber(totals.pwd) +
    toNumber(totals.pregnant) +
    toNumber(totals.senior)
  );
};

const getVulnerableTotal = (request) => {
  const totals = request?.totals || {};
  return toNumber(totals.pwd) + toNumber(totals.pregnant) + toNumber(totals.senior);
};

const getRequestedFoodPacks = (request) => {
  return toNumber(request?.totals?.requestedFoodPacks);
};

const getReleaseLagDays = (request, release) => {
  const approvedAt = request?.approvedAt ? new Date(request.approvedAt) : null;
  const releasedAt = release?.releasedAt ? new Date(release.releasedAt) : null;

  if (!approvedAt || !releasedAt) return null;
  if (Number.isNaN(approvedAt.getTime()) || Number.isNaN(releasedAt.getTime())) return null;

  const diff = releasedAt.getTime() - approvedAt.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
};

const getReceiveLagDays = (release) => {
  const releasedAt = release?.releasedAt ? new Date(release.releasedAt) : null;
  const receivedAt = release?.receivedAt ? new Date(release.receivedAt) : null;

  if (!releasedAt || !receivedAt) return null;
  if (Number.isNaN(releasedAt.getTime()) || Number.isNaN(receivedAt.getTime())) return null;

  const diff = receivedAt.getTime() - releasedAt.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
};

const average = (numbers = []) => {
  const valid = numbers.filter((num) => typeof num === "number" && !Number.isNaN(num));
  if (!valid.length) return 0;

  const total = valid.reduce((sum, num) => sum + num, 0);
  return Math.round((total / valid.length) * 10) / 10;
};

const buildAnalyticsSnapshot = async () => {
  const [requests, releases] = await Promise.all([
    ReliefRequest.find({ isArchived: false }).sort({ createdAt: -1 }).lean(),
    ReliefRelease.find({ isArchived: false }).sort({ createdAt: -1 }).lean(),
  ]);

  const requestById = new Map();
  requests.forEach((request) => {
    requestById.set(String(request._id), request);
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const statusBreakdown = {
    pending: 0,
    approved: 0,
    rejected: 0,
    released: 0,
    received: 0,
    cancelled: 0,
    partially_released: 0,
  };

  const stageBreakdown = {};
  const barangayDemandMap = {};
  const disasterDemandMap = {};
  const barangayFoodPackMap = {};
  const requestTrend = buildDailyTrend(requests, getRequestDate, 7);
  const releaseTrend = buildDailyTrend(releases, getReleaseDate, 7);

  const summary = requests.reduce(
    (acc, request) => {
      const status = normalizeLower(request.status) || "pending";
      const stage = normalizeString(request.currentStage) || "pending_review";
      const requestDate = getRequestDate(request) ? new Date(getRequestDate(request)) : null;

      if (statusBreakdown[status] !== undefined) {
        statusBreakdown[status] += 1;
      } else {
        statusBreakdown[status] = 1;
      }

      incrementMap(stageBreakdown, stage);

      const affected = getAffectedTotal(request);
      const vulnerable = getVulnerableTotal(request);
      const requestedFoodPacks = getRequestedFoodPacks(request);

      acc.totalRequests += 1;
      acc.totalAffected += affected;
      acc.totalVulnerable += vulnerable;
      acc.totalHouseholds += toNumber(request?.totals?.households);
      acc.totalFamilies += toNumber(request?.totals?.families);
      acc.totalRequestedFoodPacks += requestedFoodPacks;

      if (request.isEditedAfterSubmit || toNumber(request.editCount) > 0) {
        acc.editedAfterSubmit += 1;
      }

      if (requestDate && !Number.isNaN(requestDate.getTime())) {
        if (requestDate >= todayStart && requestDate <= todayEnd) acc.requestsToday += 1;
        if (requestDate >= weekStart && requestDate <= todayEnd) acc.requestsThisWeek += 1;
        if (requestDate >= monthStart && requestDate <= todayEnd) acc.requestsThisMonth += 1;
      }

      incrementMap(barangayDemandMap, request.barangayName, affected);
      incrementMap(barangayFoodPackMap, request.barangayName, requestedFoodPacks);
      incrementMap(disasterDemandMap, request.disaster, 1);

      return acc;
    },
    {
      totalRequests: 0,
      totalAffected: 0,
      totalVulnerable: 0,
      totalHouseholds: 0,
      totalFamilies: 0,
      totalRequestedFoodPacks: 0,
      requestsToday: 0,
      requestsThisWeek: 0,
      requestsThisMonth: 0,
      editedAfterSubmit: 0,
    }
  );

  const releaseStatusBreakdown = {
    draft: 0,
    released: 0,
    received: 0,
    cancelled: 0,
  };

  const releaseModeBreakdown = {
    manual: 0,
    template: 0,
  };

  const templateUsageMap = {};
  const templatePackMap = {};
  const releasedCategoryMap = {};
  const releasedItemMap = {};
  const releaseBarangayMap = {};
  const releaseLagDays = [];
  const receiveLagDays = [];

  const releaseSummary = releases.reduce(
    (acc, release) => {
      const status = normalizeLower(release.releaseStatus) || "released";
      const mode = normalizeLower(release.releaseMode) || "manual";
      const releasedDate = getReleaseDate(release) ? new Date(getReleaseDate(release)) : null;

      if (releaseStatusBreakdown[status] !== undefined) {
        releaseStatusBreakdown[status] += 1;
      } else {
        releaseStatusBreakdown[status] = 1;
      }

      if (releaseModeBreakdown[mode] !== undefined) {
        releaseModeBreakdown[mode] += 1;
      } else {
        releaseModeBreakdown[mode] = 1;
      }

      acc.totalReleases += 1;
      acc.totalFoodPacksReleased += toNumber(release.foodPacksReleased);
      acc.totalQuantityReleased += toNumber(
        release?.releaseSummary?.totalQuantityReleased || release.totalItemsReleased
      );
      acc.totalLineItems += toNumber(
        release?.releaseSummary?.totalLineItems || release.items?.length
      );

      if (status === "released") acc.pendingReceipt += 1;
      if (status === "received") acc.receivedReleases += 1;
      if (status === "cancelled") acc.cancelledReleases += 1;

      if (releasedDate && !Number.isNaN(releasedDate.getTime())) {
        if (releasedDate >= todayStart && releasedDate <= todayEnd) acc.releasesToday += 1;
        if (releasedDate >= weekStart && releasedDate <= todayEnd) acc.releasesThisWeek += 1;
        if (releasedDate >= monthStart && releasedDate <= todayEnd) acc.releasesThisMonth += 1;
      }

      if (mode === "template") {
        const templateName = normalizeString(release.foodPackTemplateName) || "Unnamed Template";
        incrementMap(templateUsageMap, templateName, 1);
        incrementMap(templatePackMap, templateName, release.foodPacksReleased);
      }

      incrementMap(releaseBarangayMap, release.barangayName, release.foodPacksReleased || 1);

      (release.items || []).forEach((item) => {
        incrementMap(releasedCategoryMap, item.category, item.quantityReleased);
        incrementMap(releasedItemMap, item.itemName, item.quantityReleased);
      });

      const request = requestById.get(String(release.reliefRequestId));
      const releaseLag = getReleaseLagDays(request, release);
      const receiveLag = getReceiveLagDays(release);

      if (releaseLag !== null) releaseLagDays.push(releaseLag);
      if (receiveLag !== null) receiveLagDays.push(receiveLag);

      return acc;
    },
    {
      totalReleases: 0,
      totalFoodPacksReleased: 0,
      totalQuantityReleased: 0,
      totalLineItems: 0,
      pendingReceipt: 0,
      receivedReleases: 0,
      cancelledReleases: 0,
      releasesToday: 0,
      releasesThisWeek: 0,
      releasesThisMonth: 0,
    }
  );

  summary.pendingRequests = toNumber(statusBreakdown.pending);
  summary.approvedRequests = toNumber(statusBreakdown.approved);
  summary.rejectedRequests = toNumber(statusBreakdown.rejected);
  summary.releasedRequests = toNumber(statusBreakdown.released);
  summary.receivedRequests = toNumber(statusBreakdown.received);
  summary.cancelledRequests = toNumber(statusBreakdown.cancelled);
  summary.legacyPartialRequests = toNumber(statusBreakdown.partially_released);

  summary.completionRate = safePercent(summary.receivedRequests, summary.totalRequests);
  summary.rejectionRate = safePercent(summary.rejectedRequests, summary.totalRequests);
  summary.releaseFulfillmentRate = safePercent(
    releaseSummary.totalFoodPacksReleased,
    summary.totalRequestedFoodPacks
  );

  releaseSummary.receiptRate = safePercent(
    releaseSummary.receivedReleases,
    releaseSummary.totalReleases
  );
  releaseSummary.templateUsageRate = safePercent(
    releaseModeBreakdown.template,
    releaseSummary.totalReleases
  );
  releaseSummary.averageApprovalToReleaseDays = average(releaseLagDays);
  releaseSummary.averageReleaseToReceiveDays = average(receiveLagDays);

  const topBarangaysByAffected = buildTopList(
    barangayDemandMap,
    "barangayName",
    "totalAffected",
    8
  );

  const topBarangaysByFoodPacks = buildTopList(
    barangayFoodPackMap,
    "barangayName",
    "requestedFoodPacks",
    8
  );

  const topDisasters = buildTopList(disasterDemandMap, "disaster", "count", 8);

  const topTemplatesByUsage = buildTopList(templateUsageMap, "templateName", "releaseCount", 8).map(
    (template) => ({
      ...template,
      foodPacksReleased: toNumber(templatePackMap[template.templateName]),
    })
  );

  const topReleasedCategories = buildTopList(
    releasedCategoryMap,
    "category",
    "quantityReleased",
    8
  );

  const topReleasedItems = buildTopList(releasedItemMap, "itemName", "quantityReleased", 8);

  const topReleaseBarangays = buildTopList(
    releaseBarangayMap,
    "barangayName",
    "foodPacksReleased",
    8
  );

  const pendingApprovedRequests = requests
    .filter((request) => ["approved"].includes(normalizeLower(request.status)))
    .slice(0, 8)
    .map((request) => ({
      _id: request._id,
      requestNo: request.requestNo,
      barangayName: request.barangayName,
      disaster: request.disaster,
      approvedAt: request.approvedAt,
      requestedFoodPacks: getRequestedFoodPacks(request),
      totalAffected: getAffectedTotal(request),
      vulnerableCount: getVulnerableTotal(request),
    }));

  const highDemandRequests = requests
    .map((request) => ({
      _id: request._id,
      requestNo: request.requestNo,
      barangayName: request.barangayName,
      disaster: request.disaster,
      status: request.status,
      requestedFoodPacks: getRequestedFoodPacks(request),
      totalAffected: getAffectedTotal(request),
      vulnerableCount: getVulnerableTotal(request),
      priorityScore: toNumber(request?.prioritySnapshot?.priorityScore),
    }))
    .sort((a, b) => {
      const bScore = b.priorityScore || b.totalAffected + b.vulnerableCount * 2;
      const aScore = a.priorityScore || a.totalAffected + a.vulnerableCount * 2;
      return bScore - aScore;
    })
    .slice(0, 8);

  return {
    generatedAt: new Date(),
    summary,
    releaseSummary,
    statusBreakdown,
    stageBreakdown,
    releaseStatusBreakdown,
    releaseModeBreakdown,
    requestTrend,
    releaseTrend,
    topBarangaysByAffected,
    topBarangaysByFoodPacks,
    topDisasters,
    topTemplatesByUsage,
    topReleasedCategories,
    topReleasedItems,
    topReleaseBarangays,
    pendingApprovedRequests,
    highDemandRequests,
  };
};

const buildRuleBasedAi = (snapshot, fallbackReason = "") => {
  const { summary, releaseSummary } = snapshot;
  const insights = [];

  if (summary.approvedRequests > 0) {
    insights.push({
      type: "approved_waiting_release",
      severity: "warning",
      title: "Approved requests need release action",
      message: `${summary.approvedRequests} approved request${
        summary.approvedRequests === 1 ? "" : "s"
      } still need release preparation.`,
      action: "Prioritize approved requests before accepting more operational workload.",
    });
  }

  if (releaseSummary.pendingReceipt > 0) {
    insights.push({
      type: "pending_receipt",
      severity: "notice",
      title: "Released goods are awaiting barangay receipt",
      message: `${releaseSummary.pendingReceipt} release${
        releaseSummary.pendingReceipt === 1 ? "" : "s"
      } still need barangay confirmation.`,
      action: "Follow up with barangay users so received records stay accurate.",
    });
  }

  if (summary.rejectedRequests > 0) {
    insights.push({
      type: "rejected_requests",
      severity: "info",
      title: "Rejected requests are present",
      message: `${summary.rejectedRequests} request${
        summary.rejectedRequests === 1 ? " was" : "s were"
      } rejected.`,
      action: "Review rejection reasons to identify repeated data or validation issues.",
    });
  }

  if (summary.legacyPartialRequests > 0) {
    insights.push({
      type: "legacy_partial_records",
      severity: "warning",
      title: "Legacy partial release records detected",
      message: `${summary.legacyPartialRequests} request${
        summary.legacyPartialRequests === 1 ? "" : "s"
      } still use the old partial-release status.`,
      action: "Review these records because the current workflow expects complete releases.",
    });
  }

  if (summary.totalRequestedFoodPacks > releaseSummary.totalFoodPacksReleased) {
    const gap = summary.totalRequestedFoodPacks - releaseSummary.totalFoodPacksReleased;

    insights.push({
      type: "food_pack_gap",
      severity: "warning",
      title: "Requested food packs exceed released packs",
      message: `${gap} requested food pack${
        gap === 1 ? "" : "s"
      } are not yet matched by release records.`,
      action: "Check approved requests and inventory readiness before release planning.",
    });
  }

  if (releaseSummary.templateUsageRate < 50 && releaseSummary.totalReleases > 0) {
    insights.push({
      type: "low_template_usage",
      severity: "notice",
      title: "Template usage can be improved",
      message: `Only ${releaseSummary.templateUsageRate}% of releases used food pack templates.`,
      action: "Use templates for standard food pack releases to keep quantities consistent.",
    });
  }

  if (!insights.length) {
    insights.push({
      type: "stable_relief_operations",
      severity: "success",
      title: "Relief operations look stable",
      message: "No urgent relief request or release bottleneck was detected.",
      action: "Continue monitoring demand, release completion, and barangay receipt confirmation.",
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
        ? "Relief operations have active items that need DRRMO follow-up, especially approved requests, pending receipts, or food pack gaps."
        : "Relief request and release operations appear generally stable based on current records."),
    priorityActions: insights.slice(0, 4).map((item) => item.action),
    insights: insights.slice(0, 5),
    summary: {
      totalRequests: summary.totalRequests,
      approvedRequests: summary.approvedRequests,
      releasedRequests: summary.releasedRequests,
      receivedRequests: summary.receivedRequests,
      totalRequestedFoodPacks: summary.totalRequestedFoodPacks,
      totalFoodPacksReleased: releaseSummary.totalFoodPacksReleased,
      pendingReceipt: releaseSummary.pendingReceipt,
      templateUsageRate: releaseSummary.templateUsageRate,
    },
    fallbackReason,
    cacheHit: false,
  };
};

const getReliefAnalyticsOverview = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("Get Relief Analytics Overview Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefSummary = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      releaseSummary: snapshot.releaseSummary,
    });
  } catch (err) {
    console.error("Get Relief Summary Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefStatusBreakdown = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      statusBreakdown: snapshot.statusBreakdown,
      stageBreakdown: snapshot.stageBreakdown,
      releaseStatusBreakdown: snapshot.releaseStatusBreakdown,
      releaseModeBreakdown: snapshot.releaseModeBreakdown,
    });
  } catch (err) {
    console.error("Get Relief Status Breakdown Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefBarangayDemand = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      topBarangaysByAffected: snapshot.topBarangaysByAffected,
      topBarangaysByFoodPacks: snapshot.topBarangaysByFoodPacks,
      topReleaseBarangays: snapshot.topReleaseBarangays,
      highDemandRequests: snapshot.highDemandRequests,
    });
  } catch (err) {
    console.error("Get Relief Barangay Demand Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefRecentTrend = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      requestTrend: snapshot.requestTrend,
      releaseTrend: snapshot.releaseTrend,
    });
  } catch (err) {
    console.error("Get Relief Recent Trend Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefReleasePerformance = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json({
      generatedAt: snapshot.generatedAt,
      releaseSummary: snapshot.releaseSummary,
      releaseStatusBreakdown: snapshot.releaseStatusBreakdown,
      releaseModeBreakdown: snapshot.releaseModeBreakdown,
      topTemplatesByUsage: snapshot.topTemplatesByUsage,
      topReleasedCategories: snapshot.topReleasedCategories,
      topReleasedItems: snapshot.topReleasedItems,
      pendingApprovedRequests: snapshot.pendingApprovedRequests,
    });
  } catch (err) {
    console.error("Get Relief Release Performance Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getReliefAiInsights = async (req, res) => {
  if (reliefAiCache && Date.now() - reliefAiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...reliefAiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - reliefAiCacheTime,
    });
  }

  try {
    const snapshot = await buildAnalyticsSnapshot();
    const fallback = buildRuleBasedAi(snapshot);

    const facts = {
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      releaseSummary: snapshot.releaseSummary,
      statusBreakdown: snapshot.statusBreakdown,
      releaseStatusBreakdown: snapshot.releaseStatusBreakdown,
      releaseModeBreakdown: snapshot.releaseModeBreakdown,
      topBarangaysByAffected: snapshot.topBarangaysByAffected.slice(0, 5),
      topBarangaysByFoodPacks: snapshot.topBarangaysByFoodPacks.slice(0, 5),
      topDisasters: snapshot.topDisasters.slice(0, 5),
      topTemplatesByUsage: snapshot.topTemplatesByUsage.slice(0, 5),
      pendingApprovedRequests: snapshot.pendingApprovedRequests.slice(0, 5),
      highDemandRequests: snapshot.highDemandRequests.slice(0, 5),
    };

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO disaster relief management system.
Analyze only the provided relief request and release facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and dashboard-friendly.
- Mention approved requests waiting for release, pending barangay receipt, food pack gaps, high-demand barangays, template usage, and rejected request patterns only when supported by facts.
- Treat legacy partially_released data as old workflow information only.
- Do not recommend partial releases.
- Do not invent barangays, requests, releases, or totals.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Relief Analytics",
      prompt,
      fallback,
    });

    reliefAiCache = finalPayload;
    reliefAiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Relief AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================
   CLEAN PDF EXPORT DESIGN
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
    .text("Relief AI Analytics Report", x + 20, y + 18, {
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
    drawPdfInfoCard(doc, "No data available", "There are no records available for this section.", {
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

  drawPdfSectionTitle(doc, title, "Highest priority follow-up actions based on current records.");

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

  drawPdfSectionTitle(doc, "AI Insights", "Only key relief signals are included to avoid redundant reporting.");

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

const exportReliefAnalyticsPdf = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    const ai = reliefAiCache || buildRuleBasedAi(snapshot);
    const severityTheme = getSeverityTheme(ai.overallSeverity);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="relief-ai-analytics-${new Date()
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

    drawPdfSectionTitle(
      doc,
      "AI Analytics Summary",
      "Operational interpretation of relief request demand, release completion, and barangay receipt status."
    );

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
        label: "Total Requests",
        value: formatWhole(snapshot.summary.totalRequests),
        sub: "Active relief records",
        tone: "green",
      },
      {
        label: "Affected People",
        value: formatWhole(snapshot.summary.totalAffected),
        sub: "Reported affected count",
        tone: "green",
      },
      {
        label: "Food Packs Gap",
        value: formatWhole(
          Math.max(
            0,
            toNumber(snapshot.summary.totalRequestedFoodPacks) -
              toNumber(snapshot.releaseSummary.totalFoodPacksReleased)
          )
        ),
        sub: "Requested minus released",
        tone:
          toNumber(snapshot.summary.totalRequestedFoodPacks) >
          toNumber(snapshot.releaseSummary.totalFoodPacksReleased)
            ? "warning"
            : "green",
      },
      {
        label: "Receipt Rate",
        value: `${formatWhole(snapshot.releaseSummary.receiptRate)}%`,
        sub: "Received releases",
        tone: snapshot.releaseSummary.receiptRate >= 70 ? "green" : "warning",
      },
    ]);

    drawPdfSectionTitle(
      doc,
      "Key Metrics",
      "Compact overview of request and release performance."
    );

    drawPdfKpiGrid(doc, [
      {
        label: "Pending",
        value: formatWhole(snapshot.summary.pendingRequests),
        sub: "Awaiting review",
        tone: snapshot.summary.pendingRequests > 0 ? "warning" : "green",
      },
      {
        label: "Approved",
        value: formatWhole(snapshot.summary.approvedRequests),
        sub: "Waiting release",
        tone: snapshot.summary.approvedRequests > 0 ? "warning" : "green",
      },
      {
        label: "Released",
        value: formatWhole(snapshot.summary.releasedRequests),
        sub: "Waiting receipt",
        tone: "info",
      },
      {
        label: "Received",
        value: formatWhole(snapshot.summary.receivedRequests),
        sub: "Completed",
        tone: "green",
      },
    ]);

    drawPdfKpiGrid(doc, [
      {
        label: "Rejected",
        value: formatWhole(snapshot.summary.rejectedRequests),
        sub: "Needs review",
        tone: snapshot.summary.rejectedRequests > 0 ? "danger" : "green",
      },
      {
        label: "Requested Packs",
        value: formatWhole(snapshot.summary.totalRequestedFoodPacks),
        sub: "Barangay demand",
        tone: "green",
      },
      {
        label: "Released Packs",
        value: formatWhole(snapshot.releaseSummary.totalFoodPacksReleased),
        sub: "Release records",
        tone: "green",
      },
      {
        label: "Template Usage",
        value: `${formatWhole(snapshot.releaseSummary.templateUsageRate)}%`,
        sub: "Standardized releases",
        tone: snapshot.releaseSummary.templateUsageRate >= 50 ? "green" : "warning",
      },
    ]);

    drawPdfActionList(doc, "AI Priority Actions", ai.priorityActions || []);
    drawPdfInsights(doc, ai.insights || []);

    drawPdfCleanTable(
      doc,
      "Top Barangays by Affected People",
      snapshot.topBarangaysByAffected,
      [
        { label: "Barangay", key: "barangayName", width: 280, bold: true },
        {
          label: "Affected",
          key: "totalAffected",
          width: 110,
          align: "right",
          format: formatWhole,
        },
      ],
      {
        subtitle: "Barangays with the highest reported affected population.",
      }
    );

    drawPdfCleanTable(
      doc,
      "Top Barangays by Requested Food Packs",
      snapshot.topBarangaysByFoodPacks,
      [
        { label: "Barangay", key: "barangayName", width: 280, bold: true },
        {
          label: "Food Packs",
          key: "requestedFoodPacks",
          width: 110,
          align: "right",
          format: formatWhole,
        },
      ],
      {
        subtitle: "Food pack demand based on submitted relief requests.",
      }
    );

    drawPdfCleanTable(
      doc,
      "Most Used Food Pack Templates",
      snapshot.topTemplatesByUsage,
      [
        { label: "Template", key: "templateName", width: 260, bold: true },
        {
          label: "Releases",
          key: "releaseCount",
          width: 110,
          align: "right",
          format: formatWhole,
        },
      ],
      {
        subtitle: "Template release usage ranked by number of releases.",
      }
    );

    drawPdfCleanTable(
      doc,
      "Top Released Categories",
      snapshot.topReleasedCategories,
      [
        {
          label: "Category",
          key: "category",
          width: 280,
          bold: true,
          format: formatLabel,
        },
        {
          label: "Quantity",
          key: "quantityReleased",
          width: 110,
          align: "right",
          format: formatWhole,
        },
      ],
      {
        subtitle: "Most released item categories across relief releases.",
      }
    );

    drawPdfSectionTitle(
      doc,
      "Operational Rates",
      "Visual summary of completion and release indicators."
    );

    const rateX = doc.page.margins.left;
    const rateWidth = getPdfPageWidth(doc);
    const rateRows = [
      {
        label: "Completion Rate",
        value: snapshot.summary.completionRate,
        color: PDF_THEME.green2,
      },
      {
        label: "Release Fulfillment Rate",
        value: snapshot.summary.releaseFulfillmentRate,
        color: PDF_THEME.gold,
      },
      {
        label: "Receipt Rate",
        value: snapshot.releaseSummary.receiptRate,
        color: PDF_THEME.green2,
      },
      {
        label: "Template Usage Rate",
        value: snapshot.releaseSummary.templateUsageRate,
        color: PDF_THEME.gold,
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
    console.error("Export Relief Analytics PDF Error:", err);

    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = {
  getReliefAnalyticsOverview,
  getReliefSummary,
  getReliefStatusBreakdown,
  getReliefBarangayDemand,
  getReliefRecentTrend,
  getReliefReleasePerformance,
  getReliefAiInsights,
  exportReliefAnalyticsPdf,
};
