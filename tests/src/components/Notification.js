import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArchive,
  FaBan,
  FaBell,
  FaBookOpen,
  FaBoxOpen,
  FaBullhorn,
  FaCheckCircle,
  FaClipboardList,
  FaDonate,
  FaExclamationTriangle,
  FaFilter,
  FaHospital,
  FaRedo,
  FaRegBell,
  FaToggleOff,
  FaToggleOn,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import DashboardShell from "./layout/DashboardShell";
import "../components/css/Notification.css";
import { API_BASE_URL } from "../config/api";

const BASE_URL = API_BASE_URL;

const moduleLabels = {
  all: "All",
  relief: "Relief",
  inventory: "Inventory",
  donation: "Donation",
  announcement: "Announcement",
  incident: "Incident",
  evacuation: "Evacuation",
  guidelines: "Guidelines",
  account: "Account",
  analytics: "Analytics",
  system: "System",
};

const priorityLabels = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

const roleModuleAllowlist = {
  admin: ["all", "evacuation", "inventory", "announcement", "account", "analytics", "system"],
  accountant: ["all", "relief", "inventory", "donation", "analytics", "system"],
  drrmo: [
    "all",
    "relief",
    "inventory",
    "donation",
    "evacuation",
    "announcement",
    "incident",
    "guidelines",
    "system",
  ],
  barangay: ["all", "relief", "evacuation", "system"],
};

function getAllowedModulesForRole(role) {
  return roleModuleAllowlist[String(role || "").toLowerCase()] || ["all", "system"];
}

