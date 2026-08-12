import { useEffect, useMemo, useState } from 'react';
import '../css/AdminLogs.css';
import axios from 'axios';
import { API_BASE_URL } from "../../config/api";

export default function AdminLogs() {
  const BASE_URL = API_BASE_URL;
  const PAGE_SIZE = 10;

  const [allLogs, setAllLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  const actionClass = (action) => {
    switch (String(action || '').toLowerCase()) {
      case 'create':
        return 'admin-create';
      case 'update':
        return 'admin-update';
      case 'archive':
        return 'admin-archive';
      case 'restore':
        return 'admin-restore';
      default:
        return 'admin-default';
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/auth/admin/logs`, {
        withCredentials: true
      });

      const arr = Array.isArray(res.data) ? res.data : [];
      setAllLogs(arr);
    } catch (e) {
      console.error(e);
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, dateFilter, sortOrder]);

  const formatTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const isWithinDateFilter = (timestamp, filterValue) => {
    if (!filterValue || !timestamp) return true;

    const logDate = new Date(timestamp);
    if (Number.isNaN(logDate.getTime())) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filterValue === 'today') {
      return logDate >= startOfToday;
    }

    if (filterValue === '7days') {
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return logDate >= sevenDaysAgo;
    }

    if (filterValue === '30days') {
      const thirtyDaysAgo = new Date(startOfToday);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return logDate >= thirtyDaysAgo;
    }

    return true;
  };

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = allLogs.filter((log) => {
      const adminUsername = String(log.adminUsername || '').toLowerCase();
      const targetUsername = String(log.targetUsername || '').toLowerCase();
      const action = String(log.action || '').toLowerCase();
      const barangay = String(log.barangay || '').toLowerCase();

      const matchesSearch =
        !term ||
        adminUsername.includes(term) ||
        targetUsername.includes(term) ||
        action.includes(term) ||
        barangay.includes(term);

      const matchesAction =
        !actionFilter || String(log.action || '').toLowerCase() === actionFilter;

      const matchesDate = isWithinDateFilter(log.timestamp, dateFilter);

      return matchesSearch && matchesAction && matchesDate;
    });

    filtered.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();

      if (sortOrder === 'oldest') return aTime - bTime;
      return bTime - aTime;
    });

    return filtered;
  }, [allLogs, search, actionFilter, dateFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedLogs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, safePage]);

  const stats = useMemo(() => {
    return allLogs.reduce(
      (acc, log) => {
        const action = String(log.action || '').toLowerCase();
        acc.total += 1;
        if (action === 'create') acc.create += 1;
        if (action === 'update') acc.update += 1;
        if (action === 'archive') acc.archive += 1;
        if (action === 'restore') acc.restore += 1;
        return acc;
      },
      { total: 0, create: 0, update: 0, archive: 0, restore: 0 }
    );
  }, [allLogs]);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;
  const hasActiveFilters = Boolean(
    search.trim() || actionFilter || dateFilter || sortOrder !== 'newest'
  );

  const statCards = [
    { label: 'Total Logs', value: loading ? '—' : stats.total, tone: 'green', lead: true },
    { label: 'Created', value: loading ? '—' : stats.create, tone: 'create' },
    { label: 'Updated', value: loading ? '—' : stats.update, tone: 'update' },
    { label: 'Archived', value: loading ? '—' : stats.archive, tone: 'archive' },
    { label: 'Restored', value: loading ? '—' : stats.restore, tone: 'restore' }
  ];

  return (
    <div className="admin-logs-page">
      <div className="admin-logs-shell">
        <section className="admin-logs-hero">
          <div className="admin-logs-hero-copy">
            <div className="admin-logs-kicker-row">
              <span className="admin-logs-kicker">Administration Module</span>
              {hasActiveFilters && (
                <span className="admin-logs-mini-badge">Filtered View</span>
              )}
            </div>

            <h1 className="admin-logs-title">Admin Activity Logs</h1>

            <div className="admin-logs-stats">
              {statCards.map((item) => (
                <div
                  key={item.label}
                  className={`admin-stat-card admin-stat-card--${item.tone} ${item.lead ? 'is-lead' : ''}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-logs-panel">
          <div className="admin-logs-toolbar admin-logs-toolbar--top">
            <input
              className="admin-logs-search"
              type="text"
              placeholder="Search admin, target user, barangay, or action"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="admin-logs-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="archive">Archive</option>
              <option value="restore">Restore</option>
            </select>
          </div>

          <div className="admin-logs-toolbar admin-logs-toolbar--bottom">
            <select
              className="admin-logs-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>

            <select
              className="admin-logs-filter"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>

          <div className="admin-logs-toolbar-meta">
            <span className="admin-results-text">
              {loading
                ? 'Loading records...'
                : `${filteredLogs.length} result${filteredLogs.length === 1 ? '' : 's'}`}
            </span>

            <div className="admin-toolbar-actions">
              {hasActiveFilters && !loading && (
                <button
                  type="button"
                  className="admin-btn admin-btn-clear"
                  onClick={() => {
                    setSearch('');
                    setActionFilter('');
                    setDateFilter('');
                    setSortOrder('newest');
                  }}
                >
                  Clear Filters
                </button>
              )}

              <button
                type="button"
                className="admin-btn admin-btn-refresh"
                onClick={fetchLogs}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="admin-logs-table-region">
            <div className="admin-logs-table-wrap">
              <table className="admin-logs-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target User</th>
                    <th>Barangay</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr className="admin-empty-row">
                      <td colSpan={5}>
                        <div className="admin-empty-inline">
                          <div className="admin-empty-emoji">⏳</div>
                          <div className="admin-empty-text">
                            <strong>Loading admin logs...</strong>
                            <span className="admin-muted">
                              Please wait while records are being fetched.
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : allLogs.length === 0 ? (
                    <tr className="admin-empty-row">
                      <td colSpan={5}>
                        <div className="admin-empty-inline">
                          <div className="admin-empty-emoji">📝</div>
                          <div className="admin-empty-text">
                            <strong>No activity records yet</strong>
                            <span className="admin-muted">
                              Logs will appear here after admin actions are recorded.
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr className="admin-empty-row">
                      <td colSpan={5}>
                        <div className="admin-empty-inline">
                          <div className="admin-empty-emoji">🔎</div>
                          <div className="admin-empty-text">
                            <strong>No matching logs</strong>
                            <span className="admin-muted">
                              Try adjusting the search, action, or date filter.
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <tr key={log._id}>
                        <td title={log.adminUsername || ''}>
                          {log.adminUsername || '-'}
                        </td>
                        <td>
                          <span
                            className={`admin-action-pill ${actionClass(log.action)}`}
                          >
                            {log.action || '-'}
                          </span>
                        </td>
                        <td title={log.targetUsername || ''}>
                          {log.targetUsername || '-'}
                        </td>
                        <td title={log.barangay || ''}>
                          {log.barangay || '—'}
                        </td>
                        <td>{formatTime(log.timestamp)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="admin-logs-mobile-list">
              {loading ? (
                <div className="admin-mobile-empty">
                  <strong>Loading admin logs...</strong>
                  <span>Please wait while records are being fetched.</span>
                </div>
              ) : allLogs.length === 0 ? (
                <div className="admin-mobile-empty">
                  <strong>No activity records yet</strong>
                  <span>Logs will appear here after admin actions are recorded.</span>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="admin-mobile-empty">
                  <strong>No matching logs</strong>
                  <span>Try adjusting the search, action, or date filter.</span>
                </div>
              ) : (
                paginatedLogs.map((log) => (
                  <div className="admin-mobile-card" key={`mobile-${log._id}`}>
                    <div className="admin-mobile-card-top">
                      <strong>{log.adminUsername || '-'}</strong>
                      <span className={`admin-action-pill ${actionClass(log.action)}`}>
                        {log.action || '-'}
                      </span>
                    </div>

                    <div className="admin-mobile-meta">
                      <div className="admin-mobile-row">
                        <span>Target</span>
                        <strong>{log.targetUsername || '-'}</strong>
                      </div>
                      <div className="admin-mobile-row">
                        <span>Barangay</span>
                        <strong>{log.barangay || '—'}</strong>
                      </div>
                      <div className="admin-mobile-row">
                        <span>Date</span>
                        <strong>{formatTime(log.timestamp)}</strong>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="admin-pagination">
              <button
                className="admin-btn"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </button>

              <span className="admin-page">
                Page {safePage} of {totalPages}
              </span>

              <button
                className="admin-btn"
                disabled={!canNext}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}