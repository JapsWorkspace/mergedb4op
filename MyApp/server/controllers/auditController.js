const Audit = require("../models/Audit");
const {
  createPdfDocument,
  drawPdfEmptyState,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfLabelValue,
  drawPdfSectionTitle,
  drawPdfTable,
  formatPdfDateValue,
} = require("../utils/pdfTheme");
const {
  buildAuditSearchText,
  formatModuleLabel,
  formatRoleLabel,
  mapAuditDocToEvent,
  normalizeActorRoleValue,
  normalizeModuleValue,
  normalizeString,
} = require("../utils/auditEventUtils");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLower = (value) => normalizeString(value).toLowerCase();

const getAuditFiltersFromRequest = (req) => {
  const moduleFilter = normalizeLower(req.query.module);
  const actorRoleFilter = normalizeLower(req.query.actorRole);
  const searchQuery = normalizeLower(req.query.search);
  const days = Math.max(0, toNumber(req.query.days));
  const limit = Math.min(500, Math.max(25, toNumber(req.query.limit) || 250));

  return {
    moduleFilter,
    actorRoleFilter,
    searchQuery,
    days,
    limit,
  };
};

const buildAuditMongoQuery = ({ moduleFilter, actorRoleFilter, days }) => {
  const auditQuery = {};

  if (moduleFilter && moduleFilter !== "all") {
    auditQuery.module = normalizeModuleValue(moduleFilter);
  }

  if (actorRoleFilter && actorRoleFilter !== "all") {
    auditQuery.actorRole = normalizeActorRoleValue(actorRoleFilter);
  }

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    auditQuery.$or = [{ createdAt: { $gte: since } }, { actionAt: { $gte: since } }];
  }

  return auditQuery;
};

const getFilteredAuditEvents = async (filters = {}) => {
  const { searchQuery, limit } = filters;
  const auditQuery = buildAuditMongoQuery(filters);

  const audits = await Audit.find(auditQuery)
    .sort({ actionAt: -1, createdAt: -1 })
    .limit(limit);

  const normalizedEvents = audits
    .map(mapAuditDocToEvent)
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  return searchQuery
    ? normalizedEvents.filter((event) => buildAuditSearchText(event).includes(searchQuery))
    : normalizedEvents;
};

const getFilterOptionEvents = async ({ days }) => {
  const filterOptionsQuery = {};
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    filterOptionsQuery.$or = [{ createdAt: { $gte: since } }, { actionAt: { $gte: since } }];
  }

  const filterOptionAudits = await Audit.find(filterOptionsQuery)
    .sort({ actionAt: -1, createdAt: -1 })
    .limit(500);

  return filterOptionAudits.map(mapAuditDocToEvent);
};

const requireAdminSession = (req, res) => {
  if (!req.session?.userId) {
    res.status(401).json({ message: "Not authenticated" });
    return false;
  }

  if (normalizeLower(req.session.role) !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return false;
  }

  return true;
};

const buildSummary = (events = []) => {
  const modules = new Set();
  const actors = new Set();
  let todayCount = 0;
  let highPriorityCount = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  events.forEach((event) => {
    if (event.module) modules.add(event.module);
    if (event.actorName) actors.add(`${event.actorRole}:${event.actorName}`);
    if (["high", "critical"].includes(event.priority)) highPriorityCount += 1;

    const eventDate = event.createdAt ? new Date(event.createdAt) : null;
    if (eventDate && !Number.isNaN(eventDate.getTime()) && eventDate >= todayStart) {
      todayCount += 1;
    }
  });

  return {
    total: events.length,
    today: todayCount,
    modules: modules.size,
    actors: actors.size,
    highPriority: highPriorityCount,
  };
};

const getAuditLogs = async (req, res) => {
  try {
    if (!requireAdminSession(req, res)) return;

    const filterValues = getAuditFiltersFromRequest(req);
    const filterBaseEvents = await getFilteredAuditEvents(filterValues);
    const optionBaseEvents = await getFilterOptionEvents(filterValues);

    const availableModules = Array.from(
      new Set(optionBaseEvents.map((event) => event.module).filter(Boolean))
    ).sort();

    const availableActorRoles = Array.from(
      new Set(optionBaseEvents.map((event) => event.actorRole).filter(Boolean))
    ).sort();

    res.json({
      events: filterBaseEvents,
      filters: {
        modules: availableModules.map((moduleName) => ({
          value: moduleName,
          label: formatModuleLabel(moduleName),
        })),
        actorRoles: availableActorRoles.map((roleName) => ({
          value: roleName,
          label: formatRoleLabel(roleName),
        })),
      },
      summary: buildSummary(filterBaseEvents),
    });
  } catch (err) {
    console.error("Audit log fetch error:", err);
    res.status(500).json({ message: "Failed to load audit logs" });
  }
};

