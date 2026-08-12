import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/ArchivedAccounts.css';
import {
  AccountConfirmModal,
  AccountNotificationPortal,
  buildAccountNotification
} from './accountOverlayUtils';
import { API_BASE_URL } from "../../config/api";

export default function ArchivedAccounts() {
  const notificationTimeoutsRef = useRef({});
  const navigate = useNavigate();
  const BASE_URL = API_BASE_URL;

  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [restoreTargetId, setRestoreTargetId] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 8;

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (!storedRole) navigate('/');
  }, [navigate]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    const timeouts = notificationTimeoutsRef.current;

    return () => {
      Object.values(timeouts).forEach(clearTimeout);
      notificationTimeoutsRef.current = {};
    };
  }, []);

  const removeNotification = (id) => {
    if (notificationTimeoutsRef.current[id]) {
      clearTimeout(notificationTimeoutsRef.current[id]);
      delete notificationTimeoutsRef.current[id];
    }

    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  const showNotification = (message, type = 'info') => {
    const notification = buildAccountNotification(message, type);

    setNotifications((prev) => [notification, ...prev].slice(0, 3));

    notificationTimeoutsRef.current[notification.id] = setTimeout(() => {
      setNotifications((prev) =>
        prev.filter((item) => item.id !== notification.id)
      );
      delete notificationTimeoutsRef.current[notification.id];
    }, 4000);
  };

  const fetchArchivedAccounts = useCallback(async () => {
    try {
      setLoading(true);

      const res = await fetch(`${BASE_URL}/api/auth/archived`, {
        credentials: 'include'
      });

      const data = await res.json();
      setArchived(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      showNotification('Failed to fetch archived accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [BASE_URL]);

  useEffect(() => {
    fetchArchivedAccounts();
  }, [fetchArchivedAccounts]);

  const restoreAccount = async (id) => {
    try {
      setRestoringId(id);

      const res = await fetch(`${BASE_URL}/api/auth/restore/${id}`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (res.ok) {
        showNotification('Account restored successfully', 'success');
        setArchived((prev) => prev.filter((account) => account._id !== id));
      } else {
        showNotification('Failed to restore account', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Error restoring account', 'error');
    } finally {
      setRestoringId(null);
      setRestoreTargetId(null);
    }
  };

  const deleteArchivedAccount = async (id) => {
    try {
      setDeletingId(id);

      const res = await fetch(`${BASE_URL}/api/auth/archived/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showNotification(
          data.message || 'Archived account deleted successfully',
          'success'
        );
        setArchived((prev) => prev.filter((account) => account._id !== id));
      } else {
        showNotification(data.message || 'Failed to delete archived account', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Error deleting archived account', 'error');
    } finally {
      setDeletingId(null);
      setDeleteTargetId(null);
    }
  };

  const filteredArchived = useMemo(() => {
    const term = search.trim().toLowerCase();

    return archived.filter((account) => {
      const matchesSearch =
        !term ||
        String(account.username || '').toLowerCase().includes(term) ||
        String(account.email || '').toLowerCase().includes(term) ||
        String(account.phoneNumber || '').toLowerCase().includes(term) ||
        String(account.address || '').toLowerCase().includes(term) ||
        String(account.role || '').toLowerCase().includes(term);

      const matchesRole =
        !roleFilter || String(account.role || '').toLowerCase() === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [archived, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredArchived.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedArchived = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredArchived.slice(start, start + PAGE_SIZE);
  }, [filteredArchived, safePage]);

  const roleCounts = useMemo(() => {
    return archived.reduce(
      (acc, item) => {
        const role = String(item.role || '').toLowerCase();
        if (role === 'barangay') acc.barangay += 1;
        if (role === 'drrmo') acc.drrmo += 1;
        if (role === 'accountant') acc.accountant += 1;
        return acc;
      },
      { barangay: 0, drrmo: 0, accountant: 0 }
    );
  }, [archived]);

  const formatRole = (role) => {
    if (!role) return '-';
    if (String(role).toLowerCase() === 'drrmo') return 'DRRMO';
    if (String(role).toLowerCase() === 'accountant') return 'Accountant';
    if (String(role).toLowerCase() === 'barangay') return 'Barangay';
    return role;
  };

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const hasActiveFilters = Boolean(search.trim() || roleFilter);

  const statItems = [
    {
      label: 'Archived',
      value: loading ? '-' : archived.length,
      tone: 'green'
    },
    {
      label: 'Accountant',
      value: loading ? '-' : roleCounts.accountant,
      tone: 'amber'
    },
    {
      label: 'Barangay',
      value: loading ? '-' : roleCounts.barangay,
      tone: 'emerald'
    },
    {
      label: 'DRRMO',
      value: loading ? '-' : roleCounts.drrmo,
      tone: 'blue'
    }
  ];

  const restoreTarget = restoreTargetId
    ? archived.find((account) => account._id === restoreTargetId) || null
    : null;
  const deleteTarget = deleteTargetId
    ? archived.find((account) => account._id === deleteTargetId) || null
    : null;

  return (
    <div className="archived-page">
      <div className="archived-shell">
        <div className="archived-hero">
          <div className="archived-hero-copy">
            <div className="archived-kicker-row">
              <span className="archived-kicker">Administration Module</span>
              {hasActiveFilters && (
                <span className="archived-mini-badge">Filtered View</span>
              )}
            </div>

            <h1 className="archived-title">Archived Accounts</h1>

            <div className="archived-stats">
              {statItems.map((item) => (
                <div
                  key={item.label}
                  className={`archived-stat-card archived-stat-card--${item.tone}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="archived-panel">
          <div className="archived-toolbar">
            <div className="archived-search-wrap">
              <input
                className="archived-search"
                type="text"
                placeholder="Search username, email, phone, address, or role"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              className="archived-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="">All Roles</option>
              <option value="barangay">Barangay</option>
              <option value="drrmo">DRRMO</option>
              <option value="accountant">Accountant</option>
            </select>
          </div>

          <div className="archived-toolbar-meta">
            <span className="archived-results-text">
              {loading
                ? 'Loading records...'
                : `${filteredArchived.length} result${
                    filteredArchived.length === 1 ? '' : 's'
                  }`}
            </span>

            {hasActiveFilters && !loading && (
              <button
                type="button"
                className="archived-clear-btn"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="archived-table-wrap">
            <table className="archived-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="archived-empty-cell">
                      <div className="archived-empty-state">
                        <div className="archived-empty-inner">
                          <strong>Loading archived accounts...</strong>
                          <span>Please wait while records are fetched.</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : archived.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="archived-empty-cell">
                      <div className="archived-empty-state">
                        <div className="archived-empty-inner">
                          <strong>No archived accounts</strong>
                          <span>Archived users will appear here.</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : paginatedArchived.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="archived-empty-cell">
                      <div className="archived-empty-state">
                        <div className="archived-empty-inner">
                          <strong>No matching results</strong>
                          <span>Try a different search or role filter.</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedArchived.map((account) => (
                    <tr key={account._id}>
                      <td title={account.username || ''}>
                        {account.username || '-'}
                      </td>
                      <td className="archived-email" title={account.email || ''}>
                        {account.email || '-'}
                      </td>
                      <td title={account.phoneNumber || ''}>
                        {account.phoneNumber || '-'}
                      </td>
                      <td title={account.address || ''}>
                        {account.address || '-'}
                      </td>
                      <td>
                        <span
                          className={`archived-role-pill ${
                            String(account.role || '').toLowerCase() === 'barangay'
                              ? 'barangay'
                              : String(account.role || '').toLowerCase() === 'accountant'
                              ? 'accountant'
                              : 'drrmo'
                          }`}
                        >
                          {formatRole(account.role)}
                        </span>
                      </td>
                      <td>
                        <div className="archived-action-row">
                          <button
                            className="archived-restore-btn"
                            onClick={() => setRestoreTargetId(account._id)}
                            disabled={restoringId === account._id}
                          >
                            {restoringId === account._id ? 'Restoring...' : 'Restore'}
                          </button>
                          <button
                            className="archived-delete-btn"
                            onClick={() => setDeleteTargetId(account._id)}
                            disabled={deletingId === account._id}
                          >
                            {deletingId === account._id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="archived-pagination">
            <button
              className="archived-page-btn"
              disabled={!canPrev}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              &larr; Prev
            </button>

            <span className="archived-page-label">
              Page {safePage} of {totalPages}
            </span>

            <button
              className="archived-page-btn"
              disabled={!canNext}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next &rarr;
            </button>
          </div>
        </section>
      </div>

      <AccountConfirmModal
        open={Boolean(restoreTargetId)}
        title="Restore account?"
        message="This archived account will be moved back into the active account list."
        details={[
          { label: 'Username', value: restoreTarget?.username || '-' },
          { label: 'Role', value: formatRole(restoreTarget?.role) }
        ]}
        confirmLabel="Restore Account"
        cancelLabel="Cancel"
        busy={restoringId === restoreTargetId}
        onConfirm={() => restoreTargetId && restoreAccount(restoreTargetId)}
        onClose={() => {
          if (restoringId !== restoreTargetId) {
            setRestoreTargetId(null);
          }
        }}
      />

      <AccountConfirmModal
        open={Boolean(deleteTargetId)}
        title="Delete archived account?"
        message="This will permanently remove the archived record. This action cannot be undone."
        details={[
          { label: 'Username', value: deleteTarget?.username || '-' },
          { label: 'Role', value: formatRole(deleteTarget?.role) },
          { label: 'Email', value: deleteTarget?.email || '-' }
        ]}
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        confirmTone="danger"
        busy={deletingId === deleteTargetId}
        onConfirm={() => deleteTargetId && deleteArchivedAccount(deleteTargetId)}
        onClose={() => {
          if (deletingId !== deleteTargetId) {
            setDeleteTargetId(null);
          }
        }}
      />

      <AccountNotificationPortal
        notifications={notifications}
        onDismiss={removeNotification}
      />
    </div>
  );
}
