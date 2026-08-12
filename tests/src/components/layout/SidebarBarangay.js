import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { FaBell } from "react-icons/fa";

import logo from "../../assets/images/sagipbayanlogo.png";
import reliefwhite from "../../assets/images/reliefwhite.png";
import reliefgreen from "../../assets/images/reliefgreen.png";
import evacuationwhite from "../../assets/images/evacuationwhite.png";
import evacuationgreen from "../../assets/images/evacuationgreen.png";
import logoutwhite from "../../assets/images/logoutwhite.png";
import logoutgreen from "../../assets/images/logoutgreen.png";
import sunwhite from "../../assets/images/sunwhite.png";
import nightgreen from "../../assets/images/nightgreen.png";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;
const SIDEBAR_COUNT_CACHE_KEY = "sidebar:barangay:counts";
let sidebarCountMemoryCache = {
  notifications: 0,
  relief: 0,
  evacuation: 0,
};

const readCachedCounts = () => {
  const fallback = { ...sidebarCountMemoryCache };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.sessionStorage.getItem(SIDEBAR_COUNT_CACHE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    const next = {
      notifications: Number(parsed?.notifications || 0),
      relief: Number(parsed?.relief || 0),
      evacuation: Number(parsed?.evacuation || 0),
    };
    sidebarCountMemoryCache = next;
    return next;
  } catch {
    return fallback;
  }
};

const writeCachedCounts = (counts) => {
  sidebarCountMemoryCache = {
    notifications: Number(counts?.notifications || 0),
    relief: Number(counts?.relief || 0),
    evacuation: Number(counts?.evacuation || 0),
  };

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      SIDEBAR_COUNT_CACHE_KEY,
      JSON.stringify(sidebarCountMemoryCache)
    );
  } catch {}
};

