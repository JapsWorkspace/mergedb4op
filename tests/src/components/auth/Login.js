import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SplashScreen from '../splashscreen/SplashScreen';
import { sanitizeEmail, sanitizePassword } from './inputSanitizers';

import jaenlogo from '../../assets/images/jaenlogo.png';
import sagipbayanlogo from '../../assets/images/sagipbayanlogo.png';

import hero4 from '../../assets/images/hero4.jpg';
import hero5 from '../../assets/images/hero5.jpg';
import hero6 from '../../assets/images/hero6.jpg';

import './Login.css';
import { API_BASE_URL } from "../../config/api";

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [showSplash, setShowSplash] = useState(true);
  const [eError, setEError] = useState('');
  const [pError, setPError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 10 * 60 * 1000;
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);

  const BASE_URL = API_BASE_URL;

  useEffect(() => {
    const lockInfo = JSON.parse(localStorage.getItem('loginLock')) || {};

    if (lockInfo.expiresAt && lockInfo.expiresAt > Date.now()) {
      const remaining = lockInfo.expiresAt - Date.now();

      setIsLocked(true);
      setLockMessage('Too many failed attempts. Try again in:');
      setCountdown(Math.ceil(remaining / 1000));
      setLoginAttempts(MAX_ATTEMPTS);

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            setIsLocked(false);
            setLoginAttempts(0);
            setLockMessage('');
            localStorage.removeItem('loginLock');
            return 0;
          }

          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(countdownRef.current);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const slides = useMemo(() => [hero5, hero4, hero6].filter(Boolean), []);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!slides.length) return;

    const id = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 3500);

    return () => clearInterval(id);
  }, [slides.length]);

  const validateEmail = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Email is required';
    if (!trimmed.includes('@')) return 'Enter a valid email address';
    return '';
  };

  const validatePassword = (value) => {
    if (!value.trim()) return 'Password is required';
    return '';
  };

  const handleEmailChange = (value) => {
    setEmail(sanitizeEmail(value));

    if (eError) {
      setEError(validateEmail(value));
    }

    if (loginError) setLoginError('');
  };

  const handlePasswordChange = (value) => {
    setPassword(sanitizePassword(value));

    if (pError) {
      setPError(validatePassword(value));
    }

    if (loginError) setLoginError('');
  };

  const startLockCountdown = (durationMs) => {
    clearInterval(countdownRef.current);

    const expiresAt = Date.now() + durationMs;

    setIsLocked(true);
    setLockMessage('Too many failed attempts. Try again in:');
    setCountdown(Math.ceil(durationMs / 1000));

    localStorage.setItem(
      'loginLock',
      JSON.stringify({
        attempts: MAX_ATTEMPTS,
        expiresAt
      })
    );

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setIsLocked(false);
          setLoginAttempts(0);
          setLockMessage('');
          localStorage.removeItem('loginLock');
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    const emailValidation = validateEmail(trimmedEmail);
    const passwordValidation = validatePassword(trimmedPassword);

    setEError(emailValidation);
    setPError(passwordValidation);
    setLoginError('');

    if (emailValidation || passwordValidation) return;
    if (isLocked) return;

    const payload = {
      email: trimmedEmail,
      password: trimmedPassword
    };

    try {
      setIsSubmitting(true);

      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = { message: 'Invalid JSON response from server' };
      }

      if (!res.ok) {
        const attempts = loginAttempts + 1;
        setLoginAttempts(attempts);

        if (attempts >= MAX_ATTEMPTS) {
          startLockCountdown(LOCK_DURATION);
          setLoginError('Too many failed login attempts. Access temporarily locked.');
        } else {
          setLoginError(
            data.message || `Login failed. Attempts left: ${MAX_ATTEMPTS - attempts}`
          );
        }

        return;
      }

      setLoginAttempts(0);
localStorage.removeItem('loginLock');

setUser(data);

localStorage.setItem('role', data.role || '');
localStorage.setItem('userId', data.userId || '');
localStorage.setItem('username', data.username || '');
localStorage.setItem('email', data.email || '');

if (data.barangay) {
  localStorage.setItem('barangay', data.barangay);
} else {
  localStorage.removeItem('barangay');
}

if (data.role === 'admin') {
  navigate('/admin/dashboard');
} else if (data.role === 'accountant') {
  navigate('/accountant/dashboard');
} else if (data.role === 'drrmo') {
  navigate('/drrmo/dashboard');
} else {
  navigate('/barangay/relief-request');
}
    } catch (err) {
      console.error('Login fetch error:', err);
      setLoginError('Login failed. Check server or network.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const countdownLabel = `${Math.floor(countdown / 60)}:${`0${countdown % 60}`.slice(-2)}`;

  if (showSplash) return <SplashScreen />;

  return (
    <div className="login-page">
      <div className="login-split">
        <aside className="login-left-carousel" aria-label="Highlights">
          <div className="carousel-stack">
            {slides.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Slide ${i + 1}`}
                className={`carousel-slide ${i === currentSlide ? 'is-active' : ''}`}
                aria-hidden={i === currentSlide ? 'false' : 'true'}
              />
            ))}
          </div>

          <div className="carousel-overlay">
            <div className="carousel-logos" aria-hidden="true">
              <img src={jaenlogo} alt="Jaen Logo" />
              <img
                src={sagipbayanlogo}
                alt="SagipBayan Logo"
                className="logo-sagip"
              />
            </div>

            <div className="carousel-copy">
              <div className="carousel-badge">Official Disaster Response Platform</div>
              <h1 className="carousel-title">Jaen MDRRMO Portal</h1>
              <p className="carousel-tag">
                Secure access for authorized municipal disaster response personnel.
              </p>
            </div>
          </div>
        </aside>

        <main className="login-right-form">
          <form
            className="form-card"
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <div className="gov-strip" aria-hidden="true">
              <div className="gov-brand">
                <img src={jaenlogo} alt="Jaen Seal" className="gov-seal" />
                <div className="gov-label">
                  <div className="gov-name">JAEN, NUEVA ECIJA</div>
                  <div className="gov-sub">
                    MUNICIPAL DISASTER RISK REDUCTION &amp; MANAGEMENT OFFICE
                  </div>
                </div>
              </div>
            </div>

            <div className="login-card-head">
              <div>
                <span className="login-kicker">Secure Access</span>
                <h3 className="card-title">Welcome back</h3>
                <p className="login-subtitle">
                  Sign in using your registered email and password.
                </p>
              </div>
            </div>

            <div className="form-container">
              <div className="field">
                <label className="field-label">Email</label>
                <div className={`input-shell ${eError ? 'has-error' : ''}`}>
                  <span className="input-icon">✉</span>
                  <input
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onBlur={() => setEError(validateEmail(email))}
                  />
                </div>
                <div className="field-message" aria-live="polite">
                  {eError || ' '}
                </div>
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div className={`input-shell ${pError ? 'has-error' : ''}`}>
                  <span className="input-icon">🔒</span>
                  <input
                    placeholder="Enter your password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    onBlur={() => setPError(validatePassword(password))}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="field-message" aria-live="polite">
                  {pError || ' '}
                </div>
              </div>

              <div className="status-area" aria-live="polite">
  {!isLocked && loginAttempts > 0 && (
    <p className="attempts-text">
      Attempts left: {Math.max(0, MAX_ATTEMPTS - loginAttempts)}
    </p>
  )}

  {isLocked && (
    <p className="locked-message">
      <span className="status-dot">🔒</span>
      {lockMessage} {countdownLabel}
    </p>
  )}

  {loginError && <p className="login-error-banner">{loginError}</p>}
</div>

              <button type="submit" disabled={isLocked || isSubmitting}>
                {isLocked
                  ? 'ACCOUNT LOCKED'
                  : isSubmitting
                  ? 'SIGNING IN...'
                  : 'LOGIN'}
              </button>

              <div className="gov-disclaimer">
                Authorized access only. Actions may be logged and audited under
                applicable laws and policies.
              </div>

              <div className="security-line" aria-hidden="true">
                <span>Secured</span>
                <span className="dot">•</span>
                <span>Encrypted Connection</span>
                <span className="dot">•</span>
                <span>Official Use Only</span>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
