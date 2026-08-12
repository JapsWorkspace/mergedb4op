import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/Register.css';
import {
  sanitizeAddress,
  sanitizeEmail,
  sanitizeHotline,
  sanitizePassword,
  sanitizePhoneNumber,
  sanitizeUsername
} from './inputSanitizers';
import {
  validateAddress,
  validateConfirmPassword,
  validateEmail,
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

const OFFICIAL_BARANGAYS = [
  "Calabasa",
  "Don Mariano Marcos",
  "Dampulan",
  "Hilera",
  "Imbunia",
  "Lambakin",
  "Langla",
  "Magsalisi",
  "Malabon Kaingin",
  "Marawa",
  "Niyugan",
  "Pamacpacan",
  "Pakol",
  "Pinanggaan",
  "Putlod",
  "San Jose",
  "San Josef (Nabao)",
  "San Pablo",
  "San Roque",
  "San Vicente",
  "Santa Rita",
  "Sapang",
  "Santo Tomas North",
  "Santo Tomas South",
  "Ulanin Pitak"
];

export default function Register() {
  const notificationTimeoutsRef = useRef({});
  const navigate = useNavigate();
  const BASE_URL = API_BASE_URL;

  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (!storedRole) {
      navigate('/');
    }
  }, [navigate]);

  const [role, setRole] = useState('drrmo');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [hotline, setHotline] = useState('');
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [availableBarangays, setAvailableBarangays] = useState(OFFICIAL_BARANGAYS);
  const [barangayLoading, setBarangayLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const fetchBarangayOptions = async () => {
      try {
        setBarangayLoading(true);

        const res = await fetch(`${BASE_URL}/api/auth/barangay-options`, {
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error('Failed to load barangay options');
        }

        const data = await res.json();

        if (Array.isArray(data?.available)) {
          setAvailableBarangays(data.available);
        } else {
          setAvailableBarangays(OFFICIAL_BARANGAYS);
        }
      } catch (err) {
        console.error(err);
        setAvailableBarangays(OFFICIAL_BARANGAYS);
      } finally {
        setBarangayLoading(false);
      }
    };

    fetchBarangayOptions();
  }, [BASE_URL]);

  useEffect(() => {
    if (role !== 'barangay') {
      setBarangay('');
    }
  }, [role]);

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

  useEffect(() => {
    const nextErrors = {};

    if (touched.username) {
      const error = validateUsername(username);
      if (error) nextErrors.username = error;
    }

    if (touched.email) {
      const error = validateEmail(email);
      if (error) nextErrors.email = error;
    }

    if (touched.phoneNumber) {
      const error = validatePhoneNumber(phoneNumber);
      if (error) nextErrors.phoneNumber = error;
    }

    if (touched.address) {
      const error = validateAddress(address);
      if (error) nextErrors.address = error;
    }

    if (touched.password) {
      const error = validateStrongPassword(password);
      if (error) nextErrors.password = error;
    }

    if (touched.confirmPassword) {
      const error = validateConfirmPassword(password, confirmPassword);
      if (error) nextErrors.confirmPassword = error;
    }

    if (role === 'barangay' && touched.barangay && !barangay) {
      nextErrors.barangay = 'Barangay is required';
    }

    setErrors(nextErrors);
  }, [
    username,
    email,
    phoneNumber,
    address,
    password,
    confirmPassword,
    barangay,
    role,
    touched
  ]);

  function computeErrors() {
    const nextErrors = {};

    const usernameError = validateUsername(username);
    if (usernameError) nextErrors.username = usernameError;

    const emailError = validateEmail(email);
    if (emailError) nextErrors.email = emailError;

    const phoneError = validatePhoneNumber(phoneNumber);
    if (phoneError) nextErrors.phoneNumber = phoneError;

    const addressError = validateAddress(address);
    if (addressError) nextErrors.address = addressError;

    const passwordError = validateStrongPassword(password);
    if (passwordError) nextErrors.password = passwordError;

    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (confirmError) nextErrors.confirmPassword = confirmError;

    if (role === 'barangay' && !barangay) {
      nextErrors.barangay = 'Barangay is required';
    }

    return nextErrors;
  }

  async function handleRegister() {
    const freshErrors = computeErrors();
    setErrors(freshErrors);

    setTouched({
      username: true,
      email: true,
      phoneNumber: true,
      address: true,
      password: true,
      confirmPassword: true,
      barangay: role === 'barangay'
    });

    if (Object.keys(freshErrors).length > 0) {
      showNotification('Please fix the highlighted fields first.', 'error');
      return;
    }

    setShowConfirmModal(true);
  }

  async function confirmRegister() {
    const payload = {
      username: username.trim(),
      password,
      role,
      email: email.trim(),
      phoneNumber: phoneNumber.trim(),
      hotline: hotline.trim() || undefined,
      address: address.trim(),
      ...(role === 'barangay' ? { barangay } : {})
    };

      try {
      setIsSubmitting(true);
      setShowConfirmModal(false);

      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      if (role === 'barangay') {
        setAvailableBarangays((prev) => prev.filter((name) => name !== barangay));
      }

      const createdRoleLabel =
        role === 'barangay' ? 'Barangay' : role === 'accountant' ? 'Accountant' : 'DRRMO';
      showNotification(
        `${createdRoleLabel} approval email sent. The account will be created after the recipient confirms it.`,
        'success'
      );

      setRole('drrmo');
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setPhoneNumber('');
      setHotline('');
      setAddress('');
      setBarangay('');
      setErrors({});
      setTouched({});
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Registration failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const usedCount = OFFICIAL_BARANGAYS.length - availableBarangays.length;

  const statItems = useMemo(() => {
    return [
      {
        label: 'Account Type',
        value:
          role === 'barangay' ? 'Barangay' : role === 'accountant' ? 'Accountant' : 'DRRMO',
        tone: role === 'barangay' ? 'green' : role === 'accountant' ? 'amber' : 'blue'
      },
      {
        label: 'Available Barangays',
        value: barangayLoading ? '-' : availableBarangays.length,
        tone: 'green'
      },
      {
        label: 'Occupied Barangays',
        value: barangayLoading ? '-' : usedCount,
        tone: 'amber'
      }
    ];
  }, [role, availableBarangays.length, usedCount, barangayLoading]);

  const renderFieldError = (key) => (
    <div className="field-message" aria-live="polite">
      {errors[key] || ' '}
    </div>
  );

  return (
    <div className="register-page">
      <div className="register-shell">
        <div className="register-hero">
          <div className="register-hero-copy">
            <div className="register-kicker-row">
              <span className="register-kicker">Administration Module</span>
              {barangayLoading && <span className="register-mini-badge">Updating barangays</span>}
            </div>

            <h1 className="register-title">Create Account</h1>

            <div className="register-stats register-stats--hero">
              {statItems.map((item) => (
                <div
                  className={`register-stat-card register-stat-card--${item.tone}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="register-workspace">
          <div className="register-panel register-panel-form">
            <div className="register-panel-top">
              <div className="register-role-switch" aria-label="Account role">
                <button
                  type="button"
                  className={`role-tab ${role === 'drrmo' ? 'active' : ''}`}
                  onClick={() => setRole('drrmo')}
                >
                  DRRMO
                </button>
                <button
                  type="button"
                  className={`role-tab ${role === 'accountant' ? 'active' : ''}`}
                  onClick={() => setRole('accountant')}
                >
                  Accountant
                </button>
                <button
                  type="button"
                  className={`role-tab ${role === 'barangay' ? 'active' : ''}`}
                  onClick={() => setRole('barangay')}
                >
                  Barangay
                </button>
              </div>
            </div>

            <form
              className="register-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                handleRegister();
              }}
            >
              {role === 'barangay' && (
                <div className="form-block form-block-full form-block-highlight">
                  <label className="input-label">Barangay</label>
                  <div className={`input-shell ${errors.barangay ? 'has-error' : ''}`}>
                    <select
                      className="premium-input"
                      value={barangay}
                      onChange={(e) => {
                        setBarangay(e.target.value);
                        setTouched((prev) => ({ ...prev, barangay: true }));
                      }}
                      disabled={barangayLoading}
                    >
                      <option value="">
                        {barangayLoading
                          ? 'Loading barangay options...'
                          : availableBarangays.length === 0
                          ? 'No available barangays'
                          : 'Select barangay'}
                      </option>

                      {availableBarangays.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {renderFieldError('barangay')}
                </div>
              )}

              <div className="form-block">
                <label className="input-label">Username</label>
                <div className={`input-shell ${errors.username ? 'has-error' : ''}`}>
                  <input
                    className="premium-input"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => {
                      setUsername(sanitizeUsername(e.target.value));
                      setTouched((prev) => ({ ...prev, username: true }));
                    }}
                  />
                </div>
                {renderFieldError('username')}
              </div>

              <div className="form-block">
                <label className="input-label">Email Address</label>
                <div className={`input-shell ${errors.email ? 'has-error' : ''}`}>
                  <input
                    className="premium-input"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(sanitizeEmail(e.target.value));
                      setTouched((prev) => ({ ...prev, email: true }));
                    }}
                  />
                </div>
                {renderFieldError('email')}
              </div>

              <div className="form-block">
                <label className="input-label">Phone Number</label>
                <div className={`input-shell ${errors.phoneNumber ? 'has-error' : ''}`}>
                  <input
                    className="premium-input"
                    placeholder="09XXXXXXXXX"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(sanitizePhoneNumber(e.target.value));
                      setTouched((prev) => ({ ...prev, phoneNumber: true }));
                    }}
                  />
                </div>
                {renderFieldError('phoneNumber')}
              </div>

              <div className="form-block">
                <label className="input-label">Hotline</label>
                <div className="input-shell">
                  <input
                    className="premium-input"
                    placeholder="Optional"
                    value={hotline}
                    onChange={(e) => {
                      setHotline(sanitizeHotline(e.target.value));
                    }}
                  />
                </div>
                <div className="field-message">{' '}</div>
              </div>

              <div className="form-block form-block-full">
                <label className="input-label">Address</label>
                <div className={`input-shell ${errors.address ? 'has-error' : ''}`}>
                  <input
                    className="premium-input"
                    placeholder="Enter full address"
                    value={address}
                    onChange={(e) => {
                      setAddress(sanitizeAddress(e.target.value));
                      setTouched((prev) => ({ ...prev, address: true }));
                    }}
                  />
                </div>
                {renderFieldError('address')}
              </div>

              <div className="form-block">
                <label className="input-label">Password</label>
                <div className={`input-shell ${errors.password ? 'has-error' : ''}`}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="premium-input premium-input-with-action"
                    placeholder="Create password"
                    value={password}
                    onChange={(e) => {
                      setPassword(sanitizePassword(e.target.value));
                      setTouched((prev) => ({ ...prev, password: true }));
                    }}
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {renderFieldError('password')}
              </div>

              <div className="form-block">
                <label className="input-label">Confirm Password</label>
                <div className={`input-shell ${errors.confirmPassword ? 'has-error' : ''}`}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="premium-input premium-input-with-action"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(sanitizePassword(e.target.value));
                      setTouched((prev) => ({ ...prev, confirmPassword: true }));
                    }}
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {renderFieldError('confirmPassword')}
              </div>

              <div className="form-actions form-block-full">
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <AccountConfirmModal
        open={showConfirmModal}
        title="Create account?"
        message="Please confirm the details below before creating this account."
        details={[
          {
            label: 'Role',
            value:
              role === 'barangay' ? 'Barangay' : role === 'accountant' ? 'Accountant' : 'DRRMO'
          },
          ...(role === 'barangay'
            ? [{ label: 'Barangay', value: barangay || '-' }]
            : []),
          { label: 'Username', value: username.trim() || '-' },
          { label: 'Email', value: email.trim() || '-' },
          { label: 'Phone', value: phoneNumber.trim() || '-' }
        ]}
        confirmLabel="Create Account"
        cancelLabel="Review Again"
        busy={isSubmitting}
        onConfirm={confirmRegister}
        onClose={() => {
          if (!isSubmitting) {
            setShowConfirmModal(false);
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
