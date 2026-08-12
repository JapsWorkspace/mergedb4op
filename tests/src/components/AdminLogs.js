// src/components/AdminLogs.js
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/AdminLogs.css';
import axios from 'axios';
import DashboardShell from './layout/DashboardShell';
import { API_BASE_URL } from "../config/api";

export default function AdminLogs() {
  const navigate = useNavigate();
  const PAGE_SIZE = 18;

  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [totalPagesUI, setTotalPagesUI] = useState(1);

  const appRef = useRef(null);
  const toolbarRef = useRef(null);
  const mainRef = useRef(null);
  const regionRef = useRef(null);
  const latestReqId = useRef(0);

  const actionClass = (action) => {
    switch (action) {
      case 'create': return 'admin-create';
      case 'update': return 'admin-update';
      case 'archive': return 'admin-archive';
      case 'restore': return 'admin-restore';
      default: return '';
    }
  };

  const fetchWindow = async (uiPage) => {
    const reqId = ++latestReqId.current;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/admin/logs`, { withCredentials: true });
      if (reqId !== latestReqId.current) return;

      const arr = Array.isArray(res.data) ? res.data.slice(0, PAGE_SIZE) : [];
      setLogs(arr);
      setTotalPagesUI(Math.max(1, Math.ceil((res.data?.length || arr.length) / PAGE_SIZE)));
    } catch (e) {
      console.error(e);
      setLogs([]);
      setTotalPagesUI(1);
    } finally {
      if (reqId === latestReqId.current) setLoading(false);
    }
  };

  const formatTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  useLayoutEffect(() => {
    const setVars = () => {
      const headerH = appRef.current?.querySelector(':scope > *:first-child')?.offsetHeight || 0;
      const toolbarH = toolbarRef.current?.offsetHeight || 0;
      const mainStyle = window.getComputedStyle(mainRef.current);
      const mainVPad =
        (parseFloat(mainStyle.paddingTop) || 0) + (parseFloat(mainStyle.paddingBottom) || 0);
      appRef.current.style.setProperty('--app-header-h', `${headerH}px`);
      appRef.current.style.setProperty('--toolbar-h', `${toolbarH}px`);
      appRef.current.style.setProperty('--main-vpad', `${mainVPad}px`);
    };
    setVars();
    window.addEventListener('resize', setVars);
    return () => window.removeEventListener('resize', setVars);
  }, []);

  useEffect(() => { fetchWindow(page); }, [page]);

  const hasLogs = logs.length > 0;
  const canPrev = page > 1;
  const canNext = page < totalPagesUI;

  return (
    <DashboardShell>
      <div className="admin-logs-app" ref={appRef}>
        <div className="admin-logs-toolbar" ref={toolbarRef}>
          <div className="admin-logs-toolbar-left">
            <h1 className="admin-logs-title">Admin Activity Logs</h1>
            <span className="admin-logs-meta">
              {loading ? 'Loading…' : hasLogs ? `${logs.length}/${PAGE_SIZE} rows` : 'No records'}
            </span>
          </div>
          <div className="admin-logs-toolbar-right">
            <button className="admin-btn" onClick={() => navigate(-1)}>Back</button>
          </div>
        </div>

        <main className="admin-logs-main" ref={mainRef}>
          <section className="admin-logs-table-region" ref={regionRef}>
            <div className="admin-logs-table-wrap">
              <table className="admin-logs-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target User</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !hasLogs && (
                    <tr className="admin-empty-row">
                      <td colSpan={4}>
                        <div className="admin-empty-inline">
                          <div className="admin-empty-emoji">📝</div>
                          <div className="admin-empty-text">
                            <strong>No logs found</strong>
                            <span className="admin-muted">Adjust filters to see results.</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {hasLogs && logs.map(log => (
                    <tr key={log._id}>
                      <td data-label="Admin">{log.adminUsername || '-'}</td>
                      <td data-label="Action" className={`admin-action ${actionClass(log.action)}`}>
                        {log.action}
                      </td>
                      <td data-label="Target User">{log.targetUsername || '-'}</td>
                      <td data-label="Date">{formatTime(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-pagination">
              <button className="admin-btn" disabled={!canPrev} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</button>
              <span className="admin-page">Page {page} of {totalPagesUI}</span>
              <button className="admin-btn" disabled={!canNext} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </section>
        </main>
      </div>
    </DashboardShell>
  );
}