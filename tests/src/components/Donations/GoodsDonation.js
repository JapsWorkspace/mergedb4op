import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaBell,
  FaCheck,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaInbox,
  FaTimes,
  FaUndo,
} from "react-icons/fa";
import DashboardShell from "../layout/DashboardShell";
import "../css/ReliefRequestList.css";
import "../css/DonationValidationQueue.css";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;

const NOTIFICATION_DURATION = 10000;
const MAX_VISIBLE_NOTIFICATIONS = 4;

const normalize = (value) => String(value || "").trim().toLowerCase();
const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "-";

const formatDate = (date) => {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return "-";
  }
};

const formatTime = (date) => {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const formatDateTime = (date) => {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const buildNotification = (message, type = "info") => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  message,
  type,
});

const getNotificationIcon = (type) => {
  if (type === "success") return <FaCheck />;
  if (type === "error") return <FaTimes />;
  if (type === "warning") return <FaExclamationTriangle />;
  return <FaBell />;
};

const getDonationTypeLabel = (donation) => {
  const type = normalize(donation?.inventoryType || donation?.donationType);
  if (type === "monetary") return "Monetary";
  if (type === "appliance") return "Appliance";
  return "Goods";
};

const getDonationTitle = (donation) => {
  const type = normalize(donation?.inventoryType || donation?.donationType);
  if (type === "monetary") return "Monetary Donation";
  return donation?.itemName || "Donation Item";
};

const getDonationRef = (donation) => {
  if (donation?.referenceNumber) return donation.referenceNumber;
  const id = String(donation?._id || "").slice(-8).toUpperCase();
  return id ? `DN-${id}` : "-";
};

const getStatusTone = (status) => {
  const normalized = normalize(status);
  if (normalized === "received") return "received";
  if (normalized === "not_received") return "pending";
  return "pending";
};

const getQueueClass = (status) => {
  const normalized = normalize(status);
  if (normalized === "received") return "rrl-queue-received";
  if (normalized === "not_received") return "dqv-queue-not-received";
  if (normalized === "resubmitted") return "dqv-queue-resubmitted";
  return "dqv-queue-pending";
};

const getStatusOrder = (status) => {
  const normalized = normalize(status);
  if (normalized === "resubmitted") return 0;
  if (normalized === "pending") return 1;
  if (normalized === "received") return 2;
  if (normalized === "not_received") return 3;
  return 99;
};

const sortQueue = (items = []) =>
  [...items].sort((a, b) => {
    const statusDiff = getStatusOrder(a?.status) - getStatusOrder(b?.status);
    if (statusDiff !== 0) return statusDiff;

    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });

const EMPTY_CONFIRM_STATE = {
  open: false,
  title: "",
  message: "",
  action: "",
  donation: null,
};

