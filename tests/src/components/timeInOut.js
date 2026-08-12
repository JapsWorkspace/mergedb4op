// src/components/timeInOut.js
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/timeInOut.css';
import DashboardShell from './layout/DashboardShell';
import { API_BASE_URL } from "../config/api";
import { getTodayInputDate } from "./Donations/inventoryExpiryUtils";

export default function TimeInOut() {
  const navigate = useNavigate();
  const minAllowedDate = getTodayInputDate();
  // ---- CONSTANT: Fixed page size ----
  const PAGE_SIZE = 18;

  // State
  const [logs, setLogs] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [totalPagesUI, setTotalPagesUI] = useState(1);
  const [totalCount, setTotalCount] = useState(null);

  // Refs for sizing (CSS variables) and request race-protection
  const appRef = useRef(null);
  const toolbarRef = useRef(null);
  const mainRef = useRef(null);
  const regionRef = useRef(null);
  const latestReqId = useRef(0);

  // ---------- Helpers ----------
  const formatTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDuration = (timeIn, timeOut) => {
    if (!timeIn) return '-';
    const start = new Date(timeIn);
    const end = timeOut ? new Date(timeOut) : new Date();
    const diff = end - start;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // ---------- Set CSS vars from actual Header/Toolbar heights ----------
  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const setVars = () => {
      const headerEl = app.querySelector(':scope > *:first-child'); // <Header/> previously; now toolbar will be first child
      const headerH = headerEl ? headerEl.offsetHeight : 0;
      const toolbarH = toolbarRef.current ? toolbarRef.current.offsetHeight : 0;

      const mainStyle = window.getComputedStyle(mainRef.current);
      const mainVPad =
        (parseFloat(mainStyle.paddingTop) || 0) + (parseFloat(mainStyle.paddingBottom) || 0);

      app.style.setProperty('--app-header-h', `${headerH}px`);
      app.style.setProperty('--tio-toolbar-h', `${toolbarH}px`);
      app.style.setProperty('--tio-main-vpad', `${mainVPad}px`);
    };

    setVars();
    const onResize = () => setVars();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const ro = new ResizeObserver(() => setVars());
    if (toolbarRef.current) ro.observe(toolbarRef.current);
    if (mainRef.current) ro.observe(mainRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
    };
  }, []);

  // ---------- Fetch exactly PAGE_SIZE items for the current UI page ----------
  async function fetchWindow(uiPage) {
    const reqId = ++latestReqId.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        role: roleFilter || '',
        date: dateFilter || '',
        page: String(uiPage),
        limit: String(PAGE_SIZE)   // fixed page size (18)
      });

      const res = await fetch(`${API_BASE_URL}/api/timeinout?${qs}`, {
        credentials: 'include'
      });
      const data = await res.json();

      // If a newer request finished first, ignore this result
      if (reqId !== latestReqId.current) return;

      // Paginated shape with logs array
      if (data && Array.isArray(data.logs)) {
        const arr = data.logs.slice(0, PAGE_SIZE); // trust backend limit; slice just in case
        setLogs(arr);

        // Prefer exact totalCount if provided
        if (typeof data.totalCount === 'number') {
          setTotalCount(data.totalCount);
          setTotalPagesUI(Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)));
        } else if (typeof data.totalPages === 'number') {
          // If only totalPages is provided, trust it
          setTotalCount(null);
          setTotalPagesUI(Math.max(1, data.totalPages));
        } else {
          // Fallback: at least 1 page
          setTotalCount(null);
          setTotalPagesUI(arr.length === PAGE_SIZE ? uiPage + 1 : uiPage);
        }
        return;
      }

      // Raw array fallback (no server pagination)
      if (Array.isArray(data)) {
        const total = data.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        // Clamp page if out of range (e.g., filter reduced total)
        if (uiPage > totalPages) {
          setTotalCount(total);
          setTotalPagesUI(totalPages);
          setPage(totalPages); // will trigger a new fetch
          return;
        }
        setTotalCount(total);
        setTotalPagesUI(totalPages);

        const start = (uiPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        setLogs(data.slice(start, end));
        return;
      }

      // Unknown shape -> empty
      setLogs([]);
      setTotalCount(0);
      setTotalPagesUI(1);
    } catch (e) {
      console.error(e);
      // On error keep the current view but prevent next from going wild
      setLogs([]);
      setTotalCount(0);
      setTotalPagesUI(1);
    } finally {
      if (reqId === latestReqId.current) setLoading(false);
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setTotalCount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, dateFilter]);

  // Refetch when page or filters change
  useEffect(() => {
    fetchWindow(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roleFilter, dateFilter]);

  const hasLogs = Array.isArray(logs) && logs.length > 0;
  const canPrev = page > 1;
  const canNext =
    typeof totalPagesUI === 'number'
      ? page < totalPagesUI
      : logs.length === PAGE_SIZE; // ultra-fallback

  return (
    <DashboardShell>
      <div className="tio-app" ref={appRef}>
        {/* Sticky dark toolbar */}
        <div className="tio-toolbar" ref={toolbarRef}>
          <div className="tio-toolbar-left">
            <h1 className="tio-title">Account Time Logs</h1>
            <span className="tio-meta">
              {loading ? 'Loading…' : hasLogs ? `${logs.length}/${PAGE_SIZE} rows` : 'No records'}
            </span>
          </div>

          <div className="tio-toolbar-right">
            <select
              className="tio-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="drrmo">DRRMO</option>
              <option value="brgy">BRGY</option>
            </select>

            <input
              className="tio-input"
              type="date"
              value={dateFilter}
              min={minAllowedDate}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date"
            />
            <button onClick={() => navigate(-1)} className="ea-back">Back</button>
          </div>
        </div>

        {/* Main content region — PAGE never scrolls; PANEL scrolls */}
        <main className="tio-main" role="main" ref={mainRef}>
          {/* Two-row grid: [table area 1fr] + [pagination auto] */}
          <section className="tio-table-region" aria-label="Time logs table" ref={regionRef}>
            {/* ⬇️ This is the ONLY scrollable area */}
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
                            <span className="tio-muted">Adjust filters to see results.</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {hasLogs && logs.map((log) => (
                    <tr key={log._id}>
                      <td data-label="Username" title={log.username || ''}>
                        {log.username || '—'}
                      </td>
                      <td data-label="Role" title={log.role || ''}>
                        {log.role || '—'}
                      </td>
                      <td data-label="Status">
                        {log.timeOut === null
                          ? <span className="tio-status tio-online">Online</span>
                          : <span className="tio-status tio-offline">Offline</span>}
                      </td>
                      <td data-label="Time In">{formatTime(log.timeIn)}</td>
                      <td data-label="Time Out">{formatTime(log.timeOut)}</td>
                      <td data-label="Duration">{getDuration(log.timeIn, log.timeOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination — always visible (grid row 2) */}
            <div className="tio-pagination">
              <button
                className="tio-btn"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
          </section>
        </main>
      </div>
    </DashboardShell>
  );
}
