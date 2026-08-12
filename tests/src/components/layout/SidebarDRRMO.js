import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import {
  FaBell,
  FaChartBar,
  FaClipboardList,
  FaComments,
  FaCube,
  FaHandHoldingHeart,
  FaHospital,
  FaInfoCircle,
  FaPlusCircle,
  FaSignOutAlt,
  FaSun,
  FaMoon,
  FaBullhorn,
} from "react-icons/fa";

import logo from "../../assets/images/sagipbayanlogo.png";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;
const EMPTY_COUNTS = {
  notifications: 0,
  relief: 0,
  inventory: 0,
  evacuation: 0,
  incident: 0,
  guidelines: 0,
};
const SIDEBAR_COUNT_CACHE_KEY = "sidebar:drrmo:counts";
let sidebarCountMemoryCache = { ...EMPTY_COUNTS };

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
      inventory: Number(parsed?.inventory || 0),
      evacuation: Number(parsed?.evacuation || 0),
      incident: Number(parsed?.incident || 0),
      guidelines: Number(parsed?.guidelines || 0),
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
    inventory: Number(counts?.inventory || 0),
    evacuation: Number(counts?.evacuation || 0),
    incident: Number(counts?.incident || 0),
    guidelines: Number(counts?.guidelines || 0),
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

