import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBell,
  FaBoxOpen,
  FaBullhorn,
  FaClipboardList,
  FaDonate,
  FaExclamationTriangle,
  FaHospital,
  FaFilePdf,
  FaRedo,
  FaRegBell,
  FaSearch,
  FaShieldAlt,
  FaUserShield,
} from "react-icons/fa";
import DashboardShell from "./layout/DashboardShell";
import "./css/AuditTrails.css";
import { API_BASE_URL } from "../config/api";

const BASE_URL = API_BASE_URL;
const POLL_MS = 15000;

const moduleLabels = {
  all: "All modules",
  relief: "Relief",
  inventory: "Inventory",
  donation: "Donation",
  announcement: "Announcement",
  incident: "Incident",
  evacuation: "Evacuation",
  guidelines: "Guidelines",
  account: "Account",
  analytics: "Analytics",
  system: "System",
};

const actorRoleLabels = {
  all: "All roles",
  admin: "Admin",
  drrmo: "DRRMO",
  accountant: "Accountant",
  barangay: "Barangay",
  system: "System",
};

const fixedActorRoles = ["admin", "drrmo", "accountant", "barangay", "system"];
const fixedModules = [
  "relief",
  "inventory",
  "donation",
  "announcement",
  "incident",
  "evacuation",
  "guidelines",
  "account",
  "analytics",
  "system",
];

