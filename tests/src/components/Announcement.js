import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaBell,
  FaCheck,
  FaEdit,
  FaExclamationTriangle,
  FaEye,
  FaFilePdf,
  FaImage,
  FaInbox,
  FaThumbtack,
  FaTimes,
  FaTrash,
  FaUndo,
  FaUpload,
} from "react-icons/fa";
import DashboardShell from "./layout/DashboardShell";
import "./css/Guidelines.css";
import "./css/Announcement.css";
import {
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_TITLE_LENGTH,
  sanitizeContentDescription,
  sanitizeContentDescriptionInput,
  sanitizeContentTitle,
  sanitizeContentTitleInput,
  validateContentFields,
} from "./contentTextUtils";

const LOCAL_BASE_URL = "http://localhost:8000";
const REMOTE_BASE_URL =
  process.env.REACT_APP_API_URL || "https://gaganadapat.onrender.com";
const BASE_URL =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? LOCAL_BASE_URL
    : REMOTE_BASE_URL;
const ANNOUNCEMENTS_URL = `${BASE_URL}/api/announcements`;

const NOTIFICATION_DURATION = 10000;
const MAX_VISIBLE_NOTIFICATIONS = 4;

const buildNotification = (message, type = "info") => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  message,
  type,
});

const stripHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const normalizeServerMessage = (value, fallback) => {
  const cleaned = stripHtml(value);

  if (!cleaned) {
    return fallback;
  }

  if (/cannot get\s+\/api\/announcements/i.test(cleaned)) {
    return "Announcement service is not reachable right now. Please refresh or check the backend.";
  }

  return cleaned;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "-";

const PRIORITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_SORT_ORDER = {
  published: 0,
  draft: 1,
  archived: 2,
};

const EMPTY_MODAL = {
  open: false,
  title: "",
  message: "",
  action: "",
  announcement: null,
};

const sortAnnouncements = (items = [], sortBy = "published_first") => {
  const next = [...items];

  return next.sort((a, b) => {
    const aPinned = Number(Boolean(a?.pinned));
    const bPinned = Number(Boolean(b?.pinned));
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    const aStatus = normalize(a?.status);
    const bStatus = normalize(b?.status);
    const aCategory = String(a?.category || "").toLowerCase();
    const bCategory = String(b?.category || "").toLowerCase();

    if (sortBy === "newest") return bCreated - aCreated;
    if (sortBy === "oldest") return aCreated - bCreated;

    if (sortBy === "draft_first") {
      const aDraftRank = aStatus === "draft" ? 0 : 1;
      const bDraftRank = bStatus === "draft" ? 0 : 1;
      if (aDraftRank !== bDraftRank) return aDraftRank - bDraftRank;
      return bCreated - aCreated;
    }

    if (sortBy === "category") {
      const categoryCompare = aCategory.localeCompare(bCategory);
      if (categoryCompare !== 0) return categoryCompare;

      const statusCompare =
        (STATUS_SORT_ORDER[aStatus] ?? 99) - (STATUS_SORT_ORDER[bStatus] ?? 99);
      if (statusCompare !== 0) return statusCompare;

      return bCreated - aCreated;
    }

    const statusCompare =
      (STATUS_SORT_ORDER[aStatus] ?? 99) - (STATUS_SORT_ORDER[bStatus] ?? 99);
    if (statusCompare !== 0) return statusCompare;

    const priorityDiff =
      (PRIORITY_ORDER[b?.priorityLevel] || 0) -
      (PRIORITY_ORDER[a?.priorityLevel] || 0);
    if (priorityDiff !== 0) return priorityDiff;

    return bCreated - aCreated;
  });
};

const getNotificationIcon = (type) => {
  if (type === "success") return <FaCheck />;
  if (type === "error") return <FaTimes />;
  if (type === "warning") return <FaExclamationTriangle />;
  return <FaBell />;
};

const getStatusTone = (status) => {
  const value = normalize(status);
  if (value === "published") return "published";
  if (value === "archived") return "archived";
  return "draft";
};

const getPriorityTone = (priority) => {
  const value = normalize(priority);
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
};

const readResponsePayload = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: normalizeServerMessage(
        text,
        `Request failed with status ${response.status}`
      ),
    };
  }
};

