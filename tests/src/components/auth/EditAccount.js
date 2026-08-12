import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/EditAccount.css';
import {
  sanitizeAddress,
  sanitizeHotline,
  sanitizePassword,
  sanitizePhoneNumber,
  sanitizeUsername
} from './inputSanitizers';
import {
  validateAddress,
  validateHotline,
  validatePhoneNumber,
  validateStrongPassword,
  validateUsername
} from './inputValidators';
import {
  AccountConfirmModal,
  AccountNotificationPortal,
  buildAccountNotification
} from './accountOverlayUtils';
import { API_BASE_URL } from "../../config/api";

const INTERNET_CONNECTION_MESSAGE =
  'Please check your internet connection and try again.';

const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

export default function EditAccount() {
  const notificationTimeoutsRef = useRef({});
  const editorCardRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (!storedRole) {
      navigate('/');
    }
  }, [navigate]);

  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(null);
  const [forms, setForms] = useState({});
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [pendingSelectionId, setPendingSelectionId] = useState(null);
  const [archiveTargetId, setArchiveTargetId] = useState(null);
  const [updateTargetId, setUpdateTargetId] = useState(null);
  const [sidebarHeight, setSidebarHeight] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const BASE_URL = API_BASE_URL;

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

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/all`, {
        credentials: 'include'
      });

      const data = await res.json();
      const safeData = Array.isArray(data) ? data : [];
      setAccounts(safeData);

      const mappedForms = {};
      safeData.forEach((account) => {
        mappedForms[account._id] = {
          username: account.username || '',
          email: account.email || '',
          phoneNumber: account.phoneNumber || '',
          hotline: account.hotline || '',
          address: account.address || '',
          password: '',
          confirmPassword: ''
        };
      });
      setForms(mappedForms);
      setFieldErrors({});

      if (safeData.length > 0) {
        const firstVisible = safeData.find((account) => account.role !== 'admin');
        if (firstVisible) {
          setOpen((prev) => prev || firstVisible._id);
        }
      }
    } catch (err) {
      console.error(err);
      showNotification('Failed to fetch accounts', 'error');
    }
  }, [BASE_URL]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleChange = (id, field, value) => {
    const sanitizers = {
      username: sanitizeUsername,
      phoneNumber: sanitizePhoneNumber,
      hotline: sanitizeHotline,
      address: sanitizeAddress,
      password: sanitizePassword,
      confirmPassword: sanitizePassword
    };

    const nextValue = sanitizers[field] ? sanitizers[field](value) : value;

    setForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: nextValue }
    }));

    setFieldErrors((prev) => {
      const nextAccountErrors = { ...(prev[id] || {}) };

      if (field === 'password') {
        if (nextValue) {
          nextAccountErrors.password = validateStrongPassword(nextValue);
        } else {
          delete nextAccountErrors.password;
        }

        const confirmation = forms[id]?.confirmPassword || '';
        if (nextValue && !confirmation) {
          nextAccountErrors.confirmPassword = 'Missing Field';
        } else if (confirmation && confirmation !== nextValue) {
          nextAccountErrors.confirmPassword = 'Passwords do not match';
        } else if (confirmation) {
          delete nextAccountErrors.confirmPassword;
        }
      } else if (field === 'confirmPassword') {
        const password = forms[id]?.password || '';
        if (password && !nextValue) {
          nextAccountErrors.confirmPassword = 'Missing Field';
        } else if (nextValue && nextValue !== password) {
          nextAccountErrors.confirmPassword = 'Passwords do not match';
        } else {
          delete nextAccountErrors.confirmPassword;
        }
      } else {
        delete nextAccountErrors[field];
      }

      return {
        ...prev,
        [id]: nextAccountErrors
      };
    });
  };

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => account.role !== 'admin'),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    const term = q.toLowerCase().trim();

    return visibleAccounts.filter((account) => {
      const matchesSearch = `${account.username} ${account.email} ${account.phoneNumber} ${account.address} ${account.role}`
        .toLowerCase()
        .includes(term);

      const matchesRole =
        !roleFilter || String(account.role || '').toLowerCase() === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [visibleAccounts, q, roleFilter]);

  const selected = useMemo(
    () => visibleAccounts.find((account) => account._id === open) || null,
    [visibleAccounts, open]
  );

  const selectedForm = selected ? forms[selected._id] : null;
  const selectedErrors = selected ? fieldErrors[selected._id] || {} : {};

  const totalBarangay = useMemo(
    () => visibleAccounts.filter((account) => account.role === 'barangay').length,
    [visibleAccounts]
  );

  const totalDrrmo = useMemo(
    () => visibleAccounts.filter((account) => account.role === 'drrmo').length,
    [visibleAccounts]
  );
  const totalAccountant = useMemo(
    () => visibleAccounts.filter((account) => account.role === 'accountant').length,
    [visibleAccounts]
  );

  const getInitials = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return '?';
    return text.slice(0, 1).toUpperCase();
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!selected || !selectedForm) return false;

    return (
      (selectedForm.username || '') !== (selected.username || '') ||
      (selectedForm.phoneNumber || '') !== (selected.phoneNumber || '') ||
      (selectedForm.hotline || '') !== (selected.hotline || '') ||
      (selectedForm.address || '') !== (selected.address || '') ||
      !!selectedForm.password ||
      !!selectedForm.confirmPassword
    );
  }, [selected, selectedForm]);

  useLayoutEffect(() => {
    const editorNode = editorCardRef.current;
    if (!editorNode) return undefined;

    const syncSidebarHeight = () => {
      const nextHeight = Math.max(editorNode.offsetHeight || 0, 680);
      setSidebarHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    syncSidebarHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncSidebarHeight);
      return () => window.removeEventListener('resize', syncSidebarHeight);
    }

    const observer = new ResizeObserver(() => {
      syncSidebarHeight();
    });

    observer.observe(editorNode);
    window.addEventListener('resize', syncSidebarHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncSidebarHeight);
    };
  }, [selected?._id, selectedForm, hasUnsavedChanges]);

  const handleSelectAccount = (id) => {
    if (id === open) return;

    if (hasUnsavedChanges) {
      setPendingSelectionId(id);
      return;
    }

    setOpen(id);
  };

  const resetSelectedForm = () => {
    if (!selected) return;

    setForms((prev) => ({
      ...prev,
      [selected._id]: {
        username: selected.username || '',
        email: selected.email || '',
        phoneNumber: selected.phoneNumber || '',
        hotline: selected.hotline || '',
        address: selected.address || '',
        password: '',
        confirmPassword: ''
      }
    }));
    setFieldErrors((prev) => ({
      ...prev,
      [selected._id]: {}
    }));
  };

  const getAccountValidationErrors = (data = {}) => {
    const nextErrors = {};

    const usernameError = validateUsername(data.username);
    if (usernameError) {
      nextErrors.username = usernameError;
    }

    const phoneError = validatePhoneNumber(data.phoneNumber);
    if (phoneError) {
      nextErrors.phoneNumber = phoneError;
    }

    const hotlineError = validateHotline(data.hotline);
    if (hotlineError) {
      nextErrors.hotline = hotlineError;
    }

    const addressError = validateAddress(data.address);
    if (addressError) {
      nextErrors.address = addressError;
    }

    if (data.password || data.confirmPassword) {
      const passwordError = validateStrongPassword(data.password);
      if (passwordError) {
        nextErrors.password = passwordError;
      }

      if (data.password && !data.confirmPassword) {
        nextErrors.confirmPassword = 'Missing Field';
      } else if (data.password !== data.confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match';
      }
    }

    return nextErrors;
  };

  const handleRequestUpdateClick = (id) => {
    const data = forms[id];
    if (!data) return;

    const nextErrors = getAccountValidationErrors(data);
    setFieldErrors((prev) => ({
      ...prev,
      [id]: nextErrors
    }));

    if (Object.keys(nextErrors).length > 0) {
      showNotification('Please fix the highlighted fields first.', 'error');
      return;
    }

    if (isBrowserOffline()) {
      showNotification(INTERNET_CONNECTION_MESSAGE, 'error');
      return;
    }

    setUpdateTargetId(id);
  };

  const requestAccountUpdate = async (id) => {
    const data = forms[id];
    if (!data) return;

    const nextErrors = getAccountValidationErrors(data);
    setFieldErrors((prev) => ({
      ...prev,
      [id]: nextErrors
    }));

    if (Object.keys(nextErrors).length > 0) {
      setUpdateTargetId(null);
      showNotification('Please fix the highlighted fields first.', 'error');
      return;
    }

    if (isBrowserOffline()) {
      setUpdateTargetId(null);
      showNotification(INTERNET_CONNECTION_MESSAGE, 'error');
      return;
    }

    const original = accounts.find((account) => account._id === id);
    if (!original) return;

    if (
      data.username === original.username &&
      data.phoneNumber === original.phoneNumber &&
      data.hotline === original.hotline &&
      data.address === original.address &&
      !data.password
    ) {
      setUpdateTargetId(null);
      showNotification('No changes detected', 'info');
      return;
    }

    const payload = { ...data };
    delete payload.confirmPassword;
    delete payload.email;
    if (!payload.password) delete payload.password;

    try {
      setSavingId(id);

      const res = await fetch(`${BASE_URL}/api/auth/update/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const responseData = await res.json().catch(() => ({}));

      if (res.ok) {
        showNotification(
          responseData.message ||
            'Update approval email sent. Changes will apply after the recipient confirms.',
          'success'
        );
        setFieldErrors((prev) => ({
          ...prev,
          [id]: {}
        }));
        setUpdateTargetId(null);
        await fetchAccounts();
      } else {
        showNotification(responseData.message || 'Update failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification(INTERNET_CONNECTION_MESSAGE, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const archiveAccount = async (id) => {
    try {
      setArchivingId(id);

      const res = await fetch(`${BASE_URL}/api/auth/archive/${id}`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (res.ok) {
        showNotification('Account archived successfully', 'success');
        setAccounts((prev) => prev.filter((account) => account._id !== id));
        setOpen(null);
      } else {
        showNotification('Failed to archive account', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Failed to archive account', 'error');
    } finally {
      setArchivingId(null);
      setArchiveTargetId(null);
    }
  };

  const stats = [
    { label: 'Accounts', value: visibleAccounts.length, tone: 'green' },
    { label: 'DRRMO', value: totalDrrmo, tone: 'blue' },
    { label: 'Accountant', value: totalAccountant, tone: 'amber' },
    { label: 'Barangay', value: totalBarangay, tone: 'emerald' }
  ];

  const archiveTarget = archiveTargetId
    ? accounts.find((account) => account._id === archiveTargetId) || null
    : null;
  const updateTarget = updateTargetId
    ? accounts.find((account) => account._id === updateTargetId) || null
    : null;
  const updateForm = updateTarget ? forms[updateTarget._id] : null;
  const updateSummaryDetails =
    updateTarget && updateForm
      ? [
          { label: 'Role', value: updateTarget.role || '-' },
          { label: 'Email', value: updateTarget.email || '-' },
          { label: 'Username', value: `${updateTarget.username || '-'} -> ${updateForm.username || '-'}` },
          { label: 'Phone', value: `${updateTarget.phoneNumber || '-'} -> ${updateForm.phoneNumber || '-'}` },
          { label: 'Hotline', value: `${updateTarget.hotline || '-'} -> ${updateForm.hotline || '-'}` },
          { label: 'Address', value: `${updateTarget.address || '-'} -> ${updateForm.address || '-'}` },
          {
            label: 'Password',
            value: updateForm.password ? 'Will be updated after email approval' : 'No password change'
          }
        ]
      : [];

  const renderEditError = (field) =>
    selectedErrors[field] ? (
      <div className="ea-field-error">{selectedErrors[field]}</div>
    ) : null;

  return (
    <div className="edit-account">
      <div className="ea-page-shell">
        <section className="ea-hero-card">
          <div className="ea-hero-copy">
            <div className="ea-kicker-row">
              <span className="ea-kicker">Administration Module</span>
              {hasUnsavedChanges && (
                <span className="ea-live-pill ea-live-pill--warning">
                  Unsaved Changes
                </span>
              )}
            </div>

            <h1 className="ea-page-title">Edit Accounts</h1>

            <div className="ea-hero-stats">
              {stats.map((item) => (
                <div
                  key={item.label}
                  className={`ea-stat-card ea-stat-card--${item.tone}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ea-workspace">
          <aside
            className="ea-sidebar-card"
            style={sidebarHeight ? { height: `${sidebarHeight}px` } : undefined}
          >
            <div className="ea-sidebar-top">
              <div className="ea-listbar">
                <input
                  className="ea-list-search"
                  type="search"
                  placeholder="Search account"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                />
              </div>

              <div className="ea-filter-row">
                <select
                  className="ea-role-filter"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="drrmo">DRRMO</option>
                  <option value="accountant">Accountant</option>
                  <option value="barangay">Barangay</option>
                </select>
              </div>
            </div>

            <div className="ea-list">
              {filteredAccounts.length === 0 ? (
                <div className="ea-list-empty">
                  <strong>No accounts found</strong>
                </div>
              ) : (
                filteredAccounts.map((account) => (
                  <div key={account._id} className="ea-item">
                    <button
                      type="button"
                      className={`ea-head ${
                        open === account._id ? 'is-active' : ''
                      }`}
                      onClick={() => handleSelectAccount(account._id)}
                    >
                      <div className="ea-head-main">
                        <div className="ea-head-avatar">
                          {getInitials(account.username)}
                        </div>

                        <div className="ea-head-copy">
                          <strong className="ea-username">{account.username}</strong>
                          <small className="ea-email">
                            {account.email || 'No email'}
                          </small>
                        </div>
                      </div>

                      <span className={`ea-role ea-role-${account.role}`}>
                        {account.role}
                      </span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="ea-editor-card" ref={editorCardRef}>
            {!selected || !selectedForm ? (
              <div className="ea-placeholder ea-placeholder--centered">
                <div className="ea-empty-illustration">ID</div>
                <div className="ea-empty-title">Select an account</div>
              </div>
            ) : (
              <div className="ea-editor-scroll">
                <div className="ea-profile-card">
                  <div className="ea-profile-main">
                    <div className="ea-profile-avatar">
                      {getInitials(selected.username)}
                    </div>

                    <div className="ea-profile-copy">
                      <div className="ea-profile-topline">
                        <h3>{selected.username}</h3>
                        <div className={`ea-role-badge ea-role-${selected.role}`}>
                          {selected.role}
                        </div>
                      </div>
                      <p>{selected.email || 'No email address'}</p>
                    </div>
                  </div>

                  <div className="ea-profile-meta">
                    <div className="ea-meta-card">
                      <span>Phone</span>
                      <strong>{selected.phoneNumber || '-'}</strong>
                    </div>
                    <div className="ea-meta-card">
                      <span>Hotline</span>
                      <strong>{selected.hotline || '-'}</strong>
                    </div>
                  </div>
                </div>

                <div className="ea-section-block">
                  <div className="ea-section-title-row">
                    <h3>Account Information</h3>
                  </div>

                  <div className="ea-form-grid">
                    <div className={`ea-field ${selectedErrors.username ? 'has-error' : ''}`}>
                      <label>Username</label>
                      <input
                        value={selectedForm.username || ''}
                        onChange={(event) =>
                          handleChange(
                            selected._id,
                            'username',
                            event.target.value
                          )
                        }
                      />
                      {renderEditError('username')}
                    </div>

                    <div className="ea-field">
                      <label>Email</label>
                      <input
                        value={selectedForm.email || ''}
                        disabled
                        readOnly
                        className="ea-input-readonly"
                      />
                      <div className="ea-field-hint">
                        Email is locked. Account changes are approved through this address.
                      </div>
                    </div>

                    <div className={`ea-field ${selectedErrors.phoneNumber ? 'has-error' : ''}`}>
                      <label>Phone Number</label>
                      <input
                        value={selectedForm.phoneNumber || ''}
                        onChange={(event) =>
                          handleChange(
                            selected._id,
                            'phoneNumber',
                            event.target.value
                          )
                        }
                      />
                      {renderEditError('phoneNumber')}
                    </div>

                    <div className={`ea-field ${selectedErrors.hotline ? 'has-error' : ''}`}>
                      <label>Hotline</label>
                      <input
                        value={selectedForm.hotline || ''}
                        onChange={(event) =>
                          handleChange(selected._id, 'hotline', event.target.value)
                        }
                      />
                      {renderEditError('hotline')}
                    </div>

                    <div className={`ea-field ea-field-full ${selectedErrors.address ? 'has-error' : ''}`}>
                      <label>Address</label>
                      <input
                        value={selectedForm.address || ''}
                        onChange={(event) =>
                          handleChange(selected._id, 'address', event.target.value)
                        }
                      />
                      {renderEditError('address')}
                    </div>
                  </div>
                </div>

                <div className="ea-section-block">
                  <div className="ea-section-title-row">
                    <h3>Security</h3>
                  </div>

                  <div className="ea-form-grid">
                    <div className={`ea-field ${selectedErrors.password ? 'has-error' : ''}`}>
                      <label>New Password</label>
                      <input
                        type="password"
                        value={selectedForm.password || ''}
                        onChange={(event) =>
                          handleChange(selected._id, 'password', event.target.value)
                        }
                        placeholder="Leave blank to keep current password"
                      />
                      {renderEditError('password')}
                    </div>

                    <div className={`ea-field ${selectedErrors.confirmPassword ? 'has-error' : ''}`}>
                      <label>Confirm Password</label>
                      <input
                        type="password"
                        value={selectedForm.confirmPassword || ''}
                        onChange={(event) =>
                          handleChange(
                            selected._id,
                            'confirmPassword',
                            event.target.value
                          )
                        }
                        placeholder="Re-enter password"
                      />
                      {renderEditError('confirmPassword')}
                    </div>
                  </div>
                </div>

                <div className="ea-actions">
                  <button
                    className="ea-btn ea-btn-secondary"
                    type="button"
                    onClick={resetSelectedForm}
                    disabled={!hasUnsavedChanges}
                  >
                    Reset Changes
                  </button>

                  <button
                    className="ea-btn ea-btn-primary"
                    onClick={() => handleRequestUpdateClick(selected._id)}
                    disabled={savingId === selected._id}
                  >
                    {savingId === selected._id ? 'Sending Approval...' : 'Request Update Approval'}
                  </button>
                </div>

                <div className="ea-danger-zone">
                  <div className="ea-danger-zone-copy">
                    <h4>Danger Zone</h4>
                    <p>Archive this account if it should no longer remain active.</p>
                  </div>

                  <button
                    className="ea-btn ea-btn-danger"
                    onClick={() => setArchiveTargetId(selected._id)}
                    disabled={archivingId === selected._id}
                  >
                    {archivingId === selected._id
                      ? 'Archiving...'
                      : 'Archive Account'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>

      <AccountConfirmModal
        open={Boolean(pendingSelectionId)}
        title="Discard unsaved changes?"
        message="You have unsaved edits on the current account. Switching now will discard those changes."
        confirmLabel="Switch Account"
        cancelLabel="Stay Here"
        onConfirm={() => {
          if (pendingSelectionId) {
            setOpen(pendingSelectionId);
          }
          setPendingSelectionId(null);
        }}
        onClose={() => setPendingSelectionId(null)}
      />

      <AccountConfirmModal
        open={Boolean(updateTargetId)}
        title="Send account update approval?"
        message="The account will stay unchanged for now. An approval email will be sent to the registered Gmail address, and the edits will apply only after the recipient confirms them."
        details={updateSummaryDetails}
        confirmLabel="Send Approval Email"
        cancelLabel="Review Again"
        busy={savingId === updateTargetId}
        onConfirm={() => updateTargetId && requestAccountUpdate(updateTargetId)}
        onClose={() => {
          if (savingId !== updateTargetId) {
            setUpdateTargetId(null);
          }
        }}
      />

      <AccountConfirmModal
        open={Boolean(archiveTargetId)}
        title="Archive account?"
        message="This account will be removed from the active list and can still be restored later from archived accounts."
        details={[
          { label: 'Username', value: archiveTarget?.username || '-' },
          { label: 'Role', value: archiveTarget?.role || '-' }
        ]}
        confirmLabel="Archive Account"
        cancelLabel="Cancel"
        confirmTone="danger"
        busy={archivingId === archiveTargetId}
        onConfirm={() => archiveTargetId && archiveAccount(archiveTargetId)}
        onClose={() => {
          if (archivingId !== archiveTargetId) {
            setArchiveTargetId(null);
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
