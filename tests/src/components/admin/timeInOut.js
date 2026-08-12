import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaCalendarAlt,
  FaClock,
  FaFilter,
  FaRedo,
  FaSearch,
  FaSignInAlt,
  FaSignOutAlt,
  FaTable,
  FaUserShield,
  FaUsers,
} from "react-icons/fa";
import "../css/timeInOut.css";
import DashboardShell from "../layout/DashboardShell";
import { API_BASE_URL } from "../../config/api";

const ROLE_OPTIONS = [
  { value: "", label: "All Roles" },
  { value: "admin", label: "Admin" },
  { value: "drrmo", label: "DRRMO" },
  { value: "accountant", label: "Accountant" },
  { value: "barangay", label: "Barangay" },
];

const getRoleLabel = (role) => {
  const normalized = String(role || "").trim().toLowerCase();

  if (normalized === "brgy" || normalized === "barangay") return "Barangay";
  if (normalized === "accountant" || normalized === "accounting") return "Accountant";
  if (normalized === "drrmo") return "DRRMO";
  if (normalized === "admin") return "Admin";

  return role || "-";
};

export default function TimeInOut() {
  const navigate = useNavigate();
  const BASE_URL = API_BASE_URL;
  const PAGE_SIZE = 18;

  const [logs, setLogs] = useState([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [totalPagesUI, setTotalPagesUI] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const appRef = useRef(null);
  const toolbarRef = useRef(null);
  const mainRef = useRef(null);
  const regionRef = useRef(null);
  const latestReqId = useRef(0);

  const formatTime = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDuration = (timeIn, timeOut) => {
    if (!timeIn) return "-";

    const start = new Date(timeIn);
    const end = timeOut ? new Date(timeOut) : new Date();
    const diff = end - start;
    const minutes = Math.max(0, Math.floor(diff / 60000));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  };

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const setVars = () => {
      const headerEl = app.querySelector(":scope > *:first-child");
      const headerH = headerEl ? headerEl.offsetHeight : 0;
      const toolbarH = toolbarRef.current ? toolbarRef.current.offsetHeight : 0;

      const mainStyle = window.getComputedStyle(mainRef.current);
      const mainVPad =
        (parseFloat(mainStyle.paddingTop) || 0) + (parseFloat(mainStyle.paddingBottom) || 0);

      app.style.setProperty("--app-header-h", `${headerH}px`);
      app.style.setProperty("--tio-toolbar-h", `${toolbarH}px`);
      app.style.setProperty("--tio-main-vpad", `${mainVPad}px`);
    };

    setVars();

    const onResize = () => setVars();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    const ro = new ResizeObserver(() => setVars());
    if (toolbarRef.current) ro.observe(toolbarRef.current);
    if (mainRef.current) ro.observe(mainRef.current);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      ro.disconnect();
    };
  }, []);

  async function fetchWindow(uiPage) {
    const reqId = ++latestReqId.current;
    setLoading(true);

    try {
      const qs = new URLSearchParams({
        search: searchFilter.trim(),
        role: roleFilter || "",
        date: dateFilter || "",
        page: String(uiPage),
        limit: String(PAGE_SIZE),
      });

      const res = await fetch(`${BASE_URL}/api/timeinout?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (reqId !== latestReqId.current) return;

      if (data && Array.isArray(data.logs)) {
        const arr = data.logs.slice(0, PAGE_SIZE);
        setLogs(arr);

        if (typeof data.totalCount === "number") {
          setTotalCount(data.totalCount);
          setTotalPagesUI(Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)));
        } else if (typeof data.totalPages === "number") {
          setTotalCount(arr.length + Math.max(0, uiPage - 1) * PAGE_SIZE);
          setTotalPagesUI(Math.max(1, data.totalPages));
        } else {
          setTotalCount(arr.length + Math.max(0, uiPage - 1) * PAGE_SIZE);
          setTotalPagesUI(arr.length === PAGE_SIZE ? uiPage + 1 : uiPage);
        }
        return;
      }

      if (Array.isArray(data)) {
        const total = data.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (uiPage > totalPages) {
          setTotalCount(total);
          setTotalPagesUI(totalPages);
          setPage(totalPages);
          return;
        }

        setTotalCount(total);
        setTotalPagesUI(totalPages);

        const start = (uiPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        setLogs(data.slice(start, end));
        return;
      }

      setLogs([]);
      setTotalCount(0);
      setTotalPagesUI(1);
    } catch (error) {
      console.error(error);
      setLogs([]);
      setTotalCount(0);
      setTotalPagesUI(1);
    } finally {
      if (reqId === latestReqId.current) setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    setTotalCount(0);
  }, [searchFilter, roleFilter, dateFilter]);

  useEffect(() => {
    fetchWindow(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchFilter, roleFilter, dateFilter]);

  const hasLogs = logs.length > 0;
  const canPrev = page > 1;
  const canNext = page < totalPagesUI;
  const onlineCount = logs.filter((log) => log.timeOut === null).length;
  const offlineCount = Math.max(0, logs.length - onlineCount);
  const uniqueAccounts = new Set(
    logs.map((log) => String(log.username || "").trim()).filter(Boolean)
  ).size;
  const showingCount = totalCount > 0 ? Math.min(totalCount, (page - 1) * PAGE_SIZE + logs.length) : logs.length;

  return (
    <DashboardShell>
      <div className="tio-app" ref={appRef}>
        <div className="tio-shell">
          <div className="tio-header-card">
            <div className="tio-header">
              <div className="tio-title-wrap">
                <div className="tio-title-icon">
                  <FaUserShield />
                </div>

                <div>
                  <span className="tio-eyebrow">Admin Oversight</span>
                  <h1 className="tio-title">Account Time Logs</h1>
                </div>
              </div>

              <div className="tio-actions">
                <button
                  type="button"
                  className="tio-button"
                  onClick={() => fetchWindow(page)}
                  disabled={loading}
                >
                  <FaRedo />
                  {loading ? "Refreshing..." : "Refresh"}
                </button>

                <button type="button" className="tio-button" onClick={() => navigate(-1)}>
                  Back
                </button>
              </div>
            </div>

            <div className="tio-toolbar" ref={toolbarRef} aria-hidden="true" />
          </div>

          <div className="tio-filters">
            <label className="tio-filter-group">
              <span className="tio-filter-label">
                <FaSearch />
                Search
              </span>
              <input
                className="tio-input"
                type="search"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search username, role, barangay..."
                aria-label="Search account time logs"
              />
            </label>

            <label className="tio-filter-group">
              <span className="tio-filter-label">
                <FaFilter />
                Role
              </span>
              <select
                className="tio-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="tio-filter-group">
              <span className="tio-filter-label">
                <FaCalendarAlt />
                Date
              </span>
              <input
                className="tio-input"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Filter by date"
              />
            </label>

            <button
              type="button"
              className="tio-button tio-button-ghost"
              onClick={() => {
                setSearchFilter("");
                setRoleFilter("");
                setDateFilter("");
              }}
              disabled={!searchFilter && !roleFilter && !dateFilter}
            >
              Clear Filters
            </button>
          </div>

          <div className="tio-summary">
            <div className="tio-summary-card">
              <span className="tio-summary-icon">
                <FaTable />
              </span>
              <span className="tio-summary-label">Visible logs</span>
              <span className="tio-summary-value">{loading ? "..." : showingCount}</span>
            </div>

            <div className="tio-summary-card">
              <span className="tio-summary-icon">
                <FaSignInAlt />
              </span>
              <span className="tio-summary-label">Online now</span>
              <span className="tio-summary-value">{loading ? "..." : onlineCount}</span>
            </div>

            <div className="tio-summary-card">
              <span className="tio-summary-icon">
                <FaSignOutAlt />
              </span>
              <span className="tio-summary-label">Offline shown</span>
              <span className="tio-summary-value">{loading ? "..." : offlineCount}</span>
            </div>

            <div className="tio-summary-card">
              <span className="tio-summary-icon">
                <FaUsers />
              </span>
              <span className="tio-summary-label">Accounts shown</span>
              <span className="tio-summary-value">{loading ? "..." : uniqueAccounts}</span>
            </div>
          </div>

          <main className="tio-main" role="main" ref={mainRef}>
            <section className="tio-table-region" aria-label="Time logs table" ref={regionRef}>
              <div className="tio-table-head">
                <div>
                  <span className="tio-table-eyebrow">Session Records</span>
                  <h2 className="tio-table-title">Time In &amp; Time Out List</h2>
                </div>

                <div className="tio-table-meta">
                  <FaClock />
                  <span>
                    {loading
                      ? "Loading logs..."
                      : totalCount > 0
                        ? `Showing ${showingCount} of ${totalCount} record(s)`
                        : "No records found"}
                  </span>
                </div>
              </div>

              <div className="tio-table-wrap">
                <table className="tio-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && !hasLogs && (
                      <tr className="tio-empty-row">
                        <td colSpan={6}>
                          <div className="tio-empty-inline">
                            <div className="tio-empty-emoji" aria-hidden="true">🕒</div>
                            <div className="tio-empty-text">
                              <strong>No logs found</strong>
                              <span className="tio-muted">Adjust the filters to see matching session records.</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {hasLogs &&
                      logs.map((log) => (
                        <tr key={log._id}>
                          <td data-label="Username" title={log.username || ""}>
                            {log.username || "—"}
                          </td>
                          <td data-label="Role" title={getRoleLabel(log.role)}>
                            {getRoleLabel(log.role)}
                          </td>
                          <td data-label="Status">
                            {log.timeOut === null ? (
                              <span className="tio-status tio-online">Online</span>
                            ) : (
                              <span className="tio-status tio-offline">Offline</span>
                            )}
                          </td>
                          <td data-label="Time In">{formatTime(log.timeIn)}</td>
                          <td data-label="Time Out">{formatTime(log.timeOut)}</td>
                          <td data-label="Duration">{getDuration(log.timeIn, log.timeOut)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="tio-pagination">
                <button
                  className="tio-btn"
                  disabled={!canPrev}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  aria-label="Previous page"
                >
                  ← Prev
                </button>

                <span className="tio-page">
                  Page {page} of {totalPagesUI || 1}
                </span>

                <button
                  className="tio-btn"
                  disabled={!canNext}
                  onClick={() => setPage((prev) => prev + 1)}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    </DashboardShell>
  );
}