export default function Announcement() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("published_first");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState("draft");
  const [priorityLevel, setPriorityLevel] = useState("medium");
  const [files, setFiles] = useState([]);

  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editStatus, setEditStatus] = useState("draft");
  const [editPriority, setEditPriority] = useState("medium");
  const [editFiles, setEditFiles] = useState([]);
  const [removeImages, setRemoveImages] = useState([]);

  const [imagePreview, setImagePreview] = useState({
    open: false,
    src: "",
    alt: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [confirmState, setConfirmState] = useState(EMPTY_MODAL);

  const notificationTimeoutsRef = useRef({});
  const createPanelRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  useEffect(() => {
    const timeouts = notificationTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    const node = createPanelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const updateHeight = () => {
      setPanelHeight(node.offsetHeight || null);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const shouldLock =
      Boolean(editingAnnouncement) ||
      Boolean(confirmState.open) ||
      Boolean(imagePreview.open);

    const previousOverflow = document.body.style.overflow;

    if (shouldLock) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingAnnouncement, confirmState.open, imagePreview.open]);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    if (notificationTimeoutsRef.current[id]) {
      clearTimeout(notificationTimeoutsRef.current[id]);
      delete notificationTimeoutsRef.current[id];
    }
  }, []);

  const pushNotification = useCallback((message, type = "info") => {
    const notification = buildNotification(message, type);

    setNotifications((prev) => {
      const alreadyVisible = prev.some(
        (item) => item.message === notification.message && item.type === notification.type
      );

      if (alreadyVisible) {
        return prev;
      }

      return [notification, ...prev].slice(0, MAX_VISIBLE_NOTIFICATIONS);
    });

    notificationTimeoutsRef.current[notification.id] = setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
      delete notificationTimeoutsRef.current[notification.id];
    }, NOTIFICATION_DURATION);
  }, []);

  const categories = useMemo(
    () => ["general", "advisory", "event", "service", "weather", "emergency"],
    []
  );

  const priorities = useMemo(() => ["low", "medium", "high", "critical"], []);
  const createContentError = validateContentFields(title, description);
  const editContentError = validateContentFields(editTitle, editDescription);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({ includeAll: "true" });
      if (showArchived) {
        params.set("status", "archived");
      }

      const response = await fetch(`${ANNOUNCEMENTS_URL}?${params.toString()}`, {
        credentials: "include",
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to load announcements");
      }

      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setAnnouncements([]);
      pushNotification(error.message || "Failed to load announcements.", "error");
    } finally {
      setLoading(false);
    }
  }, [pushNotification, showArchived]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const exportPublishedAnnouncementsPdf = async () => {
    try {
      const pdfUrl = `${ANNOUNCEMENTS_URL}/published/export-pdf`;
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      pushNotification("Opening published announcements PDF...", "info");
    } catch (error) {
      console.error(error);
      pushNotification("Failed to open published announcements PDF.", "error");
    }
  };

  const resetCreateForm = () => {
    setTitle("");
    setDescription("");
    setCategory("general");
    setStatus("draft");
    setPriorityLevel("medium");
    setFiles([]);
  };

  const closeEditModal = () => {
    setEditingAnnouncement(null);
    setEditTitle("");
    setEditDescription("");
    setEditCategory("general");
    setEditStatus("draft");
    setEditPriority("medium");
    setEditFiles([]);
    setRemoveImages([]);
  };

  const openEditModal = (item) => {
    setEditingAnnouncement(item);
    setEditTitle(sanitizeContentTitle(item?.title || ""));
    setEditDescription(sanitizeContentDescription(item?.description || ""));
    setEditCategory(item?.category || "general");
    setEditStatus(item?.status || "draft");
    setEditPriority(item?.priorityLevel || "medium");
    setEditFiles([]);
    setRemoveImages([]);
  };

  const openConfirm = (titleText, message, action, announcement) => {
    setConfirmState({
      open: true,
      title: titleText,
      message,
      action,
      announcement,
    });
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirmState(EMPTY_MODAL);
  };

  const openImagePreview = (src, alt = "Announcement image") => {
    if (!src) return;
    setImagePreview({
      open: true,
      src,
      alt,
    });
  };

  const closeImagePreview = () => {
    setImagePreview({
      open: false,
      src: "",
      alt: "",
    });
  };

  const pickFile = (event) => {
    setFiles(Array.from(event.target.files || []));
  };

  const pickEditFile = (event) => {
    setEditFiles(Array.from(event.target.files || []));
  };

  const createAnnouncement = async () => {
    const cleanTitle = sanitizeContentTitle(title);
    const cleanDescription = sanitizeContentDescription(description);
    const validationError = validateContentFields(cleanTitle, cleanDescription);

    if (validationError) {
      pushNotification(validationError, "error");
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append("title", cleanTitle);
      formData.append("description", cleanDescription);
      formData.append("category", category);
      formData.append("status", status);
      formData.append("priorityLevel", priorityLevel);
      formData.append("sendSms", "true");
      formData.append("sendEmail", "true");
      files.forEach((file) => formData.append("attachments", file));

      const response = await fetch(ANNOUNCEMENTS_URL, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to create announcement");
      }

      setAnnouncements((prev) => [data, ...prev]);
      resetCreateForm();
      pushNotification("Announcement created successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to create announcement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAnnouncement = async () => {
    if (!editingAnnouncement?._id) return;

    const cleanTitle = sanitizeContentTitle(editTitle);
    const cleanDescription = sanitizeContentDescription(editDescription);
    const validationError = validateContentFields(cleanTitle, cleanDescription);

    if (validationError) {
      pushNotification(validationError, "error");
      return;
    }

    try {
      setSubmitting(true);

      const hasFileChanges = editFiles.length > 0 || removeImages.length > 0;
      let response;

      if (hasFileChanges) {
        const formData = new FormData();
        formData.append("title", cleanTitle);
        formData.append("description", cleanDescription);
        formData.append("category", editCategory);
        formData.append("status", editStatus);
        formData.append("priorityLevel", editPriority);
        formData.append("removeImages", JSON.stringify(removeImages || []));
        editFiles.forEach((file) => formData.append("attachments", file));

        response = await fetch(`${ANNOUNCEMENTS_URL}/${editingAnnouncement._id}`, {
          method: "PUT",
          body: formData,
          credentials: "include",
        });
      } else {
        response = await fetch(`${ANNOUNCEMENTS_URL}/${editingAnnouncement._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: cleanTitle,
            description: cleanDescription,
            category: editCategory,
            status: editStatus,
            priorityLevel: editPriority,
          }),
        });
      }

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to update announcement");
      }

      setAnnouncements((prev) =>
        prev.map((item) => (item._id === editingAnnouncement._id ? data : item))
      );

      closeEditModal();
      pushNotification("Announcement updated successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to update announcement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, nextStatus, successMessage) => {
    try {
      setSubmitting(true);

      const response = await fetch(`${ANNOUNCEMENTS_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || "Failed to update announcement status"
        );
      }

      setAnnouncements((prev) => prev.map((item) => (item._id === id ? data : item)));
      pushNotification(successMessage, "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to update announcement status.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const publishAnnouncement = async (id) =>
    updateStatus(id, "published", "Announcement published successfully.");

  const makeDraft = async (id) =>
    updateStatus(id, "draft", "Announcement moved to draft.");

  const archiveAnnouncement = async (id) =>
    updateStatus(id, "archived", "Announcement archived successfully.");

  const restoreAnnouncement = async (id) =>
    updateStatus(id, "draft", "Announcement restored to draft.");

  const togglePinned = async (item) => {
    if (!item?._id) return;

    try {
      setSubmitting(true);

      const response = await fetch(`${ANNOUNCEMENTS_URL}/${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pinned: !Boolean(item?.pinned) }),
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to update pin status");
      }

      setAnnouncements((prev) => prev.map((entry) => (entry._id === item._id ? data : entry)));
      pushNotification(
        data?.pinned ? "Announcement pinned successfully." : "Announcement unpinned successfully.",
        "success"
      );
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to update pin status.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteArchived = async (id) => {
    try {
      setSubmitting(true);

      const response = await fetch(`${ANNOUNCEMENTS_URL}/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to delete announcement");
      }

      setAnnouncements((prev) => prev.filter((item) => item._id !== id));
      closeConfirm();
      pushNotification("Announcement permanently deleted.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to delete announcement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    const announcement = confirmState?.announcement;
    if (!announcement?._id) return;

    if (confirmState.action === "archive") {
      await archiveAnnouncement(announcement._id);
      closeConfirm();
      return;
    }

    if (confirmState.action === "restore") {
      await restoreAnnouncement(announcement._id);
      closeConfirm();
      return;
    }

    if (confirmState.action === "delete") {
      await deleteArchived(announcement._id);
    }
  };

  const visibleAnnouncements = useMemo(() => {
    const next = announcements.filter((item) =>
      showArchived
        ? normalize(item?.status) === "archived"
        : normalize(item?.status) !== "archived"
    );

    return sortAnnouncements(next, sortBy);
  }, [announcements, showArchived, sortBy]);

  const currentAttachments = useMemo(() => {
    return (
      editingAnnouncement?.attachments?.filter(
        (img) => !removeImages.some((removed) => removed.public_id === img.public_id)
      ) || []
    );
  }, [editingAnnouncement, removeImages]);

  const topTotals = useMemo(() => {
    return announcements.reduce(
      (acc, item) => {
        acc.total += 1;

        const statusValue = normalize(item?.status);
        if (statusValue === "draft") acc.draft += 1;
        if (statusValue === "published") acc.published += 1;
        if (statusValue === "archived") acc.archived += 1;

        acc.views += Number(item?.viewCount || item?.views || 0);
        return acc;
      },
      {
        total: 0,
        draft: 0,
        published: 0,
        archived: 0,
        views: 0,
      }
    );
  }, [announcements]);

  return (
    <DashboardShell>
      <div className="gl-page an-page">
        <div className="gl-shell">
          <section className="gl-header-card">
            <div className="gl-header-head">
              <div className="gl-header-main">
                <h1 className="gl-header-title">Announcement Management</h1>
              </div>

              <div className="gl-header-actions">
                <button
                  type="button"
                  className="gl-btn gl-btn-primary"
                  onClick={exportPublishedAnnouncementsPdf}
                >
                  <FaFilePdf />
                  Export PDF
                </button>
              </div>
            </div>

            <div className="gl-legend-row">
              <span className="gl-legend-item">
                <span className="gl-legend-dot draft" />
                Draft
              </span>
              <span className="gl-legend-item">
                <span className="gl-legend-dot published" />
                Published
              </span>
              <span className="gl-legend-item">
                <span className="gl-legend-dot archived" />
                Archived
              </span>
              <span className="gl-legend-item">
                <FaThumbtack />
                Pinned
              </span>
            </div>

            <div className="gl-totals-row gl-totals-row-five">
              <article className="gl-total-card">
                <div className="gl-total-card-top">
                  <span>Total</span>
                  <span className="gl-total-icon">
                    <FaInbox />
                  </span>
                </div>
                <strong>{topTotals.total}</strong>
              </article>

              <article className="gl-total-card warning">
                <div className="gl-total-card-top">
                  <span>Draft</span>
                  <span className="gl-total-icon">
                    <FaEdit />
                  </span>
                </div>
                <strong>{topTotals.draft}</strong>
              </article>

              <article className="gl-total-card success">
                <div className="gl-total-card-top">
                  <span>Published</span>
                  <span className="gl-total-icon">
                    <FaCheck />
                  </span>
                </div>
                <strong>{topTotals.published}</strong>
              </article>

              <article className="gl-total-card info">
                <div className="gl-total-card-top">
                  <span>Views</span>
                  <span className="gl-total-icon">
                    <FaEye />
                  </span>
                </div>
                <strong>{topTotals.views}</strong>
              </article>

              <article className="gl-total-card danger">
                <div className="gl-total-card-top">
                  <span>Archived</span>
                  <span className="gl-total-icon">
                    <FaTrash />
                  </span>
                </div>
                <strong>{topTotals.archived}</strong>
              </article>
            </div>
          </section>

          <section
            className="gl-board gl-board-equal"
            style={panelHeight ? { "--an-panel-height": `${panelHeight}px` } : undefined}
          >
            <div className="gl-board-left">
              <section
                ref={createPanelRef}
                className="gl-card gl-form-card gl-form-card-fixed"
              >
                <div className="gl-toolbar">
                  <div className="gl-toolbar-title">
                    <h2>Create Announcement</h2>
                  </div>
                </div>

                <div className="gl-form-grid">
                  <div className="gl-field">
                    <label>Title</label>
                    <input
                      className="gl-input"
                      value={title}
                      onChange={(e) => setTitle(sanitizeContentTitleInput(e.target.value))}
                      onBlur={(e) => setTitle(sanitizeContentTitle(e.target.value))}
                      placeholder="Enter announcement title"
                      maxLength={MAX_CONTENT_TITLE_LENGTH}
                    />
                  </div>

                  <div className="gl-field">
                    <label>Description</label>
                    <textarea
                      className="gl-textarea"
                      value={description}
                      onChange={(e) =>
                        setDescription(sanitizeContentDescriptionInput(e.target.value))
                      }
                      onBlur={(e) =>
                        setDescription(sanitizeContentDescription(e.target.value))
                      }
                      placeholder="Write announcement details"
                      maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
                    />
                  </div>

                  <div className="gl-field">
                    <label>Category</label>
                    <div className="gl-chip-row">
                      {categories.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={`gl-filter-chip ${category === item ? "active" : ""}`}
                          onClick={() => setCategory(item)}
                        >
                          {formatStatusLabel(item)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="gl-two-col">
                    <div className="gl-field">
                      <label>Status</label>
                      <div className="gl-chip-row">
                        {["draft", "published"].map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={`gl-filter-chip gl-status-chip ${
                              status === item ? "active" : ""
                            } ${normalize(item)}`}
                            onClick={() => setStatus(item)}
                          >
                            {formatStatusLabel(item)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="gl-field">
                      <label>Priority</label>
                      <div className="gl-chip-row">
                        {priorities.map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={`gl-filter-chip ${
                              priorityLevel === item ? "active" : ""
                            } ${getPriorityTone(item)}`}
                            onClick={() => setPriorityLevel(item)}
                          >
                            {formatStatusLabel(item)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="gl-field">
                    <label>Attachments</label>
                    <label className="gl-upload-box">
                      <FaUpload />
                      <span>Upload image attachments</span>
                      <input type="file" multiple accept="image/*" onChange={pickFile} hidden />
                    </label>

                    <div className="an-attachment-feedback">
                      {files.length > 0 ? (
                        <div className="gl-selected-files">
                          {files.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="gl-file-pill">
                              <FaImage />
                              <span>{file.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="gl-mini-empty">No files selected.</div>
                      )}
                    </div>
                  </div>

                  <div className="gl-action-row">
                    <button
                      type="button"
                      className="gl-btn gl-btn-secondary"
                      onClick={resetCreateForm}
                      disabled={submitting}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="gl-btn gl-btn-primary"
                      onClick={createAnnouncement}
                      disabled={submitting || Boolean(createContentError)}
                    >
                      <FaUpload />
                      {submitting ? "Creating..." : "Create Announcement"}
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="gl-board-right">
              <section className="gl-card gl-list-card gl-list-card-fixed">
                <div className="gl-toolbar">
                  <div className="gl-toolbar-top">
                    <div className="gl-toolbar-title">
                      <h2>All Announcements</h2>
                    </div>

                    <div className="gl-list-toolbar-actions">
                      <select
                        className="gl-input gl-sort-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                      >
                        <option value="published_first">Published First</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="draft_first">Draft First</option>
                        <option value="category">Category</option>
                      </select>

                      <button
                        type="button"
                        className="gl-btn gl-btn-secondary gl-toolbar-toggle-btn"
                        onClick={() => setShowArchived((prev) => !prev)}
                      >
                        {showArchived ? (
                          <>
                            <FaUndo />
                            Show Active
                          </>
                        ) : (
                          <>
                            <FaInbox />
                            Show Archived
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="gl-list-scroll">
                  {loading ? (
                    <div className="gl-empty-state">Loading announcements...</div>
                  ) : visibleAnnouncements.length === 0 ? (
                    <div className="gl-empty-state">
                      {showArchived
                        ? "No archived announcements found."
                        : "No announcements found."}
                    </div>
                  ) : (
                    <div className="gl-list-grid">
                      {visibleAnnouncements.map((item) => {
                        const statusTone = getStatusTone(item?.status);
                        const priorityTone = getPriorityTone(item?.priorityLevel);

                        return (
                          <article
                            key={item._id}
                            className={`gl-item-card gl-item-${statusTone} ${
                              item?.pinned ? "an-item-pinned" : ""
                            }`}
                          >
                            <div className="gl-item-top">
                              <div className="gl-item-main">
                                <div className="gl-item-title">{item.title || "-"}</div>
                                <div className="gl-item-meta">
                                  <span className="gl-item-badge">
                                    {formatStatusLabel(item.category)}
                                  </span>
                                  <span className={`gl-item-badge ${priorityTone}`}>
                                    {formatStatusLabel(item.priorityLevel)}
                                  </span>
                                  <span className={`gl-item-badge status-${statusTone}`}>
                                    {formatStatusLabel(item.status)}
                                  </span>
                                  {item?.pinned ? (
                                    <span className="gl-item-badge an-pinned-badge">
                                      <FaThumbtack />
                                      Pinned
                                    </span>
                                  ) : null}
                                  <span className="gl-item-badge an-sender-badge">
                                    {item?.senderDisplay || "DRRMO"}
                                  </span>
                                </div>
                              </div>

                              <div className="gl-item-views">
                                <FaEye />
                                <strong>{Number(item?.viewCount || item?.views || 0)}</strong>
                              </div>
                            </div>

                            <div className="gl-item-body">
                              <div className="gl-item-content">
                                <p className="gl-item-description">
                                  {item.description || "-"}
                                </p>

                                <div className="gl-item-actions gl-item-actions-inline">
                                  {normalize(item?.status) !== "archived" ? (
                                    <>
                                      {normalize(item?.status) === "draft" ? (
                                        <button
                                          type="button"
                                          className="gl-btn gl-btn-approve"
                                          onClick={() => publishAnnouncement(item._id)}
                                          disabled={submitting}
                                        >
                                          <FaCheck />
                                          Publish
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="gl-btn gl-btn-secondary"
                                          onClick={() => makeDraft(item._id)}
                                          disabled={submitting}
                                        >
                                          <FaUndo />
                                          Draft
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        className={`gl-btn ${
                                          item?.pinned ? "gl-btn-secondary" : "gl-btn-approve"
                                        }`}
                                        onClick={() => togglePinned(item)}
                                        disabled={submitting}
                                      >
                                        <FaThumbtack />
                                        {item?.pinned ? "Unpin" : "Pin"}
                                      </button>

                                      <button
                                        type="button"
                                        className="gl-btn gl-btn-primary"
                                        onClick={() => openEditModal(item)}
                                        disabled={submitting}
                                      >
                                        <FaEdit />
                                        Update
                                      </button>

                                      <button
                                        type="button"
                                        className="gl-btn gl-btn-danger"
                                        onClick={() =>
                                          openConfirm(
                                            "Archive announcement?",
                                            `This will move "${
                                              item.title || "this announcement"
                                            }" to archived status.`,
                                            "archive",
                                            item
                                          )
                                        }
                                        disabled={submitting}
                                      >
                                        <FaTrash />
                                        Archive
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="gl-btn gl-btn-secondary"
                                        onClick={() =>
                                          openConfirm(
                                            "Restore announcement?",
                                            `This will restore "${
                                              item.title || "this announcement"
                                            }" back to draft.`,
                                            "restore",
                                            item
                                          )
                                        }
                                        disabled={submitting}
                                      >
                                        <FaUndo />
                                        Restore
                                      </button>

                                      <button
                                        type="button"
                                        className="gl-btn gl-btn-danger"
                                        onClick={() =>
                                          openConfirm(
                                            "Delete permanently?",
                                            `This will permanently remove "${
                                              item.title || "this announcement"
                                            }" and its uploaded images.`,
                                            "delete",
                                            item
                                          )
                                        }
                                        disabled={submitting}
                                      >
                                        <FaTrash />
                                        Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <aside className="gl-item-media-col">
                                {item.attachments?.length > 0 ? (
                                  <button
                                    type="button"
                                    className="gl-thumb-button gl-thumb-button-large"
                                    onClick={() =>
                                      openImagePreview(
                                        item.attachments?.[0]?.fileUrl,
                                        item.attachments?.[0]?.fileName || "Announcement image"
                                      )
                                    }
                                  >
                                    <img
                                      src={item.attachments?.[0]?.fileUrl}
                                      alt={item.attachments?.[0]?.fileName || "Announcement image"}
                                      className="gl-thumb gl-thumb-large"
                                    />
                                    {item.attachments.length > 1 ? (
                                      <span className="gl-thumb-count">
                                        +{item.attachments.length - 1}
                                      </span>
                                    ) : null}
                                  </button>
                                ) : (
                                  <div className="gl-item-media-empty">
                                    <FaImage />
                                    <span>No image</span>
                                  </div>
                                )}
                              </aside>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>
        </div>

        {editingAnnouncement
          ? createPortal(
              <div className="gl-modal-backdrop gl-modal-backdrop-centered">
                <div className="gl-modal-card gl-modal-card-fixed">
                  <h3>Update Announcement</h3>
                  <p>Keep this compact and consistent. Update only what is needed.</p>

                  <div className="gl-modal-fixed-body">
                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Title</label>
                      <input
                        className="gl-input"
                        value={editTitle}
                        onChange={(e) =>
                          setEditTitle(sanitizeContentTitleInput(e.target.value))
                        }
                        onBlur={(e) => setEditTitle(sanitizeContentTitle(e.target.value))}
                        placeholder="Announcement title"
                        maxLength={MAX_CONTENT_TITLE_LENGTH}
                      />
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Description</label>
                      <textarea
                        className="gl-modal-textarea"
                        value={editDescription}
                        onChange={(e) =>
                          setEditDescription(
                            sanitizeContentDescriptionInput(e.target.value)
                          )
                        }
                        onBlur={(e) =>
                          setEditDescription(sanitizeContentDescription(e.target.value))
                        }
                        placeholder="Announcement description"
                        maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
                      />
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Category</label>
                      <div className="gl-chip-row">
                        {categories.map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={`gl-filter-chip ${editCategory === item ? "active" : ""}`}
                            onClick={() => setEditCategory(item)}
                          >
                            {formatStatusLabel(item)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Status</label>
                      <div className="gl-chip-row">
                        {["draft", "published", "archived"].map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={`gl-filter-chip gl-status-chip ${
                              editStatus === item ? "active" : ""
                            } ${normalize(item)}`}
                            onClick={() => setEditStatus(item)}
                          >
                            {formatStatusLabel(item)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Priority</label>
                      <div className="gl-chip-row">
                        {priorities.map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={`gl-filter-chip ${
                              editPriority === item ? "active" : ""
                            } ${getPriorityTone(item)}`}
                            onClick={() => setEditPriority(item)}
                          >
                            {formatStatusLabel(item)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Add New Images</label>
                      <label className="gl-upload-box">
                        <FaUpload />
                        <span>Select images</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={pickEditFile}
                          hidden
                        />
                      </label>

                      {editFiles.length > 0 ? (
                        <div className="gl-selected-files">
                          {editFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="gl-file-pill">
                              <FaImage />
                              <span>{file.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="gl-modal-field">
                      <label className="gl-modal-label">Current Images</label>
                      {currentAttachments.length > 0 ? (
                        <div className="gl-current-images">
                          {currentAttachments.map((img, index) => (
                            <div
                              key={`${img?.public_id || img?.fileUrl || index}`}
                              className="gl-current-image-card"
                            >
                              <button
                                type="button"
                                className="gl-current-image-button"
                                onClick={() =>
                                  openImagePreview(
                                    img?.fileUrl,
                                    img?.fileName || `Attachment ${index + 1}`
                                  )
                                }
                              >
                                <img
                                  src={img.fileUrl}
                                  alt={img.fileName || `Attachment ${index + 1}`}
                                  className="gl-current-image"
                                />
                              </button>

                              <button
                                type="button"
                                className="gl-btn gl-btn-danger gl-btn-small"
                                onClick={() => setRemoveImages((prev) => [...prev, img])}
                              >
                                <FaTrash />
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="gl-mini-empty">No images remaining.</div>
                      )}
                    </div>
                  </div>

                  <div className="gl-modal-actions gl-modal-actions-sticky">
                    <button
                      type="button"
                      className="gl-btn gl-btn-secondary"
                      onClick={closeEditModal}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="gl-btn gl-btn-primary"
                      onClick={updateAnnouncement}
                      disabled={submitting || Boolean(editContentError)}
                    >
                      <FaCheck />
                      {submitting ? "Saving..." : "Save Update"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {confirmState.open
          ? createPortal(
              <div className="gl-modal-backdrop gl-modal-backdrop-centered">
                <div className="gl-modal-card gl-confirm-card">
                  <h3>{confirmState.title}</h3>
                  <p>{confirmState.message}</p>

                  <div className="gl-modal-actions">
                    <button
                      type="button"
                      className="gl-btn gl-btn-secondary"
                      onClick={closeConfirm}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="gl-btn gl-btn-danger"
                      onClick={handleConfirmAction}
                      disabled={submitting}
                    >
                      <FaCheck />
                      {submitting ? "Processing..." : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {imagePreview.open
          ? createPortal(
              <div className="gl-image-overlay" onClick={closeImagePreview}>
                <div
                  className="gl-image-preview-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="gl-image-preview-close"
                    onClick={closeImagePreview}
                  >
                    <FaTimes />
                  </button>

                  <img
                    src={imagePreview.src}
                    alt={imagePreview.alt}
                    className="gl-image-preview"
                  />
                </div>
              </div>,
              document.body
            )
          : null}

        {typeof document !== "undefined"
          ? createPortal(
              <div className="notification-stack an-notification-stack">
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`notification-toast ${item.type}`}
                    onClick={() => removeNotification(item.id)}
                  >
                    <span className="notification-toast-icon">
                      {getNotificationIcon(item.type)}
                    </span>
                    <span className="notification-toast-text">{item.message}</span>
                  </button>
                ))}
              </div>,
              document.body
            )
          : null}
      </div>
    </DashboardShell>
  );
}