export default function DonationValidationQueue() {
  const [rows, setRows] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [donationDetails, setDonationDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [queueFilter, setQueueFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [confirmState, setConfirmState] = useState(EMPTY_CONFIRM_STATE);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [queueCardHeight, setQueueCardHeight] = useState(null);
  const notificationTimeoutsRef = useRef({});
  const recentNotificationRef = useRef({});
  const lastSelectedDonationRef = useRef(null);
  const queueCardRef = useRef(null);
  const detailsCardRef = useRef(null);
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    const timeouts = notificationTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
    };
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    if (notificationTimeoutsRef.current[id]) {
      clearTimeout(notificationTimeoutsRef.current[id]);
      delete notificationTimeoutsRef.current[id];
    }
  }, []);

  const pushNotification = useCallback((message, type = "info") => {
    const normalizedMessage = String(message || "").trim();
    const dedupeKey = `${type}:${normalizedMessage}`;
    const now = Date.now();
    const lastShownAt = Number(recentNotificationRef.current[dedupeKey] || 0);

    if (normalizedMessage && now - lastShownAt < 2500) {
      return;
    }

    recentNotificationRef.current[dedupeKey] = now;
    const notification = buildNotification(message, type);

    setNotifications((prev) => {
      const next = [notification, ...prev];
      return next.slice(0, MAX_VISIBLE_NOTIFICATIONS);
    });

    notificationTimeoutsRef.current[notification.id] = setTimeout(() => {
      setNotifications((prev) =>
        prev.filter((item) => item.id !== notification.id)
      );
      delete notificationTimeoutsRef.current[notification.id];
    }, NOTIFICATION_DURATION);
  }, []);

  const fetchQueue = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoadingQueue(true);

        const response = await fetch(`${BASE_URL}/api/donations?limit=300`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch donation queue.");
        }

        const data = await response.json();
        const nextRows = sortQueue(Array.isArray(data) ? data : []);
        setRows(nextRows);

        setSelectedDonation((prev) => {
          if (!nextRows.length) return null;
          if (!prev?._id) return nextRows[0];
          return nextRows.find((item) => item._id === prev._id) || nextRows[0];
        });
      } catch (error) {
        console.error(error);
        if (!silent) {
          setRows([]);
          setSelectedDonation(null);
          setDonationDetails(null);
          pushNotification(
            error.message || "Failed to load donation queue.",
            "error"
          );
        }
      } finally {
        if (!silent) setLoadingQueue(false);
      }
    },
    [pushNotification]
  );

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(() => fetchQueue({ silent: true }), 10000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const filteredRows = useMemo(() => {
    let next = [...rows];

    if (queueFilter === "active") {
      next = next.filter((row) =>
        ["pending", "resubmitted"].includes(normalize(row?.status))
      );
    } else {
      next = next.filter((row) => normalize(row?.status) === queueFilter);
    }

    if (typeFilter) {
      next = next.filter(
        (row) => normalize(row?.inventoryType || row?.donationType) === typeFilter
      );
    }

    return sortQueue(next);
  }, [rows, queueFilter, typeFilter]);

  useEffect(() => {
    setSelectedDonation((prev) => {
      if (!filteredRows.length) return null;
      if (!prev?._id) return filteredRows[0];
      return filteredRows.find((item) => item._id === prev._id) || filteredRows[0];
    });
  }, [filteredRows]);

  useEffect(() => {
    const loadDonationDetails = async () => {
      if (!selectedDonation?._id) {
        setDonationDetails(null);
        lastSelectedDonationRef.current = null;
        return;
      }

      if (lastSelectedDonationRef.current === selectedDonation._id) return;
      lastSelectedDonationRef.current = selectedDonation._id;

      try {
        setLoadingDetails(true);
        const response = await fetch(
          `${BASE_URL}/api/donations/${selectedDonation._id}`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load donation details.");
        }

        const data = await response.json();
        setDonationDetails(data);
      } catch (error) {
        console.error(error);
        setDonationDetails(null);
        pushNotification(
          error.message || "Failed to load donation details.",
          "error"
        );
      } finally {
        setLoadingDetails(false);
      }
    };

    loadDonationDetails();
  }, [selectedDonation, pushNotification]);

  const displayedDonation = donationDetails || selectedDonation;

  const topTotals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const status = normalize(row?.status);
        const type = normalize(row?.inventoryType || row?.donationType);
        acc.total += 1;
        if (status === "pending") acc.pending += 1;
        if (status === "resubmitted") acc.resubmitted += 1;
        if (status === "received") acc.received += 1;
        if (status === "not_received") acc.notReceived += 1;
        if (type === "monetary") acc.monetary += Number(row?.amount || 0);
        return acc;
      },
      {
        total: 0,
        pending: 0,
        resubmitted: 0,
        received: 0,
        notReceived: 0,
        monetary: 0,
      }
    );
  }, [rows]);

  const openConfirmation = useCallback((action, donation) => {
    if (!donation?._id) return;

    const isReceive = action === "received";
    setConfirmState({
      open: true,
      title: isReceive ? "Mark donation as received?" : "Mark donation as not received?",
      message: isReceive
        ? "This will confirm the donation was physically received and automatically move it into inventory."
        : "This will mark the donation as not received so the donor can resubmit the same donation later.",
      action,
      donation,
    });
  }, []);

  const closeConfirmation = useCallback(() => {
    if (submittingAction) return;
    setConfirmState(EMPTY_CONFIRM_STATE);
  }, [submittingAction]);

  const submitDecision = useCallback(async () => {
    if (!confirmState.donation?._id || !confirmState.action) return;

    try {
      setSubmittingAction(true);
      const response = await fetch(
        `${BASE_URL}/api/donations/${confirmState.donation._id}/status`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: confirmState.action,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to update donation status.");
      }

      pushNotification(
        confirmState.action === "received"
          ? "Donation marked as received and moved to inventory."
          : "Donation marked as not received.",
        "success"
      );

      setConfirmState(EMPTY_CONFIRM_STATE);
      lastSelectedDonationRef.current = null;
      await fetchQueue({ silent: true }).catch((refreshError) => {
        // The status update has already succeeded. A transient refresh failure
        // must not be reported as a failed decision or encourage a duplicate retry.
        console.error("Failed to refresh donation queue after status update:", refreshError);
      });
    } catch (error) {
      console.error(error);
      pushNotification(
        error.message || "Failed to update donation status.",
        "error"
      );
    } finally {
      setSubmittingAction(false);
    }
  }, [confirmState, fetchQueue, pushNotification]);

  const canMarkReceived =
    displayedDonation &&
    ["pending", "resubmitted"].includes(normalize(displayedDonation.status));

  const canMarkNotReceived = canMarkReceived;

  const selectedTone = getStatusTone(displayedDonation?.status);
  const selectedType = normalize(
    displayedDonation?.inventoryType || displayedDonation?.donationType
  );
  const selectedPhotos = Array.isArray(displayedDonation?.photos)
    ? displayedDonation.photos
    : [];

  useLayoutEffect(() => {
    if (!detailsCardRef.current) return undefined;

    const updateHeights = () => {
      const nextHeight = detailsCardRef.current?.offsetHeight || 0;
      setQueueCardHeight(nextHeight > 0 ? nextHeight : null);
    };

    updateHeights();

    const observer = new ResizeObserver(() => {
      updateHeights();
    });

    observer.observe(detailsCardRef.current);
    window.addEventListener("resize", updateHeights);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeights);
    };
  }, [displayedDonation, loadingDetails, filteredRows.length]);

  return (
    <DashboardShell>
      <div className="rrl-page dqv-page">
        <div className="rrl-shell">
          <section className="rrl-header-card">
            <div className="rrl-header-head">
              <div className="rrl-header-main">
                <span className="rrl-kicker">Donation Validation</span>
                <h1 className="rrl-header-title">Review mobile donations before inventory intake</h1>
              </div>
            </div>

            <div className="rrl-totals-row">
              <div className="rrl-total-card">
                <div className="rrl-total-card-top">
                  <span>Total Queue</span>
                  <span className="rrl-total-icon"><FaInbox /></span>
                </div>
                <strong>{topTotals.total}</strong>
              </div>
              <div className="rrl-total-card pending">
                <div className="rrl-total-card-top">
                  <span>Pending Review</span>
                  <span className="rrl-total-icon"><FaExclamationTriangle /></span>
                </div>
                <strong>{topTotals.pending}</strong>
              </div>
              <div className="rrl-total-card warning">
                <div className="rrl-total-card-top">
                  <span>Resubmitted</span>
                  <span className="rrl-total-icon"><FaUndo /></span>
                </div>
                <strong>{topTotals.resubmitted}</strong>
              </div>
              <div className="rrl-total-card success">
                <div className="rrl-total-card-top">
                  <span>Received</span>
                  <span className="rrl-total-icon"><FaCheck /></span>
                </div>
                <strong>{topTotals.received}</strong>
              </div>
            </div>
          </section>

          <section className="rrl-board">
            <div className="rrl-board-left">
              <section
                ref={queueCardRef}
                className="rrl-card rrl-queue-card"
                style={
                  queueCardHeight
                    ? {
                        height: `${queueCardHeight}px`,
                        minHeight: `${queueCardHeight}px`,
                        maxHeight: `${queueCardHeight}px`,
                      }
                    : undefined
                }
              >
                <div className="rrl-toolbar">
                  <div className="rrl-toolbar-top">
                    <div className="rrl-toolbar-title">
                      <h2>
                        {queueFilter === "active"
                          ? "Active Queue"
                          : queueFilter === "received"
                          ? "Received Donations"
                          : queueFilter === "not_received"
                          ? "Did Not Receive"
                          : "Pending Review"}
                      </h2>
                    </div>
                  </div>

                  <div className="rrl-toolbar-controls">
                    <div className="rrl-control">
                      <label>Status</label>
                      <select
                        className="rrl-select"
                        value={queueFilter}
                        onChange={(e) => setQueueFilter(e.target.value)}
                      >
                        <option value="active">Active Queue</option>
                        <option value="pending">Pending Review</option>
                        <option value="received">Received</option>
                        <option value="not_received">Did Not Receive</option>
                      </select>
                    </div>

                    <div className="rrl-control">
                      <label>Donation Type</label>
                      <select
                        className="rrl-select"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                      >
                        <option value="">All donation types</option>
                        <option value="goods">Goods</option>
                        <option value="monetary">Monetary</option>
                        <option value="appliance">Appliance</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="rrl-queue-list-wrap">
                  <div className="rrl-queue-list">
                    {loadingQueue ? (
                      <div className="rrl-empty-state">Loading donation queue...</div>
                    ) : filteredRows.length === 0 ? (
                      <div className="rrl-empty-state">
                        No donation records match the current filters.
                      </div>
                    ) : (
                      filteredRows.map((row) => {
                        const isActive = selectedDonation?._id === row._id;
                        const toneClass = getQueueClass(row?.status);
                        const donationTypeLabel = getDonationTypeLabel(row);
                        const donatedValue =
                          normalize(row?.inventoryType || row?.donationType) ===
                          "monetary"
                            ? `PHP ${formatMoney(row?.amount || 0)}`
                            : `${Number(row?.quantity || 0).toLocaleString()} item(s)`;
                        const submittedAt = row?.updatedAt || row?.createdAt;

                        return (
                          <button
                            key={row._id}
                            type="button"
                            className={`rrl-queue-item ${isActive ? "active" : ""} ${toneClass}`}
                            onClick={() => {
                              setSelectedDonation(row);
                              setDonationDetails(null);
                              lastSelectedDonationRef.current = null;
                            }}
                          >
                            <div className="rrl-queue-top">
                              <div className="rrl-queue-main">
                                <div className="rrl-queue-barangay">
                                  {row.donorName || "Unknown donor"}
                                </div>
                                <div className="rrl-queue-disaster">
                                  {getDonationTitle(row)}
                                </div>
                                <div className="rrl-queue-requestno-wrap">
                                  <div className="rrl-queue-requestno">
                                    {getDonationRef(row)}
                                  </div>
                                  {normalize(row?.status) === "resubmitted" ? (
                                    <span className="rrl-edited-badge">
                                      <FaUndo />
                                      Resubmitted
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="rrl-queue-bottom">
                              <div className="rrl-queue-inline-meta">
                                <span>{donationTypeLabel}</span>
                                <span>{donatedValue}</span>
                                <span>
                                  {row?.category
                                    ? row.category
                                    : row?.sourceType || "External"}
                                </span>
                              </div>

                              <div className="rrl-queue-datetime">
                                <strong>{formatDate(submittedAt)}</strong>
                                <span>{formatTime(submittedAt)}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="rrl-board-right">
              {!displayedDonation ? (
                <section className="rrl-card rrl-placeholder-card">
                  <div className="rrl-placeholder-inner">
                    <h2>No selected donation</h2>
                  </div>
                </section>
              ) : (
                <section
                  ref={detailsCardRef}
                  className="rrl-card rrl-details-card rrl-details-card-compact"
                >
                  <div className="rrl-details-head rrl-details-head-compact">
                    <div className="rrl-details-heading">
                      <div className="rrl-details-barangay">
                        {displayedDonation.donorName || "-"}
                      </div>
                      <div className="rrl-details-disaster">
                        {getDonationTitle(displayedDonation)}
                      </div>
                      <div className="rrl-details-requestno">
                        {getDonationRef(displayedDonation)}
                      </div>
                    </div>

                    <div className={`rrl-status-banner rrl-status-banner-${selectedTone}`}>
                      {formatStatusLabel(displayedDonation.status)}
                    </div>
                  </div>

                  <div className="rrl-meta-strip">
                    <div className="rrl-meta-chip">
                      <span>Donation Type</span>
                      <strong>{getDonationTypeLabel(displayedDonation)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Source Type</span>
                      <strong>{formatStatusLabel(displayedDonation.sourceType)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Submitted</span>
                      <strong>{formatDateTime(displayedDonation.createdAt)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Barangay</span>
                      <strong>{displayedDonation.barangay || "-"}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Fulfillment</span>
                      <strong>{formatStatusLabel(displayedDonation.fulfillmentMethod || "drop_off")}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Location</span>
                      <strong>{displayedDonation.location || "-"}</strong>
                    </div>
                  </div>

                  <div className="rrl-request-focus-layout">
                    <div className="rrl-balance-strip rrl-balance-strip-request-only">
                      <div className="rrl-balance-chip rrl-balance-chip-primary rrl-balance-chip-request">
                        <span>
                          {selectedType === "monetary" ? "Amount" : "Quantity"}
                        </span>
                        <strong>
                          {selectedType === "monetary"
                            ? `PHP ${formatMoney(displayedDonation.amount || 0)}`
                            : Number(displayedDonation.quantity || 0).toLocaleString()}
                        </strong>
                      </div>
                      <div className="rrl-balance-chip rrl-balance-chip-request">
                        <span>
                          {selectedType === "monetary" ? "Reference Number" : "Category"}
                        </span>
                        <strong className="dqv-balance-secondary">
                          {selectedType === "monetary"
                            ? displayedDonation.referenceNumber || "-"
                            : displayedDonation.category || "-"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="rrl-review-layout-focused">
                    <div className="rrl-review-main">
                      <div className="rrl-panel">
                        <div className="rrl-section-head">
                          <h3>Donation Snapshot</h3>
                        </div>

                        <div className="dqv-detail-grid">
                          {selectedType !== "monetary" ? (
                            <>
                              <div className="dqv-detail-card">
                                <span>Item Name</span>
                                <strong>{displayedDonation.itemName || "-"}</strong>
                              </div>
                              <div className="dqv-detail-card">
                                <span>Category</span>
                                <strong>{displayedDonation.category || "-"}</strong>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="dqv-detail-card">
                                <span>Donor</span>
                                <strong>{displayedDonation.donorName || "-"}</strong>
                              </div>
                              <div className="dqv-detail-card">
                                <span>Reference Number</span>
                                <strong>{displayedDonation.referenceNumber || "-"}</strong>
                              </div>
                            </>
                          )}

                          {selectedType === "goods" ? (
                            <>
                              <div className="dqv-detail-card">
                                <span>Unit</span>
                                <strong>{displayedDonation.unit || "-"}</strong>
                              </div>
                              <div className="dqv-detail-card">
                                <span>Expiration</span>
                                <strong>
                                  {displayedDonation.expirationDate
                                    ? formatDate(displayedDonation.expirationDate)
                                    : "No expiry"}
                                </strong>
                              </div>
                            </>
                          ) : null}

                          {selectedType === "appliance" ? (
                            <>
                              <div className="dqv-detail-card">
                                <span>Condition</span>
                                <strong>
                                  {formatStatusLabel(displayedDonation.condition)}
                                </strong>
                              </div>
                              <div className="dqv-detail-card">
                                <span>Usage Duration</span>
                                <strong>{displayedDonation.usageDuration || "-"}</strong>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="rrl-panel">
                        <div className="rrl-section-head">
                          <h3>Proof Files</h3>
                        </div>

                        {loadingDetails ? (
                          <div className="rrl-mini-empty">Loading proof files...</div>
                        ) : selectedPhotos.length === 0 ? (
                          <div className="rrl-mini-empty">No proof files uploaded.</div>
                        ) : (
                          <div className="dqv-proof-grid">
                            {selectedPhotos.map((photo, index) => (
                              <button
                                key={`${photo?.fileUrl || photo?.fileName || "photo"}-${index}`}
                                type="button"
                                className="dqv-proof-card"
                                onClick={() =>
                                  setPreviewImage({
                                    url: photo?.fileUrl || "",
                                    name: photo?.fileName || `Donation proof ${index + 1}`,
                                  })
                                }
                              >
                                {photo?.fileUrl ? (
                                  <img
                                    src={photo.fileUrl}
                                    alt={photo.fileName || `Donation proof ${index + 1}`}
                                  />
                                ) : (
                                  <div className="dqv-proof-empty">No preview</div>
                                )}
                                <span>{photo?.fileName || `Proof ${index + 1}`}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rrl-panel rrl-remarks-panel">
                        <div className="rrl-section-head">
                          <h3>Remarks</h3>
                        </div>
                        <div className="rrl-remarks-box">
                          <p>{displayedDonation.description || "No remarks provided."}</p>
                        </div>
                      </div>

                    </div>

                    <div className="rrl-review-side">
                      <div className="rrl-panel rrl-decision-panel">
                        <div className="rrl-section-head">
                          <h3>Decision Panel</h3>
                        </div>

                        <div className="rrl-readiness-compact">
                          <div className="rrl-readiness-compact-row">
                            <span>Donor Name</span>
                            <strong>{displayedDonation.donorName || "-"}</strong>
                          </div>
                          <div className="rrl-readiness-compact-row">
                            <span>Phone</span>
                            <strong>{displayedDonation.donorPhone || "-"}</strong>
                          </div>
                          <div className="rrl-readiness-compact-row">
                            <span>Email</span>
                            <strong>{displayedDonation.donorEmail || "-"}</strong>
                          </div>
                        </div>

                        <div className="rrl-decision-actions">
                          {canMarkNotReceived ? (
                            <button
                              type="button"
                              className="rrl-btn rrl-btn-danger"
                              disabled={submittingAction}
                              onClick={() => openConfirmation("not_received", displayedDonation)}
                            >
                              <FaTimes />
                              Did Not Receive
                            </button>
                          ) : null}

                          {canMarkReceived ? (
                            <button
                              type="button"
                              className="rrl-btn rrl-btn-approve"
                              disabled={submittingAction}
                              onClick={() => openConfirmation("received", displayedDonation)}
                            >
                              <FaCheck />
                              Mark Received
                            </button>
                          ) : null}

                          {!canMarkReceived && !canMarkNotReceived ? (
                            <div className="rrl-mini-empty">
                              This donation has already been reviewed.
                            </div>
                          ) : null}
                        </div>

                        {selectedPhotos.length > 0 ? (
                          <div className="rrl-pdf-inline">
                            <a
                              className="rrl-btn rrl-btn-secondary"
                              href={selectedPhotos[0]?.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FaExternalLinkAlt />
                              Open First Proof
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>

        {portalRoot && confirmState.open
          ? createPortal(
              <div className="rrl-modal-backdrop dqv-modal-backdrop">
                <div className="rrl-modal-card dqv-modal-card">
                  <h3>{confirmState.title}</h3>
                  <p>{confirmState.message}</p>
                  <div className="rrl-modal-actions">
                    <button
                      type="button"
                      className="rrl-btn rrl-btn-secondary"
                      onClick={closeConfirmation}
                      disabled={submittingAction}
                    >
                      <FaUndo />
                      Go Back
                    </button>
                    <button
                      type="button"
                      className={`rrl-btn ${
                        confirmState.action === "received"
                          ? "rrl-btn-approve"
                          : "rrl-btn-danger"
                      }`}
                      onClick={submitDecision}
                      disabled={submittingAction}
                    >
                      {confirmState.action === "received" ? <FaCheck /> : <FaTimes />}
                      {submittingAction ? "Processing..." : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>,
              portalRoot
            )
          : null}

        {portalRoot && previewImage?.url
          ? createPortal(
              <div
                className="dqv-image-modal"
                onClick={() => setPreviewImage(null)}
              >
                <div
                  className="dqv-image-modal-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="dqv-image-modal-close"
                    onClick={() => setPreviewImage(null)}
                  >
                    <FaTimes />
                  </button>
                  <img src={previewImage.url} alt={previewImage.name || "Donation proof"} />
                </div>
              </div>,
              portalRoot
            )
          : null}

        {portalRoot
          ? createPortal(
              <div className="notification-stack dqv-notification-stack">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notification-toast ${notification.type}`}
                    onClick={() => removeNotification(notification.id)}
                  >
                    <span className="notification-icon">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <span className="notification-text">{notification.message}</span>
                  </button>
                ))}
              </div>,
              portalRoot
            )
          : null}
      </div>
    </DashboardShell>
  );
}
