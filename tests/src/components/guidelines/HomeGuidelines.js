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
  FaTimes,
  FaTrash,
  FaUndo,
  FaUpload
} from "react-icons/fa";
import DashboardShell from "../layout/DashboardShell";
import "../css/Guidelines.css";
import {
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_TITLE_LENGTH,
  sanitizeContentDescription,
  sanitizeContentDescriptionInput,
  sanitizeContentTitle,
  sanitizeContentTitleInput,
  validateContentFields
} from "../contentTextUtils";

const BASE_URL = process.env.REACT_APP_API_URL || "https://gaganadapat.onrender.com";
const GUIDELINES_URL = `${BASE_URL}/api/guidelines`;

const NOTIFICATION_DURATION = 10000;
const MAX_VISIBLE_NOTIFICATIONS = 4;

const buildNotification = (message, type = "info") => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  message,
  type
});

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "-";

const PRIORITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const STATUS_SORT_ORDER = {
  published: 0,
  draft: 1,
  archived: 2
};

const sortGuidelines = (items = [], sortBy = "published_first") => {
  const next = [...items];

  return next.sort((a, b) => {
    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    const aStatus = normalize(a?.status);
    const bStatus = normalize(b?.status);
    const aCategory = String(a?.category || "").toLowerCase();
    const bCategory = String(b?.category || "").toLowerCase();

    if (sortBy === "newest") {
      return bCreated - aCreated;
    }

    if (sortBy === "oldest") {
      return aCreated - bCreated;
    }

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

const EMPTY_MODAL = {
  open: false,
  title: "",
  message: "",
  action: "",
  guideline: null
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
      message: text || `Request failed with status ${response.status}`
    };
  }
};

export default function HomeGuidelines() {
  const [guidelines, setGuidelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("published_first");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState("draft");
  const [priorityLevel, setPriorityLevel] = useState("medium");
  const [files, setFiles] = useState([]);

  const [editingGuideline, setEditingGuideline] = useState(null);
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
    alt: ""
  });

  const [submitting, setSubmitting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [confirmState, setConfirmState] = useState(EMPTY_MODAL);

  const notificationTimeoutsRef = useRef({});

  useEffect(() => {
    const timeouts = notificationTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    const shouldLock =
      Boolean(editingGuideline) || Boolean(confirmState.open) || Boolean(imagePreview.open);

    const previousOverflow = document.body.style.overflow;

    if (shouldLock) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingGuideline, confirmState.open, imagePreview.open]);

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
      const next = [notification, ...prev];
      return next.slice(0, MAX_VISIBLE_NOTIFICATIONS);
    });

    notificationTimeoutsRef.current[notification.id] = setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
      delete notificationTimeoutsRef.current[notification.id];
    }, NOTIFICATION_DURATION);
  }, []);

  const categories = useMemo(
    () => ["earthquake", "flood", "typhoon", "general"],
    []
  );

  const priorities = useMemo(
    () => ["low", "medium", "high", "critical"],
    []
  );

  const activeStatuses = useMemo(() => ["draft", "published"], []);
  const createContentError = validateContentFields(title, description);
  const editContentError = validateContentFields(editTitle, editDescription);

  const fetchGuidelines = useCallback(async () => {
    try {
      setLoading(true);

      let url = GUIDELINES_URL;
      if (showArchived) {
        url += "?status=archived";
      }

      const response = await fetch(url, {
        credentials: "include"
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to load guidelines");
      }

      const next = Array.isArray(data) ? data : [];
      setGuidelines(next);
    } catch (error) {
      console.error(error);
      setGuidelines([]);
      pushNotification(error.message || "Failed to load guidelines.", "error");
    } finally {
      setLoading(false);
    }
  }, [pushNotification, showArchived]);

  useEffect(() => {
    fetchGuidelines();
  }, [fetchGuidelines]);

  const exportPublishedGuidelinesPdf = async () => {
    try {
      const pdfUrl = `${GUIDELINES_URL}/published/export-pdf`;
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      pushNotification("Opening published guidelines PDF...", "info");
    } catch (error) {
      console.error(error);
      pushNotification("Failed to open published guidelines PDF.", "error");
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
    setEditingGuideline(null);
    setEditTitle("");
    setEditDescription("");
    setEditCategory("general");
    setEditStatus("draft");
    setEditPriority("medium");
    setEditFiles([]);
    setRemoveImages([]);
  };

  const openEditModal = (item) => {
    setEditingGuideline(item);
    setEditTitle(sanitizeContentTitle(item?.title || ""));
    setEditDescription(sanitizeContentDescription(item?.description || ""));
    setEditCategory(item?.category || "general");
    setEditStatus(item?.status || "draft");
    setEditPriority(item?.priorityLevel || "medium");
    setEditFiles([]);
    setRemoveImages([]);
  };

  const openConfirm = (titleText, message, action, guideline) => {
    setConfirmState({
      open: true,
      title: titleText,
      message,
      action,
      guideline
    });
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirmState(EMPTY_MODAL);
  };

  const openImagePreview = (src, alt = "Guideline image") => {
    if (!src) return;
    setImagePreview({
      open: true,
      src,
      alt
    });
  };

  const closeImagePreview = () => {
    setImagePreview({
      open: false,
      src: "",
      alt: ""
    });
  };

  const pickFile = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
  };

  const pickEditFile = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    setEditFiles(selectedFiles);
  };

  const createGuideline = async () => {
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

      files.forEach((file) => {
        formData.append("attachments", file);
      });

      const response = await fetch(GUIDELINES_URL, {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to create guideline");
      }

      setGuidelines((prev) => [data, ...prev]);
      resetCreateForm();
      pushNotification("Guideline created successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to create guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const updateGuideline = async () => {
    if (!editingGuideline?._id) return;

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

        editFiles.forEach((file) => {
          formData.append("attachments", file);
        });

        response = await fetch(`${GUIDELINES_URL}/${editingGuideline._id}`, {
          method: "PUT",
          body: formData,
          credentials: "include"
        });
      } else {
        response = await fetch(`${GUIDELINES_URL}/${editingGuideline._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: cleanTitle,
            description: cleanDescription,
            category: editCategory,
            status: editStatus,
            priorityLevel: editPriority
          })
        });
      }

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to update guideline");
      }

      setGuidelines((prev) =>
        prev.map((item) => (item._id === editingGuideline._id ? data : item))
      );

      closeEditModal();
      pushNotification("Guideline updated successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to update guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const publishGuideline = async (id) => {
    try {
      setSubmitting(true);

      const response = await fetch(`${GUIDELINES_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "published" })
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to publish guideline");
      }

      setGuidelines((prev) =>
        prev.map((item) => (item._id === id ? data : item))
      );

      pushNotification("Guideline published successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to publish guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const makeDraft = async (id) => {
    try {
      setSubmitting(true);

      const response = await fetch(`${GUIDELINES_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "draft" })
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to move guideline to draft");
      }

      setGuidelines((prev) =>
        prev.map((item) => (item._id === id ? data : item))
      );

      pushNotification("Guideline moved to draft.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to change status.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const archiveGuideline = async (id) => {
    try {
      setSubmitting(true);

      let response = await fetch(`${GUIDELINES_URL}/soft-delete/${id}`, {
        method: "PATCH",
        credentials: "include"
      });

      if (!response.ok) {
        response = await fetch(`${GUIDELINES_URL}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "archived" })
        });
      }

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to archive guideline");
      }

      setGuidelines((prev) =>
        prev.map((item) => (item._id === id ? data : item))
      );

      closeConfirm();
      pushNotification("Guideline archived successfully.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to archive guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const restoreGuideline = async (id) => {
    try {
      setSubmitting(true);

      let response = await fetch(`${GUIDELINES_URL}/restore/${id}`, {
        method: "PATCH",
        credentials: "include"
      });

      if (!response.ok) {
        response = await fetch(`${GUIDELINES_URL}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "draft" })
        });
      }

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to restore guideline");
      }

      setGuidelines((prev) =>
        prev.map((item) => (item._id === id ? data : item))
      );

      closeConfirm();
      pushNotification("Guideline restored to draft.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to restore guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteArchived = async (id) => {
    try {
      setSubmitting(true);

      const response = await fetch(`${GUIDELINES_URL}/${id}`, {
        method: "DELETE",
        credentials: "include"
      });

      const data = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to delete guideline");
      }

      setGuidelines((prev) => prev.filter((item) => item._id !== id));

      closeConfirm();
      pushNotification("Guideline permanently deleted.", "success");
    } catch (error) {
      console.error(error);
      pushNotification(error.message || "Failed to delete guideline.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    const guideline = confirmState?.guideline;
    if (!guideline?._id) return;

    if (confirmState.action === "archive") {
      await archiveGuideline(guideline._id);
      return;
    }

    if (confirmState.action === "restore") {
      await restoreGuideline(guideline._id);
      return;
    }

    if (confirmState.action === "delete") {
      await deleteArchived(guideline._id);
    }
  };

  const visibleGuidelines = useMemo(() => {
    const next = guidelines.filter((item) =>
      showArchived
        ? normalize(item?.status) === "archived"
        : normalize(item?.status) !== "archived"
    );

    return sortGuidelines(next, sortBy);
  }, [guidelines, showArchived, sortBy]);

  const currentAttachments = useMemo(() => {
    return (
      editingGuideline?.attachments?.filter(
        (img) => !removeImages.some((removed) => removed.public_id === img.public_id)
      ) || []
    );
  }, [editingGuideline, removeImages]);

  const topTotals = useMemo(() => {
    return guidelines.reduce(
      (acc, item) => {
        acc.total += 1;

        const statusValue = normalize(item?.status);
        if (statusValue === "draft") acc.draft += 1;
        if (statusValue === "published") acc.published += 1;
        if (statusValue === "archived") acc.archived += 1;

        acc.views += Number(item?.views || 0);
        return acc;
      },
      {
        total: 0,
        draft: 0,
        published: 0,
        archived: 0,
        views: 0
      }
    );
  }, [guidelines]);

  const isCreateDisabled = Boolean(createContentError) || submitting;

  return (
    <DashboardShell>
      <div className="gl-page">
        <div className="gl-shell">
          <section className="gl-header-card">
            <div className="gl-header-head">
              <div className="gl-header-main">
                <h1 className="gl-header-title">Guidelines Management</h1>
              </div>

              <div className="gl-header-actions">
                <button
                  type="button"
                  className="gl-btn gl-btn-primary"
                  onClick={exportPublishedGuidelinesPdf}
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
            </div>

            <div className="gl-totals-row gl-totals-row-five">
              <div className="gl-total-card">
                <div className="gl-total-card-top">
                  <span>Total</span>
                  <span className="gl-total-icon">
                    <FaInbox />
                  </span>
                </div>
                <strong>{topTotals.total}</strong>
              </div>

              <div className="gl-total-card warning">
                <div className="gl-total-card-top">
                  <span>Draft</span>
                  <span className="gl-total-icon">
                    <FaEdit />
                  </span>
                </div>
                <strong>{topTotals.draft}</strong>
              </div>

              <div className="gl-total-card success">
                <div className="gl-total-card-top">
                  <span>Published</span>
                  <span className="gl-total-icon">
                    <FaCheck />
                  </span>
                </div>
                <strong>{topTotals.published}</strong>
              </div>

              <div className="gl-total-card info">
                <div className="gl-total-card-top">
                  <span>Views</span>
                  <span className="gl-total-icon">
                    <FaEye />
                  </span>
                </div>
                <strong>{topTotals.views}</strong>
              </div>

              <div className="gl-total-card danger">
                <div className="gl-total-card-top">
                  <span>Archived</span>
                  <span className="gl-total-icon">
                    <FaTrash />
                  </span>
                </div>
                <strong>{topTotals.archived}</strong>
              </div>
            </div>
          </section>

          <section className="gl-board gl-board-equal">
            <div className="gl-board-left">
              <section className="gl-card gl-form-card gl-form-card-fixed">
                <div className="gl-toolbar">
                  <div className="gl-toolbar-title">
                    <h2>Create Guideline</h2>
                  </div>
                </div>

                <div className="gl-form-grid">
                  <div className="gl-field">
                    <label>Title</label>
                    <input
                      className="gl-input"
                      placeholder="Enter guideline title"
                      value={title}
                      onChange={(e) =>
                        setTitle(sanitizeContentTitleInput(e.target.value))
                      }
                      onBlur={(e) => setTitle(sanitizeContentTitle(e.target.value))}
                      maxLength={MAX_CONTENT_TITLE_LENGTH}
                    />
                  </div>

                  <div className="gl-field">
                    <label>Description</label>
                    <textarea
                      className="gl-textarea"
                      placeholder="Write guideline details"
                      value={description}
                      onChange={(e) =>
                        setDescription(sanitizeContentDescriptionInput(e.target.value))
                      }
                      onBlur={(e) =>
                        setDescription(sanitizeContentDescription(e.target.value))
                      }
                      maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
                    />
                  </div>

                  <div className="gl-field">
                    <label>Category</label>
                    <div className="gl-chip-row">
                      {categories.map((item) => (
                        <button
                          type="button"
                          key={item}
                          className={`gl-filter-chip ${
                            category === item ? "active" : ""
                          }`}
                          onClick={() => setCategory(item)}
                        >
                          {formatStatusLabel(item)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="gl-field gl-two-col">
                    <div>
                      <label>Status</label>
                      <div className="gl-chip-row">
                        {activeStatuses.map((item) => (
                          <button
                            type="button"
                            key={item}
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

                    <div>
                      <label>Priority</label>
                      <div className="gl-chip-row">
                        {priorities.map((item) => (
                          <button
                            type="button"
                            key={item}
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
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={pickFile}
                        hidden
                      />
                    </label>

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
                      onClick={createGuideline}
                      disabled={isCreateDisabled}
                    >
                      <FaUpload />
                      {submitting ? "Saving..." : "Create Guideline"}
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
                      <h2>{showArchived ? "Archived Guidelines" : "All Guidelines"}</h2>
                    </div>

                    <div className="gl-list-toolbar-actions">
                      <div className="gl-sort-wrap">
                        <select
                          className="gl-input gl-sort-select"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                        >
                          <option value="published_first">Published First</option>
                          <option value="newest">Newest</option>
                          <option value="oldest">Oldest</option>
                          <option value="draft_first">Draft First</option>
                          <option value="category">Category A–Z</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        className="gl-btn gl-btn-secondary gl-toolbar-toggle-btn"
                        onClick={() => setShowArchived((prev) => !prev)}
                      >
                        <FaUndo />
                        {showArchived ? "Show Active" : "Show Archived"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="gl-list-wrap gl-list-scroll">
                  {loading ? (
                    <div className="gl-empty-state">Loading guidelines...</div>
                  ) : visibleGuidelines.length === 0 ? (
                    <div className="gl-empty-state">
                      {showArchived
                        ? "No archived guidelines found."
                        : "No guidelines found."}
                    </div>
                  ) : (
                    <div className="gl-list-grid">
                      {visibleGuidelines.map((item) => {
                        const statusTone = getStatusTone(item?.status);
                        const priorityTone = getPriorityTone(item?.priorityLevel);

                        return (
                          <article
                            key={item._id}
                            className={`gl-item-card gl-item-${statusTone}`}
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
                                </div>
                              </div>

                              <div className="gl-item-views">
                                <FaEye />
                                <strong>{Number(item?.views || 0)}</strong>
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
                                          onClick={() => publishGuideline(item._id)}
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
                                            "Archive guideline?",
                                            `This will move "${item.title || "this guideline"}" to archived status.`,
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
                                            "Restore guideline?",
                                            `This will restore "${item.title || "this guideline"}" back to draft.`,
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
                                            `This will permanently remove "${item.title || "this guideline"}" and its uploaded images.`,
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
                                        item.attachments?.[0]?.fileName || "Guideline image"
                                      )
                                    }
                                  >
                                    <img
                                      src={item.attachments?.[0]?.fileUrl}
                                      alt={item.attachments?.[0]?.fileName || "Guideline image"}
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

        {editingGuideline
          ? createPortal(
              <div className="gl-modal-backdrop gl-modal-backdrop-centered">
                <div className="gl-modal-card gl-modal-card-fixed">
                  <h3>Update Guideline</h3>
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
                        placeholder="Guideline title"
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
                        placeholder="Guideline description"
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
                            className={`gl-filter-chip ${
                              editCategory === item ? "active" : ""
                            }`}
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
                                onClick={() =>
                                  setRemoveImages((prev) => [...prev, img])
                                }
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
                      onClick={updateGuideline}
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
              <div className="notification-stack">
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
