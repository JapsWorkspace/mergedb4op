// src/components/relief/AuditTrail.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import '../css/AuditTrail.css';
import DashboardShell from '../layout/DashboardShell';
import { API_BASE_URL } from "../../config/api";

const POLL_MS = 5000;

/* =========================
   Formatters / Mappers
   ========================= */

/** Requested Goods: supports string, array<string>, array<object>, or object map */
function formatRequestedGoods(row) {
  const BASE_URL = API_BASE_URL;
  const src =
    row?.requestedGoods ??
    row?.requested ??
    row?.reliefRequested ??
    row?.goods ??
    row?.items ??
    row?.needs ??
    null;

  if (!src) return '—';

  if (typeof src === 'string') {
    const s = src.trim();
    return s || '—';
  }

  if (Array.isArray(src)) {
    if (!src.length) return '—';
    const parts = src
      .map((it) => {
        if (typeof it === 'string') return it.trim();
        if (!it || typeof it !== 'object') return '';
        const name = it.item ?? it.name ?? it.category ?? '';
        const qty = it.qty ?? it.quantity ?? it.count ?? '';
        if (!name && !qty) return '';
        return `${String(name).trim()}${qty ? ` (${qty})` : ''}`;
      })
      .filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }

  if (typeof src === 'object') {
    const entries = Object.entries(src);
    if (!entries.length) return '—';
    return entries.map(([k, v]) => `${k}${v ? ` (${v})` : ''}`).join(', ');
  }

  return '—';
}

/** Affected / People Range: supports single value or min/max */
function formatPeopleRange(row) {
  const direct =
    row?.peopleRange ??
    row?.affected ??
    row?.affectedPeople ??
    row?.affectedFamilies ??
    row?.population ??
    null;

  if (typeof direct === 'number') return `${direct} people`;
  if (typeof direct === 'string') {
    const s = direct.trim();
    if (!s) return '—';
    if (/^\d+$/.test(s)) return `${Number(s)} people`;
    return s; // like "120 families" or "80–120"
  }

  const min = row?.peopleMin ?? row?.minPeople ?? null;
  const max = row?.peopleMax ?? row?.maxPeople ?? null;
  if (min != null && max != null) return `${min}–${max} people`;

  return '—';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

// Mappers used by the table
const mapBarangay = (r) => r.barangayName ?? r.placeName ?? '—';
const mapDisaster = (r) => r.disaster ?? r.hazard ?? r.disasterType ?? '—';
const mapUrgency  = (r) => r.urgency ?? r.severity ?? r.priority ?? '—';

export default function AuditTrail() {
  const navigate = useNavigate();
  const appRef = useRef(null);
  const BASE_URL = API_BASE_URL;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Auth guard
  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!role) navigate('/');
  }, [navigate]);

  // Lock header height into CSS var (fits viewport perfectly)
  useEffect(() => {
    const sync = () => {
      const headerEl = document.querySelector('.app-header');
      const h = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
      if (appRef.current) appRef.current.style.setProperty('--rr-header-h', `${h}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    const ro = new ResizeObserver(sync);
    const headerEl = document.querySelector('.app-header');
    if (headerEl) ro.observe(headerEl);
    return () => { window.removeEventListener('resize', sync); ro.disconnect(); };
  }, []);

  // Fetch + poll
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/audit`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch audit');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      arr.sort(
        (a, b) =>
          new Date(b.actionAt ?? b.createdAt ?? 0) - new Date(a.actionAt ?? a.createdAt ?? 0)
      );
      setRows(arr);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, POLL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  // Filter for table
  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ =
        !q ||
        String(mapBarangay(r)).toLowerCase().includes(q) ||
        String(mapDisaster(r)).toLowerCase().includes(q) ||
        String(r.details ?? '').toLowerCase().includes(q);

      const sevVal = String(mapUrgency(r)).toLowerCase();
      const matchesSev = !severity || sevVal === severity.toLowerCase();

      return matchesQ && matchesSev;
    });
  }, [rows, search, severity]);

  // Approve / Decline placeholders (wire to backend when ready)
  const approve = async (id) => {
    setSubmitting(true);
    try {
      // await fetch(`${API_BASE_URL}/api/audit/approve/${id}`, { method: 'PUT', credentials: 'include' });
      console.log('approve', id);
      alert('Approved');
      setSelected(null);
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async (id) => {
    setSubmitting(true);
    try {
      // await fetch(`${API_BASE_URL}/api/audit/decline/${id}`, { method: 'PUT', credentials: 'include' });
      console.log('decline', id);
      alert('Declined');
      setSelected(null);
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Failed to decline');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="rr-app" ref={appRef}>
        {/* Toolbar */}
        <div className="rr-toolbar" style={{ height: 'var(--rr-toolbar-h)' }}>
          <h2 className="rr-title">Relief Requests</h2>

          <div className="rr-toolbar-right">
            <input
              className="rr-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rr-select"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">Severity</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
            <button className="rr-btn" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </div>

        {/* Main (fills remaining viewport; no white bottom space) */}
        <main className="rr-main">
          <div className="rr-card">
            <h3 className="rr-card-title">Relief Requests</h3>

            {/* Table region fills the card to the bottom */}
            <div className="rr-table-region">
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead>
                    <tr>
                      <th>Barangay</th>
                      <th>Disaster</th>
                      <th>Urgency</th>
                      <th>Affected</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={5} className="rr-empty">Loading…</td>
                      </tr>
                    )}

                    {!loading && tableRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="rr-empty">No Requests Found</td>
                      </tr>
                    )}

                    {!loading && tableRows.length > 0 && tableRows.map((r) => (
                      <tr
                        key={r._id}
                        className="rr-row"
                        onClick={() => setSelected(r)}
                      >
                        <td>{mapBarangay(r)}</td>
                        <td>{mapDisaster(r)}</td>
                        <td>{mapUrgency(r)}</td>
                        <td className="rr-affected">{formatPeopleRange(r)}</td>
                        <td>
                          <button
                            className="rr-action"
                            onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                            title="View"
                          >
                            ▼
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>

        {/* Modal */}
        {selected && (
          <div className="rr-modal" role="dialog" aria-modal="true" aria-label="Relief request details">
            {/* Dark background (click to close) */}
            <div className="rr-overlay" onClick={() => setSelected(null)} />
            {/* Card above overlay, fully clickable */}
            <div className="rr-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="rr-modal-title">Relief Requests<br />Details</h3>

              <div className="rr-form">
                <label>Barangay</label>
                <input className="rr-field" value={mapBarangay(selected)} readOnly />

                <label>Disaster</label>
                <input className="rr-field" value={mapDisaster(selected)} readOnly />

                <label>Affected Families</label>
                <input className="rr-field" value={formatPeopleRange(selected)} readOnly />

                <label>Requested Goods</label>
                <textarea className="rr-field" rows={3} value={formatRequestedGoods(selected)} readOnly />
              </div>

              <div className="rr-modal-actions">
                <button className="rr-btn" onClick={() => setSelected(null)} disabled={submitting}>
                  Back
                </button>
                <div className="rr-cta">
                  <button className="rr-approve" onClick={() => approve(selected._id)} disabled={submitting}>
                    {submitting ? '...' : 'Approve'}
                  </button>
                  <button className="rr-decline" onClick={() => decline(selected._id)} disabled={submitting}>
                    {submitting ? '...' : 'Decline'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}