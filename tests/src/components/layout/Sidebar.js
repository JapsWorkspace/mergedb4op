import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import {
  FaBed,
  FaBell,
  FaBuilding,
  FaClipboardCheck,
  FaClipboardList,
  FaHistory,
  FaListUl,
  FaPlusCircle,
  FaSignOutAlt,
  FaSun,
  FaMoon,
  FaBullhorn,
  FaBookOpen,
} from "react-icons/fa";

import logo from "../../assets/images/sagipbayanlogo.png";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;
const SIDEBAR_COUNT_CACHE_KEY = "sidebar:admin:counts";
let sidebarCountMemoryCache = {
  notifications: 0,
  inventory: 0,
  evacuation: 0,
  guidelines: 0,
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
      inventory: Number(parsed?.inventory || 0),
      evacuation: Number(parsed?.evacuation || 0),
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
    inventory: Number(counts?.inventory || 0),
    evacuation: Number(counts?.evacuation || 0),
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

export default function Sidebar({
  variant = "admin",
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
  const isAdmin = variant === "admin";
  const isAccountant = variant === "accountant";
  const basePath = isAccountant ? "/accountant" : "/admin";
  const SIDEBAR_SCROLL_KEY = `sidebar:${variant}:scrollTop`;
  const PAGE_SCROLL_KEY = `sidebar:${variant}:pageScrollY`;
  const cachedCountsRef = useRef(readCachedCounts());

  const [unreadCount, setUnreadCount] = useState(
    cachedCountsRef.current.notifications
  );
  const [inventoryUnreadCount, setInventoryUnreadCount] = useState(
    cachedCountsRef.current.inventory
  );
  const [evacUnreadCount, setEvacUnreadCount] = useState(
    cachedCountsRef.current.evacuation
  );
  const [guidelinesUnreadCount, setGuidelinesUnreadCount] = useState(
    cachedCountsRef.current.guidelines
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
        const [allRes, inventoryCount, evacuationCount, guidelinesCount] = await Promise.all([
          fetch(`${BASE_URL}/api/notifications/unread-count`, {
            method: "GET",
            credentials: "include",
          }),
          getNotificationCount("inventory"),
          getNotificationCount("evacuation"),
          getNotificationCount("guidelines"),
        ]);

        if (allRes.ok) {
          const allData = await allRes.json();

          if (isMounted) {
            const nextUnreadCount = Number(allData.unreadCount || 0);
            const nextInventoryCount = Number(inventoryCount || 0);
            const nextEvacuationCount = Number(evacuationCount || 0);
            const nextGuidelinesCount = Number(guidelinesCount || 0);
            const previousCounts = previousCountsRef.current;

            if (
              hasCompletedInitialFetchRef.current &&
              nextUnreadCount > previousCounts.notifications
            ) {
              triggerBadgePulse("notifications");
            }
            if (
              hasCompletedInitialFetchRef.current &&
              nextInventoryCount > previousCounts.inventory
            ) {
              triggerBadgePulse("inventory");
            }
            if (
              hasCompletedInitialFetchRef.current &&
              nextEvacuationCount > previousCounts.evacuation
            ) {
              triggerBadgePulse("evacuation");
            }
            if (
              hasCompletedInitialFetchRef.current &&
              nextGuidelinesCount > previousCounts.guidelines
            ) {
              triggerBadgePulse("guidelines");
            }

            previousCountsRef.current = {
              notifications: nextUnreadCount,
              inventory: nextInventoryCount,
              evacuation: nextEvacuationCount,
              guidelines: nextGuidelinesCount,
            };
            writeCachedCounts(previousCountsRef.current);
            hasCompletedInitialFetchRef.current = true;

            setUnreadCount(nextUnreadCount);
            setInventoryUnreadCount(nextInventoryCount);
            setEvacUnreadCount(nextEvacuationCount);
            setGuidelinesUnreadCount(nextGuidelinesCount);
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
      section: "Overview",
      items: [
        {
          to: `${basePath}/analytics`,
          label: "Analytics",
          Icon: FaListUl,
          exact: true,
          badge: 0,
        },
      ],
    },
    {
      section: "Management",
      items: [
        ...(!isAccountant
          ? [
              {
                to: "/admin/accounts",
                label: "Account Management",
                Icon: FaBuilding,
                exact: true,
                badge: 0,
              },
              {
                to: "/evacuation",
                label: "Evacuation Centers",
                Icon: FaBed,
                exact: true,
                badge: evacUnreadCount,
                badgeKey: "evacuation",
              },
            ]
          : []),
      ],
    },
    {
      section: "Inventory",
      items: [
        {
          to: `${basePath}/inventory`,
          label: "Inventory",
          Icon: FaClipboardList,
          exact: true,
          badge: inventoryUnreadCount,
          badgeKey: "inventory",
        },
        {
          to: `${basePath}/inventory/add`,
          label: "Add Donations",
          Icon: FaPlusCircle,
          exact: true,
          badge: 0,
        },
        ...((isAdmin || isAccountant)
          ? [
              {
                to: `${basePath}/donations/queue`,
                label: "Donation Queue",
                Icon: FaClipboardCheck,
                exact: true,
                badge: 0,
              },
            ]
          : []),
      ],
    },
    {
      section: "Operations",
      items: [
        {
          to: `${basePath}/relief-lists`,
          label: "Relief Requests",
          Icon: FaClipboardCheck,
          exact: true,
          badge: 0,
        },
        ...(!isAccountant
          ? [
              {
                to: "/admin/announcements",
                label: "Announcements",
                Icon: FaBullhorn,
                exact: true,
                badge: 0,
              },
              {
                to: "/admin/guidelines",
                label: "Guidelines",
                Icon: FaBookOpen,
                exact: true,
                badge: guidelinesUnreadCount,
                badgeKey: "guidelines",
              },
              {
                to: "/admin/time-in-time-out",
                label: "Time In & Time Out",
                Icon: FaHistory,
                exact: true,
                badge: 0,
              },
              {
                to: "/admin/audit-trail",
                label: "Audit Trail",
                Icon: FaHistory,
                exact: true,
                badge: 0,
              },
            ]
          : []),
      ],
    },
  ];

  const utilityLinks = [
    {
      to: `${basePath}/notifications`,
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
      className={`sidebar sidebar--admin ${collapsed ? "collapsed" : ""}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <img src={logo} className="sidebar-logo" alt="Sagip Bayan logo" />

        {!collapsed && (
          <div className="sidebar-brand">
            <h1 className="sidebar-title">SAGIP BAYAN</h1>
            <p className="sidebar-subtitle">Admin Panel</p>
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
            aria-label="Toggle theme"
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