function formatDateTime(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateHeading(value) {
  if (!value) return "Unknown date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTimeAgo(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDateTime(value);
}

function getModuleIcon(moduleName) {
  if (moduleName === "relief") return <FaClipboardList />;
  if (moduleName === "inventory") return <FaBoxOpen />;
  if (moduleName === "donation") return <FaDonate />;
  if (moduleName === "announcement") return <FaBullhorn />;
  if (moduleName === "incident") return <FaExclamationTriangle />;
  if (moduleName === "evacuation") return <FaHospital />;
  if (moduleName === "account") return <FaUserShield />;
  return <FaShieldAlt />;
}

function getEmptyCopy(selectedModule) {
  if (selectedModule === "relief") {
    return "Relief actions like request submission, review, release, and receipt confirmation will appear here.";
  }

  if (selectedModule === "inventory") {
    return "Inventory actions like low stock alerts, releases, and item updates will appear here.";
  }

  if (selectedModule === "evacuation") {
    return "Evacuation updates and center activity will appear here.";
  }

  return "Admin audit entries will appear here once activities are recorded.";
}

export default function AuditTrails() {
  const navigate = useNavigate();
  const role = String(localStorage.getItem("role") || "").toLowerCase();

  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState({ modules: [], actorRoles: [] });
  const [summary, setSummary] = useState({
    total: 0,
    today: 0,
    modules: 0,
    actors: 0,
    highPriority: 0,
  });

  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedActorRole, setSelectedActorRole] = useState("all");
  const [selectedDays, setSelectedDays] = useState("7");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (role !== "admin") {
      navigate("/");
    }
  }, [navigate, role]);

  const buildAuditQueryParams = (limit = "500") => {
    const params = new URLSearchParams();
    params.set("limit", limit);
    if (selectedModule !== "all") params.set("module", selectedModule);
    if (selectedActorRole !== "all") params.set("actorRole", selectedActorRole);
    if (search.trim()) params.set("search", search.trim());
    if (selectedDays !== "all") params.set("days", selectedDays);
    return params;
  };

  const exportAuditPdf = () => {
    const params = buildAuditQueryParams("500");
    window.open(
      `${BASE_URL}/api/audit/export-pdf?${params.toString()}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const fetchAuditTrail = async ({ background = false } = {}) => {
    try {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const params = buildAuditQueryParams("250");

      const res = await fetch(`${BASE_URL}/api/audit?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to load admin audit trail.");
      }

      setEvents(Array.isArray(data.events) ? data.events : []);
      setFilters({
        modules: Array.isArray(data.filters?.modules) ? data.filters.modules : [],
        actorRoles: Array.isArray(data.filters?.actorRoles) ? data.filters.actorRoles : [],
      });
      setSummary(
        data.summary || {
          total: 0,
          today: 0,
          modules: 0,
          actors: 0,
          highPriority: 0,
        }
      );
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || "Failed to load admin audit trail.");
      if (!background) {
        setEvents([]);
        setFilters({ modules: [], actorRoles: [] });
        setSummary({
          total: 0,
          today: 0,
          modules: 0,
          actors: 0,
          highPriority: 0,
        });
      }
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAuditTrail();
    const interval = window.setInterval(() => {
      fetchAuditTrail({ background: true });
    }, POLL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedActorRole, selectedDays, search]);

  const groupedEvents = useMemo(() => {
    return events.reduce((acc, event) => {
      const key = formatDateHeading(event.createdAt);
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [events]);

  const groupedEntries = useMemo(() => Object.entries(groupedEvents), [groupedEvents]);

  const availableModules = useMemo(() => {
    const seen = new Set(["all"]);
    const fixedModuleOptions = fixedModules.map((moduleValue) => {
      seen.add(moduleValue);
      return {
        value: moduleValue,
        label: moduleLabels[moduleValue],
      };
    });

    return [
      { value: "all", label: moduleLabels.all },
      ...fixedModuleOptions,
      ...filters.modules.filter((moduleOption) => {
        const value = String(moduleOption?.value || "").toLowerCase();
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      }),
    ];
  }, [filters.modules]);

  const availableActorRoles = useMemo(() => {
    const seen = new Set(["all"]);
    const fixedRoles = fixedActorRoles.map((roleValue) => {
      seen.add(roleValue);
      return {
        value: roleValue,
        label: actorRoleLabels[roleValue],
      };
    });

    return [
      { value: "all", label: actorRoleLabels.all },
      ...fixedRoles,
      ...filters.actorRoles.filter((roleOption) => {
        const value = String(roleOption?.value || "").toLowerCase();
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      }),
    ];
  }, [filters.actorRoles]);

  return (
    <DashboardShell>
      <div className="audit-page">
        <div className="audit-shell">
          <div className="audit-header-card">
            <div className="audit-header">
              <div className="audit-title-wrap">
                <div className="audit-title-icon">
                  <FaUserShield />
                </div>

                <div>
                  <span className="audit-eyebrow">Admin Oversight</span>
                  <h1 className="audit-title">System Audit Trail</h1>
                  {lastUpdated ? (
                    <p className="audit-subtitle">
                      Last updated {getTimeAgo(lastUpdated)}.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="audit-actions">
                <button
                  type="button"
                  className="audit-button"
                  onClick={exportAuditPdf}
                  disabled={loading || events.length === 0}
                >
                  <FaFilePdf />
                  Export PDF
                </button>

                <button
                  type="button"
                  className="audit-button"
                  onClick={fetchAuditTrail}
                  disabled={loading || refreshing}
                >
                  <FaRedo />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div className="audit-toolbar">
              <span className="audit-toolbar-note">
                Use this to verify actions like who released relief, who confirmed receipts,
                and which module the activity came from.
              </span>
            </div>
          </div>

          {error ? <div className="audit-error-row">{error}</div> : null}

          <div className="audit-filters">
            <div className="audit-search-wrap">
              <FaSearch />
              <input
                className="audit-search-input"
                type="text"
                placeholder="Search username, barangay, request no., message..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <label className="audit-filter-field">
              <span>Module</span>
              <select
                className="audit-select"
                value={selectedModule}
                onChange={(event) => setSelectedModule(event.target.value)}
              >
                {availableModules.map((moduleOption) => (
                  <option key={moduleOption.value} value={moduleOption.value}>
                    {moduleOption.label || moduleLabels[moduleOption.value] || moduleOption.value}
                  </option>
                ))}
              </select>
            </label>

            <label className="audit-filter-field">
              <span>Role</span>
              <select
                className="audit-select"
                value={selectedActorRole}
                onChange={(event) => setSelectedActorRole(event.target.value)}
              >
                {availableActorRoles.map((roleOption) => (
                  <option key={roleOption.value} value={roleOption.value}>
                    {roleOption.label || actorRoleLabels[roleOption.value] || roleOption.value}
                  </option>
                ))}
              </select>
            </label>

            <label className="audit-filter-field">
              <span>Date Range</span>
              <select
                className="audit-select"
                value={selectedDays}
                onChange={(event) => setSelectedDays(event.target.value)}
              >
                <option value="1">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </label>
          </div>

          <div className="audit-summary">
            <div className="audit-summary-card">
              <span className="audit-summary-label">Visible Events</span>
              <span className="audit-summary-value">{summary.total}</span>
            </div>

            <div className="audit-summary-card">
              <span className="audit-summary-label">Today</span>
              <span className="audit-summary-value">{summary.today}</span>
            </div>

            <div className="audit-summary-card">
              <span className="audit-summary-label">Modules</span>
              <span className="audit-summary-value">{summary.modules}</span>
            </div>

            <div className="audit-summary-card">
              <span className="audit-summary-label">Accounts</span>
              <span className="audit-summary-value">{summary.actors}</span>
            </div>
          </div>

          {loading ? (
            <div className="audit-empty-state">
              <FaRegBell />
              <p className="audit-empty-title">Loading audit trail...</p>
              <p className="audit-empty-copy">Checking the latest system activity.</p>
            </div>
          ) : groupedEntries.length === 0 ? (
            <div className="audit-empty-state">
              <FaBell />
              <p className="audit-empty-title">No audit entries found</p>
              <p className="audit-empty-copy">{getEmptyCopy(selectedModule)}</p>
            </div>
          ) : (
            <div className="audit-timeline">
              {groupedEntries.map(([dateLabel, dayEvents]) => (
                <section key={dateLabel} className="audit-day-group">
                  <div className="audit-day-head">
                    <h2>{dateLabel}</h2>
                    <span>{dayEvents.length} event(s)</span>
                  </div>

                  <div className="audit-event-list">
                    {dayEvents.map((event) => (
                      <article
                        key={event._id}
                        className={`audit-event-card module-${event.module} priority-${event.priority}`}
                      >
                        <div className="audit-event-icon">
                          {getModuleIcon(event.module)}
                        </div>

                        <div className="audit-event-content">
                          <div className="audit-event-top">
                            <h3 className="audit-event-title">{event.title}</h3>
                            <span className="audit-event-time">
                              {getTimeAgo(event.createdAt)}
                            </span>
                          </div>

                          <p className="audit-event-message">{event.message}</p>

                          <div className="audit-event-meta">
                            <span className="audit-pill">
                              {event.moduleLabel || moduleLabels[event.module] || event.module}
                            </span>
                            <span className="audit-pill actor">
                              {event.actorName} · {event.actorRoleLabel || event.actorRole}
                            </span>
                            {event.barangayName ? (
                              <span className="audit-pill">{event.barangayName}</span>
                            ) : null}
                            {event.requestNo ? (
                              <span className="audit-pill">{event.requestNo}</span>
                            ) : null}
                            {event.disaster ? (
                              <span className="audit-pill">{event.disaster}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="audit-event-side">
                          <span className={`audit-priority priority-${event.priority}`}>
                            {event.priority}
                          </span>
                          <span className="audit-event-date">
                            {formatDateTime(event.createdAt)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