function formatDate(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeAgo(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(value);
}

function getModuleIcon(moduleName) {
  if (moduleName === "relief") return <FaClipboardList />;
  if (moduleName === "inventory") return <FaBoxOpen />;
  if (moduleName === "donation") return <FaDonate />;
  if (moduleName === "announcement") return <FaBullhorn />;
  if (moduleName === "incident") return <FaExclamationTriangle />;
  if (moduleName === "evacuation") return <FaHospital />;
  if (moduleName === "guidelines") return <FaBookOpen />;
  return <FaBell />;
}

function getEmptyCopy(selectedModule) {
  if (selectedModule === "inventory") {
    return "Inventory warnings such as low stock, expired, and expiring soon items will appear here.";
  }

  if (selectedModule === "donation") {
    return "New goods and monetary donation notifications will appear here.";
  }

  if (selectedModule === "announcement") {
    return "Published announcement updates and announcement delivery notices will appear here.";
  }

  if (selectedModule === "relief") {
    return "Relief request movements such as submitted, approved, rejected, released, and received will appear here.";
  }

  if (selectedModule === "evacuation") {
    return "Evacuation place updates, occupancy changes, full capacity warnings, and archived place notifications will appear here.";
  }

  if (selectedModule === "incident") {
    return "Incident reports, status updates, verification changes, and deleted reports will appear here.";
  }

  if (selectedModule === "guidelines") {
    return "Guideline drafts, published updates, archived items, restored guidelines, and deleted guideline notices will appear here.";
  }

  return "New system notifications will appear here once activities are recorded.";
}

export default function Notification() {
  const navigate = useNavigate();
  const role = String(localStorage.getItem("role") || "guest").toLowerCase();
  const userId = String(localStorage.getItem("userId") || "anonymous");
  const preferenceKey = `notification-preferences:${role}:${userId}`;

  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    hasMore: false,
  });

  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [mutedModules, setMutedModules] = useState({});
  const allowedModules = useMemo(() => getAllowedModulesForRole(role), [role]);

  const visibleModules = useMemo(() => {
    const modules = new Set(allowedModules);

    notifications.forEach((item) => {
      if (item.module && allowedModules.includes(item.module)) {
        modules.add(item.module);
      }
    });

    return Array.from(modules);
  }, [allowedModules, notifications]);

  const manageableModules = useMemo(() => {
    return visibleModules.filter((moduleName) => moduleName !== "all");
  }, [visibleModules]);

  useEffect(() => {
    if (!allowedModules.includes(selectedModule)) {
      setSelectedModule("all");
    }
  }, [allowedModules, selectedModule]);

  const filteredNotifications = useMemo(() => {
    if (!notificationEnabled) return [];

    return notifications.filter((item) => {
      const moduleName = item.module || "system";
      return !mutedModules[moduleName];
    });
  }, [notifications, notificationEnabled, mutedModules]);

  const unreadCount = useMemo(() => {
    return filteredNotifications.filter((item) => !item.isRead).length;
  }, [filteredNotifications]);

  const mutedCount = useMemo(() => {
    return Math.max(0, notifications.length - filteredNotifications.length);
  }, [notifications.length, filteredNotifications.length]);

  const allModulesMuted = useMemo(() => {
    return (
      manageableModules.length > 0 &&
      manageableModules.every((moduleName) => Boolean(mutedModules[moduleName]))
    );
  }, [manageableModules, mutedModules]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(preferenceKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (typeof parsed?.notificationEnabled === "boolean") {
        setNotificationEnabled(parsed.notificationEnabled);
      }
      if (parsed?.mutedModules && typeof parsed.mutedModules === "object") {
        setMutedModules(parsed.mutedModules);
      }
    } catch (storageErr) {
      console.error("Notification preference parse error:", storageErr);
    }
  }, [preferenceKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          notificationEnabled,
          mutedModules,
        })
      );
    } catch (storageErr) {
      console.error("Notification preference save error:", storageErr);
    }
  }, [preferenceKey, notificationEnabled, mutedModules]);

  const fetchNotifications = async () => {
    try {
      if (!notificationEnabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      params.set("limit", "50");

      if (selectedModule !== "all") {
        params.set("module", selectedModule);
      }

      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }

      const res = await fetch(`${BASE_URL}/api/notifications?${params}`, {
        method: "GET",
        credentials: "include",
      });

      let data = {};

      try {
        data = await res.json();
      } catch (jsonErr) {
        data = {};
      }

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            "Notification API route not found. Check server.js route mount: app.use('/api/notifications', notificationRoutes), then restart backend."
          );
        }

        throw new Error(data.message || "Failed to load notifications.");
      }

      setNotifications(
        Array.isArray(data.notifications) ? data.notifications : []
      );

      setPagination(
        data.pagination || {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
        }
      );

      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || "Failed to load notifications.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const requestArchive = async (notificationId) => {
    const res = await fetch(`${BASE_URL}/api/notifications/${notificationId}/archive`, {
      method: "PUT",
      credentials: "include",
    });

    let data = {};
    try {
      data = await res.json();
    } catch (jsonErr) {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data.message || "Failed to archive notification.");
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      setActionLoading(notificationId);

      const res = await fetch(
        `${BASE_URL}/api/notifications/${notificationId}/read`,
        {
          method: "PUT",
          credentials: "include",
        }
      );

      let data = {};

      try {
        data = await res.json();
      } catch (jsonErr) {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to mark notification as read.");
      }

      setNotifications((prev) =>
        prev.map((item) =>
          item._id === notificationId ? { ...item, isRead: true } : item
        )
      );
    } catch (err) {
      setError(err.message || "Failed to mark notification as read.");
    } finally {
      setActionLoading("");
    }
  };

  const markAllAsRead = async () => {
    try {
      setActionLoading("read-all");

      const res = await fetch(`${BASE_URL}/api/notifications/read-all`, {
        method: "PUT",
        credentials: "include",
      });

      let data = {};

      try {
        data = await res.json();
      } catch (jsonErr) {
        data = {};
      }

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to mark all notifications as read."
        );
      }

      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          isRead: true,
        }))
      );
    } catch (err) {
      setError(err.message || "Failed to mark all notifications as read.");
    } finally {
      setActionLoading("");
    }
  };

  const archiveNotification = async (notificationId) => {
    try {
      setActionLoading(`archive-${notificationId}`);
      await requestArchive(notificationId);

      setNotifications((prev) =>
        prev.filter((item) => item._id !== notificationId)
      );
    } catch (err) {
      setError(err.message || "Failed to archive notification.");
    } finally {
      setActionLoading("");
    }
  };

  const clearVisibleNotifications = async () => {
    try {
      if (!filteredNotifications.length) return;

      setActionLoading("clear-all");

      const results = await Promise.allSettled(
        filteredNotifications.map((item) => requestArchive(item._id))
      );

      const removedIds = new Set();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          removedIds.add(filteredNotifications[index]._id);
        }
      });

      setNotifications((prev) => prev.filter((item) => !removedIds.has(item._id)));

      const failed = results.length - removedIds.size;
      if (failed > 0) {
        setError(`${failed} notification(s) could not be cleared. Please retry.`);
      }
    } catch (err) {
      setError(err.message || "Failed to clear notifications.");
    } finally {
      setActionLoading("");
    }
  };

  const deleteAllNotifications = async () => {
    try {
      setActionLoading("delete-all");

      const allIds = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "100");

        const res = await fetch(`${BASE_URL}/api/notifications?${params}`, {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Failed to fetch all notifications.");
        }

        const items = Array.isArray(data.notifications) ? data.notifications : [];
        items.forEach((item) => {
          if (item?._id) allIds.push(item._id);
        });

        hasMore = Boolean(data?.pagination?.hasMore);
        page += 1;
      }

      if (!allIds.length) return;

      const results = await Promise.allSettled(
        allIds.map((id) => requestArchive(id))
      );

      const removedIds = new Set();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          removedIds.add(allIds[index]);
        }
      });

      setNotifications((prev) => prev.filter((item) => !removedIds.has(item._id)));

      const failed = results.length - removedIds.size;
      if (failed > 0) {
        setError(`${failed} notification(s) could not be deleted. Please retry.`);
      }
    } catch (err) {
      setError(err.message || "Failed to delete notifications.");
    } finally {
      setActionLoading("");
    }
  };

  const toggleModuleMuted = (moduleName) => {
    setMutedModules((prev) => ({
      ...prev,
      [moduleName]: !prev[moduleName],
    }));
  };

  const enableAllModules = () => {
    setMutedModules({});
  };

  const muteAllModules = () => {
    setMutedModules(
      manageableModules.reduce((acc, moduleName) => {
        acc[moduleName] = true;
        return acc;
      }, {})
    );
  };

  const resolveNotificationLink = (notification) => {
    const rawLink = String(notification?.link || "").trim();
    const moduleName = String(notification?.module || "").trim().toLowerCase();
    const typeName = String(notification?.type || "").trim().toLowerCase();

    if (
      rawLink === "/announcements" ||
      moduleName === "announcement" ||
      typeName === "announcement_published"
    ) {
      if (role === "admin") return "/admin/announcements";
      if (role === "accountant") return "/accountant/relief-lists";
      if (role === "drrmo") return "/drrmo/announcements";
      return "/";
    }

    if (rawLink === "/donations") {
      if (role === "drrmo") return "/drrmo/inventory/add";
      if (role === "accountant") return "/accountant/inventory/add";
      if (role === "admin") return "/admin/inventory/add";
      return "/";
    }

    return rawLink;
  };

  const handleOpenNotification = async (notification) => {
    if (!notification?.isRead) {
      await markAsRead(notification._id);
    }

    const targetLink = resolveNotificationLink(notification);
    if (targetLink) {
      navigate(targetLink);
    }
  };

  useEffect(() => {
    if (!notificationEnabled) {
      setLoading(false);
      return;
    }

    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModule, selectedStatus, notificationEnabled]);

  return (
    <DashboardShell>
      <div className="notification-page">
        <div className="notification-shell">
          <div className="notification-header-card">
            <div className="notification-header">
              <div className="notification-title-wrap">
                <div className="notification-title-icon">
                  <FaBell />
                </div>

                <div>
                  <span className="notification-eyebrow">Operations</span>
                  <h1 className="notification-title">Notifications</h1>
                  <p className="notification-subtitle">
                    Recent system updates, request movements, donation activity,
                    inventory alerts, evacuation updates, incidents, and
                    guideline changes.
                    {lastUpdated
                      ? ` Last updated ${getTimeAgo(lastUpdated)}.`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="notification-actions notification-actions-main">
                <button
                  type="button"
                  className="notification-button"
                  onClick={fetchNotifications}
                  disabled={loading || !notificationEnabled}
                >
                  <FaRedo />
                  Refresh
                </button>

                <button
                  type="button"
                  className="notification-button"
                  onClick={markAllAsRead}
                  disabled={
                    !notificationEnabled ||
                    actionLoading === "read-all" ||
                    unreadCount === 0
                  }
                >
                  <FaCheckCircle />
                  Mark all read
                </button>
              </div>
            </div>

            <div className="notification-toolbar">
              <div className="notification-actions notification-actions-secondary">
                <button
                  type="button"
                  className={`notification-button ${notificationEnabled ? "toggle-on" : "toggle-off"}`}
                  onClick={() => setNotificationEnabled((prev) => !prev)}
                >
                  {notificationEnabled ? <FaToggleOn /> : <FaToggleOff />}
                  {notificationEnabled ? "Notifications On" : "Notifications Off"}
                </button>

                <button
                  type="button"
                  className="notification-button"
                  onClick={clearVisibleNotifications}
                  disabled={
                    !notificationEnabled ||
                    actionLoading === "clear-all" ||
                    filteredNotifications.length === 0
                  }
                >
                  <FaArchive />
                  Clear visible
                </button>

                <button
                  type="button"
                  className="notification-button danger"
                  onClick={deleteAllNotifications}
                  disabled={
                    !notificationEnabled ||
                    actionLoading === "delete-all" ||
                    notifications.length === 0
                  }
                >
                  <FaTrash />
                  Delete all
                </button>
              </div>

              <span className="notification-toolbar-note">
                Manage delivery by module below (Relief, Inventory, Donation, etc.).
              </span>
            </div>
          </div>

          {error && (
            <div className="notification-error-row">
              <span>{error}</span>
              <button
                type="button"
                className="notification-error-close"
                onClick={() => setError("")}
                aria-label="Close error"
              >
                <FaTimes />
              </button>
            </div>
          )}

          <div className="notification-filters">
            <span className="notification-filter-label">
              <FaFilter />
              Filter
            </span>

            <select
              className="notification-select"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              disabled={!notificationEnabled}
            >
              <option value="all">All status</option>
              <option value="unread">Unread only</option>
              <option value="read">Read only</option>
            </select>

            <select
              className="notification-select"
              value={selectedModule}
              onChange={(event) => setSelectedModule(event.target.value)}
              disabled={!notificationEnabled}
            >
              {visibleModules.map((moduleName) => (
                <option key={moduleName} value={moduleName}>
                  {moduleLabels[moduleName] || moduleName}
                </option>
              ))}
            </select>
          </div>

          <div className="notification-preferences">
            <div className="notification-preferences-head">
              <span className="notification-pref-title">
                <FaBan />
                Notification Controls
              </span>

              <button
                type="button"
                className="notification-button notification-button-sm"
                onClick={allModulesMuted ? enableAllModules : muteAllModules}
                disabled={manageableModules.length === 0}
              >
                {allModulesMuted ? "Unmute All Modules" : "Mute All Modules"}
              </button>
            </div>

            <div className="notification-module-toggles">
              {manageableModules.map((moduleName) => {
                const isMuted = Boolean(mutedModules[moduleName]);
                return (
                  <button
                    key={moduleName}
                    type="button"
                    className={`module-toggle-pill ${isMuted ? "muted" : "active"}`}
                    onClick={() => toggleModuleMuted(moduleName)}
                  >
                    {isMuted ? <FaToggleOff /> : <FaToggleOn />}
                    {moduleLabels[moduleName] || moduleName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="notification-summary">
            <div className="notification-summary-card">
              <span className="notification-summary-label">Visible</span>
              <span className="notification-summary-value">
                {filteredNotifications.length}
              </span>
            </div>

            <div className="notification-summary-card">
              <span className="notification-summary-label">Unread</span>
              <span className="notification-summary-value">{unreadCount}</span>
            </div>

            <div className="notification-summary-card">
              <span className="notification-summary-label">Total matched</span>
              <span className="notification-summary-value">
                {pagination.total || notifications.length}
              </span>
            </div>

            <div className="notification-summary-card">
              <span className="notification-summary-label">Muted hidden</span>
              <span className="notification-summary-value">{mutedCount}</span>
            </div>
          </div>

          {!notificationEnabled ? (
            <div className="notification-empty">
              <FaRegBell />
              <p className="notification-empty-title">Notifications are turned off</p>
              <p className="notification-empty-copy">
                Turn notifications back on anytime to resume updates.
              </p>
            </div>
          ) : loading ? (
            <div className="notification-loading">
              <FaRegBell />
              <p className="notification-empty-title">
                Loading notifications...
              </p>
              <p className="notification-empty-copy">
                Checking the latest system activities.
              </p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <FaRegBell />
              <p className="notification-empty-title">
                No notifications found
              </p>
              <p className="notification-empty-copy">
                {mutedCount > 0
                  ? "All visible notifications are currently muted by your module settings."
                  : getEmptyCopy(selectedModule)}
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {filteredNotifications.map((notification) => {
                const priority = notification.priority || "normal";
                const moduleName = notification.module || "system";

                return (
                  <article
                    key={notification._id}
                    className={`notification-card ${
                      notification.isRead ? "read" : "unread"
                    } notification-card-${moduleName} priority-${priority}`}
                    onClick={() => handleOpenNotification(notification)}
                  >
                    <div className="notification-icon">
                      {getModuleIcon(moduleName)}
                    </div>

                    <div className="notification-content">
                      <div className="notification-card-top">
                        <h2 className="notification-card-title">
                          {notification.title || "Notification"}
                        </h2>

                        {!notification.isRead && (
                          <span className="notification-pill is-new">New</span>
                        )}
                      </div>

                      <p className="notification-card-message">
                        {notification.message || "No message available."}
                      </p>

                      <div className="notification-meta">
                        <span className="notification-pill">
                          {moduleLabels[moduleName] || moduleName}
                        </span>

                        <span
                          className={`notification-pill priority-${priority}`}
                        >
                          {priorityLabels[priority] || priority}
                        </span>

                        <span className="notification-time">
                          {getTimeAgo(notification.createdAt)}
                        </span>

                        <span className="notification-time">
                          {formatDate(notification.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div
                      className="notification-card-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {!notification.isRead && (
                        <button
                          type="button"
                          className="notification-icon-button"
                          title="Mark as read"
                          disabled={actionLoading === notification._id}
                          onClick={() => markAsRead(notification._id)}
                        >
                          <FaCheckCircle />
                        </button>
                      )}

                      <button
                        type="button"
                        className="notification-icon-button archive"
                        title="Archive notification"
                        disabled={
                          actionLoading === `archive-${notification._id}`
                        }
                        onClick={() => archiveNotification(notification._id)}
                      >
                        <FaArchive />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