const buildAuditPdfRows = (events = []) =>
  events.map((event) => {
    const references = [
      event.requestNo ? `Request: ${event.requestNo}` : "",
      event.releaseNo ? `Release: ${event.releaseNo}` : "",
      event.disaster ? `Disaster: ${event.disaster}` : "",
      event.status ? `Status: ${event.status}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const actor = [event.actorName, formatRoleLabel(event.actorRole)]
      .filter(Boolean)
      .join("\n");

    return {
      date: formatPdfDateValue(event.createdAt),
      module: formatModuleLabel(event.module),
      priority: normalizeString(event.priority) || "Normal",
      title: event.title || event.type || "Audit event",
      actor: actor || "-",
      barangay: event.barangayName || "-",
      details: [event.message, references].filter(Boolean).join("\n"),
    };
  });

const exportAuditLogsPdf = async (req, res) => {
  try {
    if (!requireAdminSession(req, res)) return;

    const filterValues = getAuditFiltersFromRequest(req);
    filterValues.limit = Math.min(500, Math.max(25, toNumber(req.query.limit) || 500));

    const events = await getFilteredAuditEvents(filterValues);
    const summary = buildSummary(events);

    const moduleLabel =
      filterValues.moduleFilter && filterValues.moduleFilter !== "all"
        ? formatModuleLabel(filterValues.moduleFilter)
        : "All modules";
    const roleLabel =
      filterValues.actorRoleFilter && filterValues.actorRoleFilter !== "all"
        ? formatRoleLabel(filterValues.actorRoleFilter)
        : "All roles";
    const dateRangeLabel =
      filterValues.days > 0 ? `Last ${filterValues.days} day(s)` : "All dates";

    const doc = createPdfDocument({
      layout: "landscape",
      margin: 24,
    });

    const filename = `system-audit-trail-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    doc.pipe(res);

    drawPdfHeader(doc, {
      title: "System Audit Trail Report",
      subtitle: "Generated from Sagip Bayan audit records",
    });

    drawPdfSectionTitle(doc, "Summary", { spacingBefore: 0 });
    drawPdfLabelValue(doc, "Visible Events:", summary.total);
    drawPdfLabelValue(doc, "Today:", summary.today);
    drawPdfLabelValue(doc, "Modules:", summary.modules);
    drawPdfLabelValue(doc, "Accounts:", summary.actors);
    drawPdfLabelValue(doc, "Module Filter:", moduleLabel);
    drawPdfLabelValue(doc, "Role Filter:", roleLabel);
    drawPdfLabelValue(doc, "Date Range:", dateRangeLabel);
    if (filterValues.searchQuery) {
      drawPdfLabelValue(doc, "Search:", req.query.search);
    }

    drawPdfSectionTitle(doc, "Audit Events");

    if (!events.length) {
      drawPdfEmptyState(doc, "No audit events found for the selected filters.");
    } else {
      drawPdfTable(
        doc,
        [
          { key: "date", label: "Date", width: 92 },
          { key: "module", label: "Module", width: 66 },
          { key: "priority", label: "Priority", width: 52 },
          { key: "title", label: "Event", width: 124 },
          { key: "actor", label: "Account", width: 88 },
          { key: "barangay", label: "Barangay", width: 96 },
          { key: "details", label: "Details", width: 250 },
        ],
        buildAuditPdfRows(events),
        {
          fontSize: 7.2,
          headerHeight: 18,
          rowHeight: 52,
          emptyMessage: "No audit events found for the selected filters.",
        }
      );
    }

    drawPdfFooter(doc);
    doc.end();
  } catch (err) {
    console.error("Audit PDF export error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to export audit trail PDF" });
    } else {
      res.end();
    }
  }
};

module.exports = { exportAuditLogsPdf, getAuditLogs };
