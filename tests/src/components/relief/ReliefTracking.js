import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../layout/DashboardShell';
import '../css/ReliefTracking.css';
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;

export default function ReliefTracking() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/debug-session`, {
          credentials: 'include'
        });

        if (!active) return;

        if (!res.ok) {
          navigate('/');
          return;
        }

        const data = await res.json();
        const role = String(data?.role || '').toLowerCase();
        const userId = String(data?.userId || '');

        if (!role || role !== 'barangay' || !userId) {
          navigate('/');
          return;
        }

        setSessionChecked(true);
      } catch (err) {
        console.error(err);
        if (active) navigate('/');
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  const fetchRequests = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setInitialLoading(true);
        } else {
          setRefreshing(true);
        }

        const res = await fetch(`${BASE_URL}/api/relief-requests/mine`, {
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error('Failed to fetch relief requests');
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : [];

        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        setRows(list);

        setSelectedRequest((prev) => {
  if (!prev?._id) return prev;

  const updated = list.find((item) => item._id === prev._id);

  // 🧠 only update if status actually changed
  if (!updated) return prev;

  if (updated.status === prev.status) {
    return prev; // 🚀 prevents re-render + scroll jump
  }

  return updated;
});
      } catch (err) {
        console.error(err);
        if (!silent) {
          setRows([]);
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!sessionChecked) return;

    fetchRequests();

    const interval = setInterval(() => {
      fetchRequests({ silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchRequests, sessionChecked]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const requestNo = String(row.requestNo || '').toLowerCase();
      const barangayName = String(row.barangayName || '').toLowerCase();
      const disaster = String(row.disaster || '').toLowerCase();
      const status = String(row.status || '').toLowerCase();

      const matchesSearch =
        !q ||
        requestNo.includes(q) ||
        barangayName.includes(q) ||
        disaster.includes(q) ||
        status.includes(q);

      const matchesStatus =
        !statusFilter || String(row.status || '').toLowerCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      totalRequests: rows.length,
      filteredResults: filteredRows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      approved: rows.filter((row) => row.status === 'approved').length,
      forRelease: rows.filter(
        (row) =>
          row.status === 'released' || row.status === 'partially_released'
      ).length,
      received: rows.filter((row) => row.status === 'received').length,
      totalRequestedFoodPacks: filteredRows.reduce(
        (sum, row) => sum + Number(row?.totals?.requestedFoodPacks || 0),
        0
      )
    };
  }, [rows, filteredRows]);

  const getTotalIndividuals = (request) => {
    const totals = request?.totals || {};
    return (
      Number(totals.male || 0) +
      Number(totals.female || 0) +
      Number(totals.lgbtq || 0) +
      Number(totals.pwd || 0) +
      Number(totals.pregnant || 0) +
      Number(totals.senior || 0)
    );
  };

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return '-';
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString();
    } catch {
      return '-';
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'pending':
        return 'rtk-status-pending';
      case 'approved':
        return 'rtk-status-approved';
      case 'partially_released':
        return 'rtk-status-partial';
      case 'released':
        return 'rtk-status-released';
      case 'received':
        return 'rtk-status-received';
      case 'rejected':
        return 'rtk-status-rejected';
      case 'cancelled':
        return 'rtk-status-cancelled';
      default:
        return 'rtk-status-default';
    }
  };

  const handleCancelRequest = async (requestId) => {
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this request?'
    );
    if (!confirmCancel) return;

    try {
      setSubmittingAction(true);

      const res = await fetch(`${BASE_URL}/api/relief-requests/${requestId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ remarks: 'Cancelled by barangay' })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to cancel request');
      }

      alert(data.message || 'Relief request cancelled successfully.');
      setSelectedRequest(null);
      await fetchRequests({ silent: true });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleMarkReceived = async (requestId) => {
    const confirmReceive = window.confirm(
      'Confirm that the relief goods for this request were received?'
    );
    if (!confirmReceive) return;

    try {
      setSubmittingAction(true);

      const res = await fetch(`${BASE_URL}/api/relief-requests/${requestId}/received`, {
        method: 'PUT',
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update request status');
      }

      alert(data.message || 'Relief request marked as received.');
      await fetchRequests({ silent: true });

      setSelectedRequest((prev) => {
        if (!prev?._id) return null;
        const updated = rows.find((row) => row._id === prev._id);
        return updated || prev;
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleEditRequest = (request) => {
    navigate('/barangay/relief-request', {
      state: {
        mode: 'edit',
        request
      }
    });
  };

  if (!sessionChecked || initialLoading) {
    return (
      <DashboardShell>
        <div className="rtk-page">
          <div className="rtk-shell">
            <div className="rtk-loading-card">
              <div className="rtk-spinner" />
              <p>Loading relief tracking...</p>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="rtk-page">
        <div className="rtk-shell">
          <div className="rtk-header-card">
            <div>
              <span className="rtk-kicker">Barangay Tracking Module</span>
              <h1 className="rtk-title">Relief Request Tracking</h1>
            </div>

            <div className="rtk-header-actions">
              {refreshing && (
                <span className="rtk-refresh-indicator">Refreshing...</span>
              )}

              <button
                className="rtk-btn rtk-btn-secondary"
                onClick={() => navigate('/barangay/dashboard')}
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>

          <div className="rtk-stats-grid">
            <div className="rtk-stat-card">
              <span>Total Requests</span>
              <strong>{stats.totalRequests}</strong>
              <small>All submitted requests</small>
            </div>
            <div className="rtk-stat-card">
              <span>Pending</span>
              <strong>{stats.pending}</strong>
              <small>Waiting for DRRMO review</small>
            </div>
            <div className="rtk-stat-card">
              <span>Approved</span>
              <strong>{stats.approved}</strong>
              <small>Validated by DRRMO</small>
            </div>
            <div className="rtk-stat-card">
              <span>For Release / Released</span>
              <strong>{stats.forRelease}</strong>
              <small>In release or delivery stage</small>
            </div>
            <div className="rtk-stat-card">
              <span>Received</span>
              <strong>{stats.received}</strong>
              <small>Completed request cycle</small>
            </div>
            <div className="rtk-stat-card emphasis">
              <span>Food Packs (Filtered)</span>
              <strong>{stats.totalRequestedFoodPacks}</strong>
              <small>Current filtered total</small>
            </div>
          </div>

          <div className="rtk-top-grid">
            <section className="rtk-card">
              <div className="rtk-card-head">
                <h2>My Requests</h2>
                <p>
                  Search and review your submitted requests. Open any request to
                  inspect details and available actions.
                </p>
              </div>

              <div className="rtk-toolbar">
                <input
                  className="rtk-search"
                  type="text"
                  placeholder="Search by request no., disaster, or status..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <select
                  className="rtk-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="partially_released">Partially Released</option>
                  <option value="released">Released</option>
                  <option value="received">Received</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="rtk-table-wrapper">
                <table className="rtk-table">
                  <thead>
                    <tr>
                      <th>Request No.</th>
                      <th>Disaster</th>
                      <th>Date</th>
                      <th>Centers</th>
                      <th>Food Packs</th>
                      <th>Status</th>
                      <th>Review</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="rtk-empty-cell">
                          No requests found.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr
                          key={row._id}
                          className={`rtk-clickable-row ${
                            selectedRequest?._id === row._id ? 'active' : ''
                          }`}
                        >
                          <td onClick={() => setSelectedRequest(row)}>
                            {row.requestNo || '-'}
                          </td>
                          <td onClick={() => setSelectedRequest(row)}>
                            {row.disaster || '-'}
                          </td>
                          <td onClick={() => setSelectedRequest(row)}>
                            {formatDate(row.requestDate)}
                          </td>
                          <td onClick={() => setSelectedRequest(row)}>
                            {row.rows?.length || 0}
                          </td>
                          <td onClick={() => setSelectedRequest(row)}>
                            {row.totals?.requestedFoodPacks || 0}
                          </td>
                          <td onClick={() => setSelectedRequest(row)}>
                            <span className={`rtk-status-pill ${getStatusClass(row.status)}`}>
                              {String(row.status || 'pending').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>
                            <button
                              className="rtk-btn rtk-btn-outline rtk-btn-sm"
                              onClick={() => setSelectedRequest(row)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="rtk-card rtk-summary-card">
              <div className="rtk-card-head">
                <h2>Tracking Summary</h2>
                <p>Quick overview of your current requests.</p>
              </div>

              <div className="rtk-summary-list">
                <div className="rtk-summary-item">
                  <span>Total Requests</span>
                  <strong>{rows.length}</strong>
                </div>
                <div className="rtk-summary-item">
                  <span>Filtered Results</span>
                  <strong>{filteredRows.length}</strong>
                </div>
                <div className="rtk-summary-item">
                  <span>Pending</span>
                  <strong>{stats.pending}</strong>
                </div>
                <div className="rtk-summary-item">
                  <span>Approved</span>
                  <strong>{stats.approved}</strong>
                </div>
                <div className="rtk-summary-item">
                  <span>Released / Partial</span>
                  <strong>{stats.forRelease}</strong>
                </div>
                <div className="rtk-summary-item emphasis">
                  <span>Total Requested Food Packs</span>
                  <strong>{stats.totalRequestedFoodPacks}</strong>
                </div>
              </div>
            </aside>
          </div>

          {selectedRequest && (
            <section className="rtk-card rtk-details-card">
              <div className="rtk-card-head rtk-details-head">
                <div>
                  <h2>Request Details</h2>
                  <p>
                    Review the request sheet and manage the request based on its
                    current status.
                  </p>
                </div>

                <button
                  className="rtk-btn rtk-btn-secondary"
                  onClick={() => setSelectedRequest(null)}
                >
                  Close
                </button>
              </div>

              <div className="rtk-info-grid">
                <div className="rtk-info-box">
                  <span>Request No.</span>
                  <strong>{selectedRequest.requestNo || '-'}</strong>
                </div>
                <div className="rtk-info-box">
                  <span>Barangay</span>
                  <strong>{selectedRequest.barangayName || '-'}</strong>
                </div>
                <div className="rtk-info-box">
                  <span>Disaster</span>
                  <strong>{selectedRequest.disaster || '-'}</strong>
                </div>
                <div className="rtk-info-box">
                  <span>Status</span>
                  <strong>{String(selectedRequest.status || '-').replace(/_/g, ' ')}</strong>
                </div>
              </div>

              <div className="rtk-detail-layout">
                <div className="rtk-detail-main">
                  <div className="rtk-subhead">
                    <h3>Submitted Request Table</h3>
                    <p>Evacuation center rows and requested food packs submitted to DRRMO.</p>
                  </div>

                  <div className="rtk-table-wrapper rtk-detail-table-wrapper">
                    <table className="rtk-table rtk-detail-table">
                      <thead>
                        <tr>
                          <th>No.</th>
                          <th>Evacuation Center</th>
                          <th>Households</th>
                          <th>Families</th>
                          <th>Male</th>
                          <th>Female</th>
                          <th>LGBTQ</th>
                          <th>PWD</th>
                          <th>Pregnant</th>
                          <th>Senior</th>
                          <th>Food Packs</th>
                        </tr>
                      </thead>

                      <tbody>
                        {(selectedRequest.rows || []).map((row, index) => (
                          <tr key={index}>
                            <td>{index + 1}</td>
                            <td className="rtk-left-cell">{row.evacuationCenterName || '-'}</td>
                            <td>{row.households || 0}</td>
                            <td>{row.families || 0}</td>
                            <td>{row.male || 0}</td>
                            <td>{row.female || 0}</td>
                            <td>{row.lgbtq || 0}</td>
                            <td>{row.pwd || 0}</td>
                            <td>{row.pregnant || 0}</td>
                            <td>{row.senior || 0}</td>
                            <td>{row.requestedFoodPacks || 0}</td>
                          </tr>
                        ))}
                      </tbody>

                      <tfoot>
                        <tr>
                          <td colSpan="2" className="rtk-total-label">
                            TOTAL
                          </td>
                          <td>{selectedRequest.totals?.households || 0}</td>
                          <td>{selectedRequest.totals?.families || 0}</td>
                          <td>{selectedRequest.totals?.male || 0}</td>
                          <td>{selectedRequest.totals?.female || 0}</td>
                          <td>{selectedRequest.totals?.lgbtq || 0}</td>
                          <td>{selectedRequest.totals?.pwd || 0}</td>
                          <td>{selectedRequest.totals?.pregnant || 0}</td>
                          <td>{selectedRequest.totals?.senior || 0}</td>
                          <td>{selectedRequest.totals?.requestedFoodPacks || 0}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="rtk-detail-side">
                  <div className="rtk-side-panel">
                    <div className="rtk-subhead">
                      <h3>Request Summary</h3>
                      <p>Track the submitted figures and available barangay actions.</p>
                    </div>

                    <div className="rtk-summary-list">
                      <div className="rtk-summary-item">
                        <span>Evacuation Centers</span>
                        <strong>{selectedRequest.rows?.length || 0}</strong>
                      </div>
                      <div className="rtk-summary-item">
                        <span>Total Households</span>
                        <strong>{selectedRequest.totals?.households || 0}</strong>
                      </div>
                      <div className="rtk-summary-item">
                        <span>Total Families</span>
                        <strong>{selectedRequest.totals?.families || 0}</strong>
                      </div>
                      <div className="rtk-summary-item">
                        <span>Total Individuals</span>
                        <strong>{getTotalIndividuals(selectedRequest)}</strong>
                      </div>
                      <div className="rtk-summary-item emphasis">
                        <span>Requested Food Packs</span>
                        <strong>{selectedRequest.totals?.requestedFoodPacks || 0}</strong>
                      </div>
                    </div>

                    <div className="rtk-meta-box">
                      <span>Date Submitted</span>
                      <p>{formatDateTime(selectedRequest.requestDate)}</p>
                    </div>

                    <div className="rtk-meta-box">
                      <span>Remarks</span>
                      <p>{selectedRequest.remarks?.trim() || 'No remarks provided.'}</p>
                    </div>

                    <div className="rtk-actions-card">
                      <div className="rtk-actions-title">Available Actions</div>

                      <div className="rtk-actions">
                        {selectedRequest.status === 'pending' && (
                          <>
                            <button
                              className="rtk-btn rtk-btn-secondary"
                              disabled={submittingAction}
                              onClick={() => handleEditRequest(selectedRequest)}
                            >
                              Edit Request
                            </button>

                            <button
                              className="rtk-btn rtk-btn-danger"
                              disabled={submittingAction}
                              onClick={() => handleCancelRequest(selectedRequest._id)}
                            >
                              {submittingAction ? 'Processing...' : 'Cancel Request'}
                            </button>
                          </>
                        )}

                        {(selectedRequest.status === 'released' ||
                          selectedRequest.status === 'partially_released') && (
                          <button
                            className="rtk-btn rtk-btn-primary"
                            disabled={submittingAction}
                            onClick={() => handleMarkReceived(selectedRequest._id)}
                          >
                            {submittingAction ? 'Processing...' : 'Mark as Received'}
                          </button>
                        )}

                        {selectedRequest.status === 'approved' && (
                          <div className="rtk-status-note approved">
                            Your request has been approved and is awaiting release processing by DRRMO.
                          </div>
                        )}

                        {selectedRequest.status === 'received' && (
                          <div className="rtk-status-note success">
                            This request has already been marked as received.
                          </div>
                        )}

                        {selectedRequest.status === 'rejected' && (
                          <div className="rtk-status-note danger">
                            This request was rejected by DRRMO.
                          </div>
                        )}

                        {selectedRequest.status === 'cancelled' && (
                          <div className="rtk-status-note neutral">
                            This request has already been cancelled.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
