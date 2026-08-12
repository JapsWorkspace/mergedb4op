import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaBell, FaMoon, FaSignOutAlt, FaSun } from "react-icons/fa";

import SidebarAdmin from "./Sidebar";
import SidebarDRRMO from "./SidebarDRRMO";
import SidebarBarangay from "./SidebarBarangay";

import "../css/sidebar.css";
import Confirm from "../common/Confirm";
import SplashScreen from "../splashscreen/SplashScreen";
import { API_BASE_URL } from "../../config/api";
import { useTheme } from "../../context/ThemeContext";

export default function DashboardShell({ children, variant }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const profileMenuRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  const BASE_URL = API_BASE_URL;
  const isDark = theme === "dark";

  const resolved =
    variant ??
    (pathname.startsWith("/drrmo")
      ? "drrmo"
      : pathname.startsWith("/accountant")
      ? "accountant"
      : pathname.startsWith("/barangay")
      ? "barangay"
      : "admin");

  const roleLabel = useMemo(() => {
    if (resolved === "drrmo") return "DRRMO";
    if (resolved === "accountant") return "Accountant";
    if (resolved === "barangay") return "Barangay";
    return "Administrator";
  }, [resolved]);

  const SidebarComp =
    resolved === "drrmo"
      ? SidebarDRRMO
      : resolved === "barangay"
      ? SidebarBarangay
      : SidebarAdmin;

  const notificationsPath =
    resolved === "drrmo"
      ? "/drrmo/notifications"
      : resolved === "accountant"
      ? "/accountant/notifications"
      : resolved === "barangay"
      ? "/barangay/notifications"
      : "/admin/notifications";
  const usesEvacuationScrollLayout =
    pathname === "/evacuation" ||
    pathname.endsWith("/evacuation-centers");
  const usesAnalyticsScrollLayout = pathname.endsWith("/analytics");
  const usesReliefListScrollLayout = pathname.endsWith("/relief-lists");
  const usesExtendedScrollLayout =
    usesEvacuationScrollLayout ||
    usesAnalyticsScrollLayout ||
    usesReliefListScrollLayout;

  const requestLogout = () => setConfirmOpen(true);

  const doLogout = async () => {
    setConfirmOpen(false);
    setShowSplash(true);

    try {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } finally {
      localStorage.clear();
      sessionStorage.clear();

      window.setTimeout(() => {
        setShowSplash(false);
        navigate("/Login", { replace: true });
      }, 1200);
    }
  };

  const onToggle = () => {
    setCollapsed((prev) => !prev);
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const storedUsername =
      localStorage.getItem("username") ||
      sessionStorage.getItem("username") ||
      localStorage.getItem("name") ||
      sessionStorage.getItem("name") ||
      "";

    setUsername(storedUsername);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) return;

        const data = await res.json();
        if (isMounted) {
          setUnreadCount(Number(data?.unreadCount || 0));
        }
      } catch {
        // Keep the last unread count on transient failures.
      }
    };

    fetchUnreadCount();
    const intervalId = window.setInterval(fetchUnreadCount, 10000);
    const handleFocus = () => fetchUnreadCount();
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [BASE_URL]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

  const handleOpenNotifications = () => {
    setProfileMenuOpen(false);
    navigate(notificationsPath);
  };

  return (
    <div
      className={`admin-layout ${collapsed ? "has-collapsed" : ""} ${
        mobileOpen ? "has-mobile-sidebar" : ""
      }`}
    >
      <button
        type="button"
        className="mobile-sidebar-toggle"
        onClick={() => setMobileOpen(true)}
        aria-label="Open sidebar"
      >
        ☰
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      <div className={`sidebar-shell ${mobileOpen ? "is-open" : ""}`}>
        <SidebarComp
          variant={resolved}
          collapsed={collapsed}
          onToggle={onToggle}
          onLogout={requestLogout}
          onNavigateMobile={() => setMobileOpen(false)}
          username={username}
          roleLabel={roleLabel}
        />
      </div>

      <main
        className={`admin-main ${
          usesExtendedScrollLayout ? "evac-shell-scroll" : ""
        }`}
      >
        <header className="dashboard-topbar">
          <div className="shell-system-brand" aria-label="System identity">
            <strong className="shell-system-title">
              Jaen Disaster Information and Management System.
            </strong>
          </div>

          <div className="shell-topbar-actions">
            <div className="shell-quick-actions" aria-label="Quick actions">
              <button
                type="button"
                className="shell-quick-action-btn"
                onClick={handleOpenNotifications}
                aria-label="Open notifications"
                title="Notifications"
              >
                <FaBell aria-hidden="true" />
                {unreadCount > 0 ? (
                  <span className="shell-quick-action-badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className="shell-quick-action-btn"
                onClick={toggleTheme}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Light mode" : "Dark mode"}
              >
                {isDark ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
              </button>
            </div>

            <div className="shell-profile-area" ref={profileMenuRef}>
              <button
                type="button"
                className="shell-profile-inline shell-profile-trigger"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                <div className="shell-profile-meta">
                  <span className="shell-profile-kicker">Signed in as</span>
                  <strong className="shell-profile-name">
                    {username || "Unknown User"}
                  </strong>
                  <span className="shell-profile-role">{roleLabel}</span>
                </div>
                <div className="shell-profile-avatar">
                  {(username || roleLabel || "U").charAt(0).toUpperCase()}
                </div>
              </button>

              {profileMenuOpen ? (
                <div className="shell-profile-menu" role="menu">
                  <button
                    type="button"
                    className="shell-profile-menu-item danger"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      requestLogout();
                    }}
                    role="menuitem"
                  >
                    <FaSignOutAlt aria-hidden="true" />
                    <span>Log out</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <section
          className={`admin-content ${
            usesExtendedScrollLayout ? "evac-scroll-layout" : ""
          }`}
        >
          <div
            className={`admin-content-inner ${
              usesExtendedScrollLayout ? "evac-scroll-layout-inner" : ""
            }`}
          >
            <div className="shell-page-content">{children}</div>
          </div>
        </section>
      </main>

      <Confirm
        open={confirmOpen}
        title="Log out"
        message="Are you sure you want to log out?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doLogout}
      />

      {showSplash && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "#fff",
          }}
        >
          <SplashScreen />
        </div>
      )}
    </div>
  );
}