export default function SidebarDRRMO({
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
  const SIDEBAR_SCROLL_KEY = "sidebar:drrmo:scrollTop";
  const PAGE_SCROLL_KEY = "sidebar:drrmo:pageScrollY";
  const cachedCountsRef = useRef(readCachedCounts());
  const [unreadCount, setUnreadCount] = useState(cachedCountsRef.current.notifications);
  const [reliefUnreadCount, setReliefUnreadCount] = useState(cachedCountsRef.current.relief);
  const [inventoryUnreadCount, setInventoryUnreadCount] = useState(cachedCountsRef.current.inventory);
  const [evacUnreadCount, setEvacUnreadCount] = useState(cachedCountsRef.current.evacuation);
  const [incidentUnreadCount, setIncidentUnreadCount] = useState(cachedCountsRef.current.incident);
  const [guidelinesUnreadCount, setGuidelinesUnreadCount] = useState(cachedCountsRef.current.guidelines);
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
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applyCounts = (counts) => {
      if (!isMounted) return;

      const nextCounts = {
        notifications: Number(counts?.notifications || 0),
        relief: Number(counts?.relief || 0),
        inventory: Number(counts?.inventory || 0),
        evacuation: Number(counts?.evacuation || 0),
        incident: Number(counts?.incident || 0),
        guidelines: Number(counts?.guidelines || 0),
      };
      const previousCounts = previousCountsRef.current;

      if (nextCounts.notifications > previousCounts.notifications) {
        triggerBadgePulse("notifications");
      }
      if (nextCounts.relief > previousCounts.relief) {
        triggerBadgePulse("relief");
      }
      if (nextCounts.inventory > previousCounts.inventory) {
        triggerBadgePulse("inventory");
      }
      if (nextCounts.evacuation > previousCounts.evacuation) {
        triggerBadgePulse("evacuation");
      }
      if (nextCounts.incident > previousCounts.incident) {
        triggerBadgePulse("incident");
      }
      if (nextCounts.guidelines > previousCounts.guidelines) {
        triggerBadgePulse("guidelines");
      }

      if (!hasCompletedInitialFetchRef.current) {
        hasCompletedInitialFetchRef.current = true;
      }

      previousCountsRef.current = nextCounts;
      writeCachedCounts(nextCounts);
      setUnreadCount(nextCounts.notifications);
      setReliefUnreadCount(nextCounts.relief);
      setInventoryUnreadCount(nextCounts.inventory);
      setEvacUnreadCount(nextCounts.evacuation);
      setIncidentUnreadCount(nextCounts.incident);
      setGuidelinesUnreadCount(nextCounts.guidelines);
    };

    const fetchUnreadCounts = async () => {
      try {
        const [
          allRes,
          reliefCount,
          inventoryCount,
          evacuationCount,
          incidentCount,
          guidelinesCount,
        ] = await Promise.all([
          fetch(`${BASE_URL}/api/notifications/unread-count`, {
            method: "GET",
            credentials: "include",
          }),
          getNotificationCount("relief"),
          getNotificationCount("inventory"),
          getNotificationCount("evacuation"),
          getNotificationCount("incident"),
          getNotificationCount("guidelines"),
        ]);

        let allData = { unreadCount: 0 };

        if (allRes.ok) {
          allData = await allRes.json();

          if (isMounted) {
            setUnreadCount(Number(allData.unreadCount || 0));
          }
        }

        if (isMounted) {
          applyCounts({
            notifications: allData.unreadCount,
            relief: reliefCount,
            inventory: inventoryCount,
            evacuation: evacuationCount,
            incident: incidentCount,
            guidelines: guidelinesCount,
          });
        }
      } catch (err) {
        applyCounts(EMPTY_COUNTS);
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
      section: "Overview",
      items: [
        {
          to: "/drrmo/analytics",
          label: "Analytics",
          Icon: FaChartBar,
          exact: true,
          badge: 0,
        },
        {
          to: "/",
          label: "Landing Page",
          Icon: FaComments,
          exact: true,
          badge: 0,
        },
      ],
    },
    {
      section: "Relief",
      items: [
        {
          to: "/drrmo/relief-lists",
          label: "Relief Requests",
          Icon: FaHandHoldingHeart,
          exact: true,
          badge: reliefUnreadCount,
          badgeKey: "relief",
        },
        {
          to: "/drrmo/inventory",
          label: "Inventory",
          Icon: FaClipboardList,
          exact: true,
          badge: inventoryUnreadCount,
          badgeKey: "inventory",
        },
        {
          to: "/drrmo/inventory/add",
          label: "Add Donations",
          Icon: FaPlusCircle,
          exact: true,
          badge: 0,
        },
      ],
    },
    {
      section: "Monitoring",
      items: [
        {
          to: "/drrmo/evacuation-centers",
          label: "Evacuation Centers",
          Icon: FaHospital,
          exact: true,
          badge: evacUnreadCount,
          badgeKey: "evacuation",
        },
        {
          to: "/drrmo/digital-twin",
          label: "Digital Twin",
          Icon: FaCube,
          exact: true,
          badge: 0,
        },
        {
          to: "/drrmo/announcements",
          label: "Announcements",
          Icon: FaBullhorn,
          exact: true,
          badge: 0,
        },
        {
          to: "/drrmo/incident-report",
          label: "Incident Reports",
          Icon: FaInfoCircle,
          exact: true,
          badge: incidentUnreadCount,
          badgeKey: "incident",
        },
        {
          to: "/drrmo/guidelines",
          label: "Guidelines",
          Icon: FaComments,
          exact: true,
          badge: guidelinesUnreadCount,
          badgeKey: "guidelines",
        },
      ],
    },
  ];

  const utilityLinks = [
    {
      to: "/drrmo/notifications",
      label: "Notifications",
      Icon: FaBell,
      exact: true,
      badge: unreadCount,
      badgeKey: "notifications",
    },
  ];

  const ThemeIcon = dark ? FaSun : FaMoon;
  const themeLabel = dark ? "Light mode" : "Dark mode";

  const renderBadge = (badge, collapsedMode = false, badgeKey = "") => {
    const count = Number(badge || 0);
    const isPulsing = Boolean(badgePulses[badgeKey]);

    if (count <= 0) return null;

    return (
      <span
        className={
          collapsedMode
            ? `sidebar-badge sidebar-badge-collapsed ${
                isPulsing ? "sidebar-badge-pulse" : ""
              }`
            : `sidebar-badge ${
                isPulsing ? "sidebar-badge-pulse" : ""
              }`
        }
      >
        <span className={isPulsing ? "sidebar-badge-count sidebar-badge-count-pulse" : "sidebar-badge-count"}>
          {count > 99 ? "99+" : count}
        </span>
      </span>
    );
  };

  return (
    <aside
      className={`sidebar sidebar--drrmo ${collapsed ? "collapsed" : ""}`}
      aria-label="DRRMO navigation"
    >
      <div className="sidebar-header">
        <img src={logo} className="sidebar-logo" alt="Sagip Bayan logo" />

        {!collapsed && (
          <div className="sidebar-brand">
            <h1 className="sidebar-title">DRRMO</h1>
            <p className="sidebar-subtitle">Operations Panel</p>
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
                const Icon = item.Icon;
                const badge = Number(item.badge || 0);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    onClick={handleSidebarNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      "sidebar-link" + (isActive ? " active" : "")
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
          ))}

          <div className="sidebar-group sidebar-utility-group">
            {!collapsed && <div className="sidebar-group-label">Updates</div>}

            {utilityLinks.map((item) => {
              const Icon = item.Icon;
              const badge = Number(item.badge || 0);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={handleSidebarNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    "sidebar-link sidebar-link-notification" +
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
            <ThemeIcon className="sidebar-fa-icon" aria-hidden="true" />

            {!collapsed && (
              <span className="sidebar-link-label">{themeLabel}</span>
            )}
          </button>

          <button
            type="button"
            className="sidebar-link is-button sidebar-link-danger"
            onClick={onLogout}
            title="Log out"
          >
            <FaSignOutAlt className="sidebar-fa-icon" aria-hidden="true" />

            {!collapsed && <span className="sidebar-link-label">Log out</span>}
          </button>
        </div>
      </nav>
    </aside>
  );
}