const getNotificationCount = async (moduleName) => {
  const res = await fetch(
    `${BASE_URL}/api/notifications?limit=100&module=${moduleName}&status=unread`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  if (!res.ok) return 0;

  const data = await res.json();
  const items = Array.isArray(data.notifications) ? data.notifications : [];

  return items.length;
};

export default function SidebarBarangay({
  collapsed,
  onToggle,
  onLogout,
  onNavigateMobile,
  username,
  roleLabel,
}) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const navScrollRef = useRef(null);
  const SIDEBAR_SCROLL_KEY = "sidebar:barangay:scrollTop";
  const PAGE_SCROLL_KEY = "sidebar:barangay:pageScrollY";
  const cachedCountsRef = useRef(readCachedCounts());

  const [unreadCount, setUnreadCount] = useState(
    cachedCountsRef.current.notifications
  );
  const [reliefUnreadCount, setReliefUnreadCount] = useState(
    cachedCountsRef.current.relief
  );
  const [evacUnreadCount, setEvacUnreadCount] = useState(
    cachedCountsRef.current.evacuation
  );
  const [badgePulses, setBadgePulses] = useState({});
  const badgeTimersRef = useRef({});
  const previousCountsRef = useRef(cachedCountsRef.current);
  const hasCompletedInitialFetchRef = useRef(false);

  const triggerBadgePulse = useCallback((key) => {
    if (!key) return;

    setBadgePulses((prev) => ({
      ...prev,
      [key]: true,
    }));

    if (badgeTimersRef.current[key]) {
      clearTimeout(badgeTimersRef.current[key]);
    }

    badgeTimersRef.current[key] = window.setTimeout(() => {
      setBadgePulses((prev) => ({
        ...prev,
        [key]: false,
      }));
      delete badgeTimersRef.current[key];
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(badgeTimersRef.current).forEach((timerId) =>
        clearTimeout(timerId)
      );
      badgeTimersRef.current = {};
    };
  }, [triggerBadgePulse]);

  useEffect(() => {
    let isMounted = true;

    const fetchUnreadCounts = async () => {
      try {
        const [allRes, reliefCount, evacuationCount] = await Promise.all([
          fetch(`${BASE_URL}/api/notifications/unread-count`, {
            method: "GET",
            credentials: "include",
          }),
          getNotificationCount("relief"),
          getNotificationCount("evacuation"),
        ]);

        if (allRes.ok) {
          const allData = await allRes.json();

          if (isMounted) {
            const nextUnreadCount = Number(allData.unreadCount || 0);
            const nextReliefCount = Number(reliefCount || 0);
            const nextEvacuationCount = Number(evacuationCount || 0);
            const previousCounts = previousCountsRef.current;

            if (
              hasCompletedInitialFetchRef.current &&
              nextUnreadCount > previousCounts.notifications
            ) {
              triggerBadgePulse("notifications");
            }
            if (
              hasCompletedInitialFetchRef.current &&
              nextReliefCount > previousCounts.relief
            ) {
              triggerBadgePulse("relief");
            }
            if (
              hasCompletedInitialFetchRef.current &&
              nextEvacuationCount > previousCounts.evacuation
            ) {
              triggerBadgePulse("evacuation");
            }

            previousCountsRef.current = {
              notifications: nextUnreadCount,
              relief: nextReliefCount,
              evacuation: nextEvacuationCount,
            };
            writeCachedCounts(previousCountsRef.current);
            hasCompletedInitialFetchRef.current = true;

            setUnreadCount(nextUnreadCount);
            setReliefUnreadCount(nextReliefCount);
            setEvacUnreadCount(nextEvacuationCount);
          }
        }
      } catch (err) {
        // Keep the last known counts on navigation or transient fetch issues.
      }
    };

    fetchUnreadCounts();

    const interval = setInterval(fetchUnreadCounts, 10000);

    const handleFocus = () => {
      fetchUnreadCounts();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [triggerBadgePulse]);

  useEffect(() => {
    const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
    if (navScrollRef.current && Number.isFinite(saved)) {
      navScrollRef.current.scrollTop = saved;
    }
  }, []);

  useEffect(() => {
    const savedPageY = Number(sessionStorage.getItem(PAGE_SCROLL_KEY));
    if (!Number.isFinite(savedPageY)) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedPageY, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const handleSidebarNavigate = useCallback(() => {
    if (navScrollRef.current) {
      sessionStorage.setItem(
        SIDEBAR_SCROLL_KEY,
        String(navScrollRef.current.scrollTop || 0)
      );
    }
    sessionStorage.setItem(PAGE_SCROLL_KEY, String(window.scrollY || 0));
    onNavigateMobile?.();
  }, [onNavigateMobile]);

  const links = [
    {
      section: "Relief",
      items: [
        {
          to: "/barangay/relief-request",
          label: "Relief Request",
          icon: dark ? reliefwhite : reliefgreen,
          badge: reliefUnreadCount,
          badgeKey: "relief",
        },
      ],
    },
    {
      section: "Monitoring",
      items: [
        {
          to: "/barangay/evacuation-centers",
          label: "Evacuation Centers",
          icon: dark ? evacuationwhite : evacuationgreen,
          badge: evacUnreadCount,
          badgeKey: "evacuation",
        },
      ],
    },
  ];

  const utilityLinks = [
    {
      to: "/barangay/notifications",
      label: "Notifications",
      Icon: FaBell,
      badge: unreadCount,
      badgeKey: "notifications",
    },
  ];

  const themeIcon = dark ? sunwhite : nightgreen;
  const themeLabel = dark ? "Light mode" : "Dark mode";
  const logoutIcon = dark ? logoutwhite : logoutgreen;

  const renderBadge = (badge, collapsedMode = false, badgeKey = "") => {
    const count = Number(badge || 0);

    if (count <= 0) return null;

    return (
      <span
        className={
          collapsedMode
            ? `sidebar-badge sidebar-badge-collapsed ${
                badgePulses[badgeKey] ? "sidebar-badge-pulse" : ""
              }`
            : `sidebar-badge ${
                badgePulses[badgeKey] ? "sidebar-badge-pulse" : ""
              }`
        }
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  };

  return (
    <aside
      className={`sidebar sidebar--barangay ${collapsed ? "collapsed" : ""}`}
      aria-label="Barangay navigation"
    >
      <div className="sidebar-header">
        <img src={logo} className="sidebar-logo" alt="Sagip Bayan logo" />

        {!collapsed && (
          <div className="sidebar-brand">
            <h1 className="sidebar-title">BARANGAY</h1>
            <p className="sidebar-subtitle">Local Panel</p>
          </div>
        )}

        <button
          onClick={onToggle}
          className="toggle-btn"
          aria-label="Collapse or expand sidebar"
          type="button"
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="sidebar-nav" role="navigation">
        <div
          className="sidebar-nav-scroll"
          ref={navScrollRef}
          onScroll={() =>
            sessionStorage.setItem(
              SIDEBAR_SCROLL_KEY,
              String(navScrollRef.current?.scrollTop || 0)
            )
          }
        >
          {links.map((group) => (
            <div className="sidebar-group" key={group.section}>
              {!collapsed && (
                <div className="sidebar-group-label">{group.section}</div>
              )}

              {group.items.map((item) => {
                const badge = Number(item.badge || 0);
                const pulseClass = badgePulses[item.badgeKey]
                  ? " sidebar-link-has-update"
                  : "";

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={handleSidebarNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      "sidebar-link" +
                      pulseClass +
                      (isActive ? " active" : "")
                    }
                  >
                    <img src={item.icon} className="sidebar-icon" alt="" />

                    {!collapsed && (
                      <>
                        <span className="sidebar-link-label">{item.label}</span>
                        {renderBadge(badge, false, item.badgeKey)}
                      </>
                    )}

                    {collapsed && renderBadge(badge, true, item.badgeKey)}
                  </NavLink>
                );
              })}
            </div>
          ))}

          <div className="sidebar-group sidebar-utility-group">
            {!collapsed && <div className="sidebar-group-label">Updates</div>}

            {utilityLinks.map((item) => {
              const Icon = item.Icon;
              const badge = Number(item.badge || 0);
              const pulseClass = badgePulses[item.badgeKey]
                ? " sidebar-link-has-update"
                : "";

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={handleSidebarNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    "sidebar-link sidebar-link-notification" +
                    pulseClass +
                    (isActive ? " active" : "")
                  }
                >
                  <Icon className="sidebar-fa-icon" aria-hidden="true" />

                  {!collapsed && (
                    <>
                      <span className="sidebar-link-label">{item.label}</span>
                      {renderBadge(badge, false, item.badgeKey)}
                    </>
                  )}

                  {collapsed && renderBadge(badge, true, item.badgeKey)}
                </NavLink>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          {!collapsed && <div className="sidebar-group-label">Preferences</div>}

          <button
            type="button"
            className="sidebar-link is-button"
            onClick={toggleTheme}
            title={themeLabel}
          >
            <img src={themeIcon} className="sidebar-icon" alt="" />
            {!collapsed && <span className="sidebar-link-label">{themeLabel}</span>}
          </button>

          <button
            type="button"
            className="sidebar-link is-button sidebar-link-danger"
            onClick={onLogout}
            title="Log out"
          >
            <img src={logoutIcon} className="sidebar-icon" alt="" />
            {!collapsed && <span className="sidebar-link-label">Log out</span>}
          </button>
        </div>
      </nav>
    </aside>
  );
}
