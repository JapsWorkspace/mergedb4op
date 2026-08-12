const PDFDocument = require("pdfkit");
const IncidentModel = require("../models/Incident");
const { callAiAnalyticsProvider } = require("../utils/aiAnalyticsProvider");

const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || 2 * 60 * 60 * 1000);
let incidentAiCache = null;
let incidentAiCacheTime = 0;

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
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getAiSourceLabel = (ai) => {
  const source = normalizeLower(ai?.source);
  if (!ai?.aiAvailable || source === "rule_based_fallback") return "Rule-based Fallback";
  if (source === "bedrock") return "AWS Bedrock";
  if (source === "gemini") return "Gemini AI";
  return `${formatLabel(source || "AI")} AI`;
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

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const startOfMonth = (date) => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const startOfYear = (date) => {
  const d = startOfDay(date);
  d.setMonth(0, 1);
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

const buildDailyTrend = (records = [], days = 7) => {
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
    const key = getDateKey(record.createdAt);
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

const getStatusKey = (status) => {
  const value = normalizeLower(status);
  if (!value) return "reported";
  if (value === "onprocess" || value === "on process" || value === "in_progress") return "onProcess";
  if (value === "resolved") return "resolved";
  return value;
};

const getVerificationStatus = (incident) => {
  return normalizeLower(incident?.verification?.status) || "unverified";
};

const getConfidence = (incident) => {
  return toNumber(incident?.verification?.confidence ?? incident?.verification?.score);
};

const buildAnalyticsSnapshot = async () => {
  const incidents = await IncidentModel.find().sort({ createdAt: -1 }).lean();

  const statusBreakdown = {
    reported: 0,
    onProcess: 0,
    resolved: 0,
  };

  const typeMap = {};
  const levelMap = {};
  const locationMap = {};
  const verificationMap = {
    approved: 0,
    pending: 0,
    rejected: 0,
    unverified: 0,
  };

  let totalConfidence = 0;
  let confidenceCount = 0;
  let verifiedMatches = 0;
  let withImage = 0;
  let withGPS = 0;
  let recentEvidence = 0;
  let withinArea = 0;

  incidents.forEach((incident) => {
    const status = getStatusKey(incident.status);

    if (statusBreakdown[status] !== undefined) {
      statusBreakdown[status] += 1;
    } else {
      statusBreakdown[status] = 1;
    }

    incrementMap(typeMap, incident.type || "Unspecified");
    incrementMap(levelMap, incident.level || "Unspecified");
    incrementMap(locationMap, incident.location || "Unspecified");

    const verificationStatus = getVerificationStatus(incident);
    if (verificationMap[verificationStatus] !== undefined) {
      verificationMap[verificationStatus] += 1;
    } else {
      verificationMap[verificationStatus] = 1;
    }

    if (incident?.image?.fileUrl) withImage += 1;

    const confidence = getConfidence(incident);
    if (confidence > 0) {
      totalConfidence += confidence;
      confidenceCount += 1;
    }

    if (incident?.verification?.isMatch) verifiedMatches += 1;
    if (incident?.verification?.metadata?.hasGPS) withGPS += 1;
    if (incident?.verification?.metadata?.isRecent) recentEvidence += 1;
    if (incident?.verification?.metadata?.isWithinArea) withinArea += 1;
  });

  const totalIncidents = incidents.length;
  const unresolved = totalIncidents - toNumber(statusBreakdown.resolved);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  const thisWeekIncidents = incidents.filter((incident) => {
    const createdAt = incident?.createdAt ? new Date(incident.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= weekStart;
  }).length;

  const thisMonthIncidents = incidents.filter((incident) => {
    const createdAt = incident?.createdAt ? new Date(incident.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart;
  }).length;

  const thisYearIncidents = incidents.filter((incident) => {
    const createdAt = incident?.createdAt ? new Date(incident.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= yearStart;
  }).length;

  const summary = {
    totalIncidents,
    reportedIncidents: toNumber(statusBreakdown.reported),
    onProcessIncidents: toNumber(statusBreakdown.onProcess),
    resolvedIncidents: toNumber(statusBreakdown.resolved),
    unresolvedIncidents: unresolved < 0 ? 0 : unresolved,
    withImage,
    verifiedMatches,
    verificationApproved: toNumber(verificationMap.approved),
    verificationPending: toNumber(verificationMap.pending),
    verificationRejected: toNumber(verificationMap.rejected),
    unverified: toNumber(verificationMap.unverified),
    averageConfidence:
      confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 10) / 10 : 0,
    imageCoverageRate: safePercent(withImage, totalIncidents),
    resolvedRate: safePercent(statusBreakdown.resolved, totalIncidents),
      verificationApprovalRate: safePercent(verificationMap.approved, totalIncidents),
      gpsEvidenceRate: safePercent(withGPS, totalIncidents),
      recentEvidenceRate: safePercent(recentEvidence, totalIncidents),
      withinAreaRate: safePercent(withinArea, totalIncidents),
      thisWeekIncidents,
      thisMonthIncidents,
      thisYearIncidents,
    };

  const incidentTrend = buildDailyTrend(incidents, 7);

  const topIncidentTypes = buildTopList(typeMap, "type", "count", 8);
  const levelBreakdown = buildTopList(levelMap, "level", "count", 8);
  const topLocations = buildTopList(locationMap, "location", "count", 8);

  const urgentIncidents = incidents
    .map((incident) => ({
      _id: incident._id,
      type: incident.type,
      level: incident.level,
      location: incident.location,
      status: incident.status || "reported",
      createdAt: incident.createdAt,
      confidence: getConfidence(incident),
      verificationStatus: getVerificationStatus(incident),
      hasImage: Boolean(incident?.image?.fileUrl),
      isMatch: Boolean(incident?.verification?.isMatch),
      isRecent: Boolean(incident?.verification?.metadata?.isRecent),
      isWithinArea: Boolean(incident?.verification?.metadata?.isWithinArea),
      description: incident.description,
    }))
    .sort((a, b) => {
      const urgentScore = (item) => {
        let score = 0;

        if (getStatusKey(item.status) !== "resolved") score += 50;
        if (normalizeLower(item.level).includes("critical")) score += 40;
        if (normalizeLower(item.level).includes("high")) score += 30;
        if (item.verificationStatus === "approved") score += 15;
        if (item.isMatch) score += 10;
        if (item.isWithinArea) score += 8;
        if (item.isRecent) score += 8;
        score += Math.min(20, item.confidence / 5);

        return score;
      };

      return urgentScore(b) - urgentScore(a);
    })
    .slice(0, 8);

  return {
    generatedAt: new Date(),
    summary,
    statusBreakdown,
    verificationBreakdown: verificationMap,
    topIncidentTypes,
    levelBreakdown,
    topLocations,
    incidentTrend,
    urgentIncidents,
  };
};

const buildRuleBasedAi = (snapshot, fallbackReason = "") => {
  const { summary } = snapshot;
  const insights = [];

  if (summary.unresolvedIncidents > 0) {
    insights.push({
      type: "unresolved_incidents",
      severity: "warning",
      title: "Unresolved incidents need monitoring",
      message: `${summary.unresolvedIncidents} incident${
        summary.unresolvedIncidents === 1 ? "" : "s"
      } are not yet resolved.`,
      action: "Prioritize active incident follow-up before marking records complete.",
    });
  }

  if (summary.verificationPending > 0) {
    insights.push({
      type: "pending_verification",
      severity: "notice",
      title: "Some reports need verification review",
      message: `${summary.verificationPending} incident${
        summary.verificationPending === 1 ? "" : "s"
      } still have pending verification.`,
      action: "Review uploaded evidence and approve or reject verification status.",
    });
  }

  if (summary.verificationRejected > 0) {
    insights.push({
      type: "rejected_evidence",
      severity: "warning",
      title: "Rejected evidence is present",
      message: `${summary.verificationRejected} incident${
        summary.verificationRejected === 1 ? "" : "s"
      } have rejected image verification.`,
      action: "Check whether these reports need manual confirmation or cleanup.",
    });
  }

  if (summary.imageCoverageRate < 50 && summary.totalIncidents > 0) {
    insights.push({
      type: "low_image_coverage",
      severity: "info",
      title: "Image evidence coverage is low",
      message: `Only ${summary.imageCoverageRate}% of incident records include image evidence.`,
      action: "Encourage image uploads for stronger incident validation.",
    });
  }

  if (summary.averageConfidence > 0 && summary.averageConfidence < 60) {
    insights.push({
      type: "low_ai_confidence",
      severity: "notice",
      title: "AI confidence needs review",
      message: `Average verification confidence is ${summary.averageConfidence}%.`,
      action: "Use manual verification for low-confidence incident reports.",
    });
  }

  if (!insights.length) {
    insights.push({
      type: "stable_incident_monitoring",
      severity: "success",
      title: "Incident monitoring looks stable",
      message: "No major unresolved or verification bottleneck was detected.",
      action: "Continue monitoring reports, verification quality, and response status.",
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
        ? "Incident monitoring has active records that need follow-up, especially unresolved reports or verification issues."
        : "Incident monitoring appears generally stable based on current records."),
    priorityActions: insights.slice(0, 4).map((item) => item.action),
    insights: insights.slice(0, 5),
    summary: {
      totalIncidents: summary.totalIncidents,
      unresolvedIncidents: summary.unresolvedIncidents,
      resolvedIncidents: summary.resolvedIncidents,
      averageConfidence: summary.averageConfidence,
      verificationPending: summary.verificationPending,
      verificationRejected: summary.verificationRejected,
    },
    fallbackReason,
    cacheHit: false,
  };
};

const getIncidentAnalyticsOverview = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("Get Incident Analytics Overview Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getIncidentAiInsights = async (req, res) => {
  if (incidentAiCache && Date.now() - incidentAiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...incidentAiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - incidentAiCacheTime,
    });
  }

  try {
    const snapshot = await buildAnalyticsSnapshot();
    const fallback = buildRuleBasedAi(snapshot);

    const facts = {
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      statusBreakdown: snapshot.statusBreakdown,
      verificationBreakdown: snapshot.verificationBreakdown,
      topIncidentTypes: snapshot.topIncidentTypes.slice(0, 5),
      levelBreakdown: snapshot.levelBreakdown.slice(0, 5),
      topLocations: snapshot.topLocations.slice(0, 5),
      urgentIncidents: snapshot.urgentIncidents.slice(0, 5),
    };

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO incident monitoring system.
Analyze only the provided incident facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and dashboard-friendly.
- Use facts such as total incidents, active and resolved counts, severity distribution, type distribution, barangay or location patterns, response status, recent trend, unresolved critical incidents, and repeated hotspot patterns only when supported by data.
- Focus recommendations on urgent unresolved incidents, repeated locations, response bottlenecks, trend spikes, and resolution performance.
- Do not say an incident is verified unless the facts contain that.
- Do not invent incidents, barangays, or response actions.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Incident Analytics",
      prompt,
      fallback,
    });

    incidentAiCache = finalPayload;
    incidentAiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Incident AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================
   CLEAN PDF EXPORT DESIGN
   toned-down like Relief PDF
   ========================= */

const PDF_THEME = {
  dark: "#111111",
  green: "#111111",
  green2: "#222222",
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
    .text("Incident AI Analytics Report", x + 20, y + 18, {
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

  if (value === "critical") return { bg: PDF_THEME.softRed, color: PDF_THEME.red, label: "Critical" };
  if (value === "warning") return { bg: PDF_THEME.softGold, color: PDF_THEME.gold, label: "Warning" };
  if (value === "notice") return { bg: PDF_THEME.softGold, color: PDF_THEME.gold, label: "Notice" };
  if (value === "success") return { bg: PDF_THEME.softGreen, color: PDF_THEME.green2, label: "Success" };

  return { bg: PDF_THEME.softBlue, color: PDF_THEME.blue, label: "Info" };
};

const drawPdfSectionTitle = (doc, title, subtitle = "") => {
  ensurePdfPageSpace(doc, 42);

  const x = doc.page.margins.left;
  const width = getPdfPageWidth(doc);

  doc.fillColor(PDF_THEME.dark).font("Helvetica-Bold").fontSize(13).text(title, x, doc.y, {
    width,
  });

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

  doc.fillColor(PDF_THEME.dark).font("Helvetica-Bold").fontSize(10.5).text(title, x + 16, y + 12, {
    width: width - 28,
  });

  doc.fillColor(PDF_THEME.darkText).font("Helvetica").fontSize(9.2).text(body || "-", x + 16, y + 30, {
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

    doc.fillColor(accent).font("Helvetica-Bold").fontSize(18).text(card.value, cx + 11, y + 12, {
      width: cardWidth - 22,
      lineBreak: false,
    });

    doc.fillColor(PDF_THEME.dark).font("Helvetica-Bold").fontSize(7.5).text(card.label, cx + 11, y + 36, {
      width: cardWidth - 22,
      lineBreak: false,
    });

    doc.fillColor(PDF_THEME.gray).font("Helvetica").fontSize(7).text(card.sub || "", cx + 11, y + 49, {
      width: cardWidth - 22,
      lineBreak: false,
    });
  });

  doc.y = y + cardHeight + 18;
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
    doc.fillColor(PDF_THEME.white).font("Helvetica-Bold").fontSize(7.8).text(col.label, cx + 8, y + 8, {
      width: col.width - 16,
      align: col.align || "left",
      height: headerHeight - 10,
      ellipsis: true,
      lineBreak: false,
    });

    cx += col.width;
  });

  doc.y = y + headerHeight;

  rows.slice(0, options.limit || 5).forEach((row, index) => {
    ensurePdfPageSpace(doc, rowHeight + 16);

    y = doc.y;
    const bg = index % 2 === 0 ? PDF_THEME.white : PDF_THEME.light;

    doc.rect(x, y, width, rowHeight).fill(bg);

    cx = x;
    finalColumns.forEach((col) => {
      const rawValue = row[col.key] ?? "-";
      const value = col.format ? col.format(rawValue, row) : rawValue;

      doc.fillColor(PDF_THEME.darkText).font(col.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).text(String(value), cx + 8, y + 8, {
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

  actions.slice(0, 3).forEach((action, index) => {
    ensurePdfPageSpace(doc, 36);

    const x = doc.page.margins.left;
    const width = getPdfPageWidth(doc);
    const y = doc.y;

    drawPdfRoundRect(doc, x, y, width, 32, 10, PDF_THEME.softGreen, "#cdebd4");

    doc.fillColor(PDF_THEME.green2).font("Helvetica-Bold").fontSize(9).text(`${index + 1}`, x + 10, y + 10, {
      width: 16,
      lineBreak: false,
    });

    doc.fillColor(PDF_THEME.darkText).font("Helvetica").fontSize(8.8).text(action, x + 32, y + 9, {
      width: width - 44,
      height: 16,
      lineBreak: false,
    });

    doc.y = y + 40;
  });
};

const drawPdfInsights = (doc, insights = []) => {
  if (!insights.length) return;

  drawPdfSectionTitle(doc, "AI Insights", "Key incident monitoring signals only.");

  insights.slice(0, 3).forEach((insight, index) => {
    ensurePdfPageSpace(doc, 96);

    const x = doc.page.margins.left;
    const width = getPdfPageWidth(doc);
    const y = doc.y;
    const theme = getSeverityTheme(insight.severity);

    drawPdfRoundRect(doc, x, y, width, 84, 14, theme.bg, theme.bg);
    doc.rect(x, y, 5, 84).fill(theme.color);

    doc.fillColor(PDF_THEME.dark).font("Helvetica-Bold").fontSize(10).text(`${index + 1}. ${insight.title || "Insight"}`, x + 16, y + 12, {
      width: width - 112,
      lineBreak: false,
    });

    drawPdfRoundRect(doc, x + width - 86, y + 10, 72, 18, 9, PDF_THEME.white, "#e5e7eb");

    doc.fillColor(theme.color).font("Helvetica-Bold").fontSize(7.5).text(theme.label.toUpperCase(), x + width - 78, y + 15, {
      width: 56,
      align: "center",
      lineBreak: false,
    });

    doc.fillColor(PDF_THEME.darkText).font("Helvetica").fontSize(8.5).text(insight.message || "-", x + 16, y + 34, {
      width: width - 32,
      lineGap: 1.5,
      height: 22,
    });

    doc.fillColor(PDF_THEME.green).font("Helvetica-Bold").fontSize(8).text("Action: ", x + 16, y + 61, {
      continued: true,
    });

    doc.fillColor(PDF_THEME.darkText).font("Helvetica").fontSize(8).text(insight.action || "Review this area.", {
      width: width - 32,
      height: 14,
      lineBreak: false,
    });

    doc.y = y + 96;
  });
};

const exportIncidentAnalyticsPdf = async (req, res) => {
  try {
    const snapshot = await buildAnalyticsSnapshot();
    const ai = incidentAiCache || buildRuleBasedAi(snapshot);
    const severityTheme = getSeverityTheme(ai.overallSeverity);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="incident-ai-analytics-${new Date().toISOString().slice(0, 10)}.pdf"`
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
      "Compact interpretation of incident status, verification quality, and monitoring risks."
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
        label: "Total Incidents",
        value: formatWhole(snapshot.summary.totalIncidents),
        sub: "All reports",
        tone: "green",
      },
      {
        label: "Unresolved",
        value: formatWhole(snapshot.summary.unresolvedIncidents),
        sub: "Needs monitoring",
        tone: snapshot.summary.unresolvedIncidents > 0 ? "warning" : "green",
      },
      {
        label: "Resolved Rate",
        value: `${formatWhole(snapshot.summary.resolvedRate)}%`,
        sub: "Completed reports",
        tone: snapshot.summary.resolvedRate >= 70 ? "green" : "warning",
      },
      {
        label: "Avg Confidence",
        value: `${formatWhole(snapshot.summary.averageConfidence)}%`,
        sub: "AI verification",
        tone: snapshot.summary.averageConfidence >= 60 ? "green" : "warning",
      },
    ]);

    drawPdfKpiGrid(doc, [
      {
        label: "Reported",
        value: formatWhole(snapshot.summary.reportedIncidents),
        sub: "New reports",
        tone: "warning",
      },
      {
        label: "On Process",
        value: formatWhole(snapshot.summary.onProcessIncidents),
        sub: "Being handled",
        tone: "info",
      },
      {
        label: "Resolved",
        value: formatWhole(snapshot.summary.resolvedIncidents),
        sub: "Completed",
        tone: "green",
      },
      {
        label: "Rejected Evidence",
        value: formatWhole(snapshot.summary.verificationRejected),
        sub: "Needs review",
        tone: snapshot.summary.verificationRejected > 0 ? "danger" : "green",
      },
    ]);

    drawPdfActionList(doc, "AI Priority Actions", ai.priorityActions || []);
    drawPdfInsights(doc, ai.insights || []);

    drawPdfCleanTable(
      doc,
      "Top Incident Types",
      snapshot.topIncidentTypes,
      [
        { label: "Incident Type", key: "type", width: 280, bold: true, format: formatLabel },
        { label: "Reports", key: "count", width: 110, align: "right", format: formatWhole },
      ],
      {
        subtitle: "Top recurring incident categories.",
        limit: 5,
      }
    );

    drawPdfCleanTable(
      doc,
      "Top Locations",
      snapshot.topLocations,
      [
        { label: "Location", key: "location", width: 280, bold: true },
        { label: "Reports", key: "count", width: 110, align: "right", format: formatWhole },
      ],
      {
        subtitle: "Locations with the highest number of reports.",
        limit: 5,
      }
    );

    drawPdfCleanTable(
      doc,
      "Urgent Incident Queue",
      snapshot.urgentIncidents,
      [
        { label: "Location", key: "location", width: 170, bold: true },
        { label: "Type", key: "type", width: 100, format: formatLabel },
        { label: "Status", key: "status", width: 90, format: formatLabel },
        {
          label: "Confidence",
          key: "confidence",
          width: 70,
          align: "right",
          format: (value) => `${formatWhole(value)}%`,
        },
      ],
      {
        subtitle: "Top reports ranked by urgency indicators.",
        limit: 5,
      }
    );

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
    console.error("Export Incident Analytics PDF Error:", err);

    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = {
  getIncidentAnalyticsOverview,
  getIncidentAiInsights,
  exportIncidentAnalyticsPdf,
};
