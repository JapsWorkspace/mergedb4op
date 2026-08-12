import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/Header.css';
import JaenLogo from '../assets/images/jaenlogo.png';
import { API_BASE_URL } from "../config/api";

const Header = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rightRef = useRef(null);
  const BASE_URL = API_BASE_URL;
  // Just use the stored role
  const role = localStorage.getItem('role') || 'User';

  const handleLogout = async () => {
    try {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      localStorage.clear();
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfile = () => {
    navigate('/profile');
    setOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (rightRef.current && !rightRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <header className="app-header">
      {/* LEFT */}
      <div className="header-left">
        <div className="logo-wrap" aria-hidden="true">
          <img src={JaenLogo} alt="Jaen Logo" className="logo" />
        </div>
        <div className="brand-text">
          <div className="brand-name">JAEN, NUEVA ECIJA</div>
          <div className="brand-sub">MDRRMO</div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="header-right" ref={rightRef}>
        <div
          className="user-menu"
          onClick={() => setOpen(!open)}
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? setOpen((v) => !v) : null)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Welcome, <strong>{role}</strong>
          <span className="triangle" aria-hidden>▾</span>
        </div>

        {open && (
          <div className="dropdown" role="menu">
            <button onClick={handleProfile}>Profile</button>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;