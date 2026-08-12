import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  FaBell,
  FaCheck,
  FaClipboardCheck,
  FaClock,
  FaDownload,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaInbox,
  FaTimes,
  FaTruckLoading,
  FaUndo
} from 'react-icons/fa';
import DashboardShell from '../layout/DashboardShell';
import '../css/ReliefRequestList.css';
import {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  getSupportTypesFromRequest,
  getSupportTypeLabel,
  hasSupportType,
} from './supportTypes';
import {
  getRequestEditBadgeLabel,
  getVisibleCenterCount,
  getVisibleRowTotals,
  getVisibleRows,
} from './requestListUtils';
import {
  buildProofFileHref,
  buildProofFileHrefCandidates,
} from '../Donations/proofFileUtils';
import { isConfirmationSubmitDisabled } from './requestReviewUtils';
import * as dafacDistributionUtils from './dafacDistributionUtils';
import {
  getReliefBasePathForRole,
  getReliefReviewerLabel,
  normalizeRole,
} from '../auth/roleAccessUtils';

const BASE_URL = process.env.REACT_APP_API_URL || "https://gaganadapat.onrender.com";

const NOTIFICATION_DURATION = 10000;
const MAX_VISIBLE_NOTIFICATIONS = 4;

const normalize = (value) => String(value || '').trim().toLowerCase();
const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

const formatStatusLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase()) || '-';

const isResolvedStatus = (status) => {
  const normalized = normalize(status);
  return (
    normalized === 'received' ||
    normalized === 'completed' ||
    normalized === 'cancelled' ||
    normalized === 'canceled' ||
    normalized === 'rejected'
  );
};

const getRequestIndividuals = (request) => {
  const totals =
    Array.isArray(request?.rows) && request.rows.length > 0
      ? getVisibleRowTotals(request)
      : request?.totals || {};
  return (
    Number(totals.male || 0) +
    Number(totals.female || 0) +
    Number(totals.lgbtq || 0) +
    Number(totals.pwd || 0) +
    Number(totals.pregnant || 0) +
    Number(totals.senior || 0)
  );
};

const getRequestSupportTypes = (request) => getSupportTypesFromRequest(request);

const getRequestTypeLabel = (request) =>
  getSupportTypeLabel(getRequestSupportTypes(request));

const buildQueueDemandSummary = (request) => {
  const supportTypes = getRequestSupportTypes(request);
  const visibleRowTotals = getVisibleRowTotals(request);
  const requestedFoodPacks =
    visibleRowTotals.requestedFoodPacks || Number(request?.totals?.requestedFoodPacks || 0);
  const parts = [];

  if (hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS)) {
    parts.push(`${requestedFoodPacks.toLocaleString()} packs`);
  }

  if (hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY)) {
    parts.push(`PHP ${formatMoney(request?.totals?.requestedMonetaryAmount || 0)}`);
  }

  if (hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)) {
    const applianceCount = getRequestedApplianceQuantity(request);
    parts.push(
      `${applianceCount.toLocaleString()} appliance${applianceCount === 1 ? '' : 's'}`
    );
  }

  return parts.join(' | ');
};

const getRequestedApplianceQuantity = (request) => {
  if (request?.totals?.requestedApplianceQuantity !== undefined) {
    return Number(request?.totals?.requestedApplianceQuantity || 0);
  }

  return Array.isArray(request?.requestedAppliances)
    ? request.requestedAppliances.reduce(
        (sum, item) => sum + Number(item?.quantityRequested || 0),
        0
      )
    : 0;
};

const getRequestedApplianceCount = (request) =>
  Array.isArray(request?.requestedAppliances) ? request.requestedAppliances.length : 0;

const getRequestSyncKey = (request) =>
  [
    request?._id || '',
    request?.updatedAt || '',
    request?.lastEditedAt || '',
    request?.editCount || 0,
    getVisibleRowTotals(request).requestedFoodPacks || request?.totals?.requestedFoodPacks || 0,
    request?.totals?.requestedMonetaryAmount || 0,
    request?.totals?.requestedApplianceQuantity || getRequestedApplianceQuantity(request),
    getVisibleCenterCount(request),
    getRequestSupportTypes(request).join(','),
    normalize(request?.status)
  ].join('|');

const getFlowTone = (request) => {
  const status = normalize(request?.status);
  const currentStage = normalize(request?.currentStage);



  if (currentStage === 'accomplished') return 'received';

  if (status === 'pending') return 'pending';
  if (status === 'approved') return 'approved';
  if (status === 'partially_released') return 'released';
  if (status === 'released') return 'released';
  if (status === 'received') return 'received';
  return 'default';
};

const getStatusOrder = (status) => {
  const normalized = normalize(status);

  if (normalized === 'pending') return 0;
  if (normalized === 'approved') return 1;
  if (normalized === 'partially_released') return 2;
  if (normalized === 'released') return 3;
  if (normalized === 'received') return 4;
  return 99;
};

const getDisplayedStatusLabel = (request) => {
  if (normalize(request?.currentStage) === 'accomplished') {
    return 'Accomplished';
  }

  return formatStatusLabel(request?.status);
};







const sortOperationalQueue = (items = []) =>
  [...items].sort((a, b) => {
    const statusDiff = getStatusOrder(a?.status) - getStatusOrder(b?.status);
    if (statusDiff !== 0) return statusDiff;

    const aTime = new Date(a?.requestDate || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.requestDate || b?.createdAt || 0).getTime();
    return aTime - bTime;
  });

const getStickyReceivedRequests = (activeItems = [], receivedItems = []) => {
  const activeByBarangay = new Set(
    (Array.isArray(activeItems) ? activeItems : [])
      .map((item) => String(item?.barangayName || '').trim())
      .filter(Boolean)
  );

  const latestReceivedByBarangay = new Map();

  (Array.isArray(receivedItems) ? receivedItems : []).forEach((item) => {
    const barangayName = String(item?.barangayName || '').trim();
    if (!barangayName || activeByBarangay.has(barangayName)) return;

    const existing = latestReceivedByBarangay.get(barangayName);
    const itemTime = new Date(
      item?.receivedAt || item?.updatedAt || item?.requestDate || item?.createdAt || 0
    ).getTime();
    const existingTime = new Date(
      existing?.receivedAt ||
        existing?.updatedAt ||
        existing?.requestDate ||
        existing?.createdAt ||
        0
    ).getTime();

    if (!existing || itemTime >= existingTime) {
      latestReceivedByBarangay.set(barangayName, item);
    }
  });

  return Array.from(latestReceivedByBarangay.values());
};

const areQueuesEquivalent = (prevRows = [], nextRows = []) => {
  if (prevRows.length !== nextRows.length) return false;

  for (let i = 0; i < prevRows.length; i += 1) {
    const prev = prevRows[i];
    const next = nextRows[i];

    if ((prev?._id || '') !== (next?._id || '')) return false;
    if (normalize(prev?.status) !== normalize(next?.status)) return false;

    const prevRequested = getVisibleRowTotals(prev).requestedFoodPacks;
    const nextRequested = getVisibleRowTotals(next).requestedFoodPacks;
    if (prevRequested !== nextRequested) return false;

    if (getVisibleCenterCount(prev) !== getVisibleCenterCount(next)) return false;

    const prevMonetary = Number(prev?.totals?.requestedMonetaryAmount || 0);
    const nextMonetary = Number(next?.totals?.requestedMonetaryAmount || 0);
    if (prevMonetary !== nextMonetary) return false;

    const prevAppliances = getRequestedApplianceQuantity(prev);
    const nextAppliances = getRequestedApplianceQuantity(next);
    if (prevAppliances !== nextAppliances) return false;

    if (getRequestSupportTypes(prev).join(',') !== getRequestSupportTypes(next).join(',')) {
      return false;
    }

    const prevEdited = Boolean(prev?.isEditedAfterSubmit);
    const nextEdited = Boolean(next?.isEditedAfterSubmit);
    if (prevEdited !== nextEdited) return false;

    const prevEditCount = Number(prev?.editCount || 0);
    const nextEditCount = Number(next?.editCount || 0);
    if (prevEditCount !== nextEditCount) return false;

    const prevLastEditedAt = prev?.lastEditedAt || '';
    const nextLastEditedAt = next?.lastEditedAt || '';
    if (prevLastEditedAt !== nextLastEditedAt) return false;
  }

  return true;
};

const buildNotification = (message, type = 'info') => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  message,
  type
});

const getNotificationIcon = (type) => {
  if (type === 'success') return <FaCheck />;
  if (type === 'error') return <FaTimes />;
  if (type === 'warning') return <FaExclamationTriangle />;
  return <FaBell />;
};

const EMPTY_CONFIRM_STATE = {
  open: false,
  title: '',
  message: '',
  action: '',
  request: null
};

function ReceiptProofPreview({ proof }) {
  const candidates = useMemo(
    () => buildProofFileHrefCandidates(proof?.sourceValue || proof?.url, BASE_URL),
    [proof]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const activeUrl = candidates[candidateIndex] || proof?.url || '';

  useEffect(() => {
    setCandidateIndex(0);
  }, [proof?.key, proof?.url, proof?.sourceValue]);

  return (
    <a
      href={activeUrl || proof?.url || '#'}
      target="_blank"
      rel="noreferrer"
      className="rrl-receipt-proof-card"
      title={proof?.label}
    >
      <img
        src={activeUrl}
        alt={proof?.label}
        onError={() => {
          setCandidateIndex((current) =>
            current < candidates.length - 1 ? current + 1 : current
          );
        }}
      />
    </a>
  );
}

export default function ReliefRequestsList() {
  const navigate = useNavigate();
  const storedRole = normalizeRole(localStorage.getItem('role'));
  const queueBasePath = getReliefBasePathForRole(storedRole);
  const inventoryReleaseRoute = `${queueBasePath}/inventory`;
  const reviewerLabel = getReliefReviewerLabel(storedRole);

  const [rows, setRows] = useState([]);
  const [receivedRows, setReceivedRows] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const [queueFilter, setQueueFilter] = useState('active');
  const [barangayFilter, setBarangayFilter] = useState('');

  const [reviewDetails, setReviewDetails] = useState(null);
  const [feasibility, setFeasibility] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [confirmState, setConfirmState] = useState(EMPTY_CONFIRM_STATE);
  const [rejectReason, setRejectReason] = useState('');
  const [accomplishedPage, setAccomplishedPage] = useState(1);


  const notificationTimeoutsRef = useRef({});
  const lastSelectedRequestIdRef = useRef(null);
  const editedWarningNotifiedRef = useRef(new Set());
  const queueCardRef = useRef(null);
  const detailsCardRef = useRef(null);
  const [queueCardHeight, setQueueCardHeight] = useState(null);

  useEffect(() => {
    if (!storedRole) {
      navigate('/');
    }
  }, [navigate, storedRole]);

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

  const pushNotification = useCallback((message, type = 'info') => {
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

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return '-';
    }
  };

  const formatTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const getPdfPath = (request) => {
    if (request?.pdfFile) return request.pdfFile;
    if (request?.requestNo) {
      return `/uploads/relief-requests/${request.requestNo}.pdf`;
    }
    return '';
  };

  const getQueueHeading = () => {
    if (queueFilter === 'pending') return 'Pending Review';
    if (queueFilter === 'approved') return 'Awaiting Release';
    if (queueFilter === 'released') return 'Awaiting Receipt';
    if (queueFilter === 'received') return 'Received Requests';
    return 'Active Queue';
  };

  const fetchQueue = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoadingQueue(true);
        }

        const params = new URLSearchParams();
        params.set('status', queueFilter);

        const receivedParams = new URLSearchParams();
        receivedParams.set('status', 'completed');
        receivedParams.set('status', 'completed');

        const [res, receivedRes] = await Promise.all([
          fetch(`${BASE_URL}/api/drrmo/requests/queue?${params.toString()}`, {
            credentials: 'include'
          }),
          fetch(`${BASE_URL}/api/drrmo/requests/queue?${receivedParams.toString()}`, {
            credentials: 'include'
          })
        ]);

        if (!res.ok) {
          throw new Error('Failed to fetch request queue');
        }

        const data = await res.json();
        const requests = Array.isArray(data?.requests) ? data.requests : [];
        const receivedData = receivedRes.ok ? await receivedRes.json() : null;
        const receivedRequests = Array.isArray(receivedData?.requests)
          ? sortOperationalQueue(
              receivedData.requests.filter((item) => {
                const status = normalize(item?.status);
                const currentStage = normalize(item?.currentStage);
                return (
                  status === 'received' ||
                  status === 'completed' ||
                  currentStage === 'completed' ||
                  currentStage === 'accomplished'
                );
              })
            )
          : [];

        const unresolvedRequests = sortOperationalQueue(
          requests.filter((item) => {
            const status = normalize(item?.status);
            if (queueFilter === 'received') return status === 'received';
            if (isResolvedStatus(status)) return false;
            if (status === 'partially_released') return false;
            return true;
          })
        );

        const cleaned =
          queueFilter === 'active'
            ? sortOperationalQueue([
                ...unresolvedRequests,
                ...getStickyReceivedRequests(unresolvedRequests, receivedRequests),
              ])
            : unresolvedRequests;

        setReceivedRows(receivedRequests);

        setRows((prevRows) => {
          if (areQueuesEquivalent(prevRows, cleaned)) {
            return prevRows;
          }
          return cleaned;
        });

        setSelectedRequest((prevSelected) => {
          if (!cleaned.length) return null;
          if (!prevSelected?._id) return cleaned[0];

          const matched = cleaned.find((item) => item._id === prevSelected._id);
          return matched || cleaned[0];
        });

        const editedPending = cleaned.filter(
          (item) =>
            normalize(item?.status) === 'pending' &&
            item?.isEditedAfterSubmit &&
            !editedWarningNotifiedRef.current.has(item._id)
        );

        if (editedPending.length > 0) {
          const resubmittedCount = editedPending.filter(
            (item) => getRequestEditBadgeLabel(item) === 'Resubmitted'
          ).length;
          const updatedCount = editedPending.length - resubmittedCount;
          const noticeParts = [];

          if (resubmittedCount > 0) {
            noticeParts.push(
              `${resubmittedCount} resubmitted request${
                resubmittedCount > 1 ? 's need' : ' needs'
              } review`
            );
          }

          if (updatedCount > 0) {
            noticeParts.push(
              `${updatedCount} edited request${updatedCount > 1 ? 's need' : ' needs'} review`
            );
          }

          editedPending.forEach((item) => {
            editedWarningNotifiedRef.current.add(item._id);
          });

          pushNotification(
            `${noticeParts.join('. ')}.`,
            'warning'
          );
        }
      } catch (err) {
        console.error(err);

        if (!silent) {
          setRows([]);
          setReceivedRows([]);
          setSelectedRequest(null);
          setReviewDetails(null);
          setFeasibility(null);
          pushNotification(err.message || 'Failed to load request queue.', 'error');
        }
      } finally {
        if (!silent) {
          setLoadingQueue(false);
        }
      }
    },
    [queueFilter, pushNotification]
  );

  useEffect(() => {
    fetchQueue();

    const interval = setInterval(() => {
      fetchQueue({ silent: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchQueue]);

  const barangayOptions = useMemo(() => {
    return [
      ...new Set(
        [...rows, ...receivedRows]
          .map((row) => String(row?.barangayName || '').trim())
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b));
  }, [rows, receivedRows]);

  const filteredRows = useMemo(() => {
    let nextRows = [...rows];

    if (barangayFilter) {
      nextRows = nextRows.filter(
        (row) => String(row?.barangayName || '').trim() === barangayFilter
      );
    }

    if (queueFilter === 'pending') {
      nextRows = nextRows.filter((row) => normalize(row?.status) === 'pending');
    } else if (queueFilter === 'approved') {
      nextRows = nextRows.filter((row) => normalize(row?.status) === 'approved');
    } else if (queueFilter === 'released') {
      nextRows = nextRows.filter((row) => normalize(row?.status) === 'released');
    } else if (queueFilter === 'received') {
      nextRows = nextRows.filter((row) => normalize(row?.status) === 'received');
    }

    return sortOperationalQueue(nextRows);
  }, [rows, barangayFilter, queueFilter]);

  useEffect(() => {
    setSelectedRequest((prev) => {
      if (!filteredRows.length) return null;
      if (!prev?._id) return filteredRows[0];

      const matched = filteredRows.find((item) => item._id === prev._id);
      return matched || filteredRows[0];
    });
  }, [filteredRows]);

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedRequest(null);
      setReviewDetails(null);
      setFeasibility(null);
      setPdfPreviewUrl('');
      lastSelectedRequestIdRef.current = null;
      return;
    }

    if (
      selectedRequest?._id &&
      !filteredRows.some((item) => item._id === selectedRequest._id)
    ) {
      setReviewDetails(null);
      setFeasibility(null);
      setPdfPreviewUrl('');
      lastSelectedRequestIdRef.current = null;
    }
  }, [filteredRows, selectedRequest]);

  const visibleSelectedRequest = useMemo(() => {
    if (!selectedRequest?._id) return null;
    return filteredRows.find((item) => item._id === selectedRequest._id) || null;
  }, [filteredRows, selectedRequest]);

  useEffect(() => {
    const loadSelectedRequestSupportData = async () => {
      if (!visibleSelectedRequest?._id) {
        setReviewDetails(null);
        setFeasibility(null);
        lastSelectedRequestIdRef.current = null;
        return;
      }

      const selectedRequestKey = getRequestSyncKey(visibleSelectedRequest);

      if (lastSelectedRequestIdRef.current === selectedRequestKey) {
        return;
      }

      lastSelectedRequestIdRef.current = selectedRequestKey;

      try {
        setLoadingDetails(true);

        const [detailsRes, feasibilityRes] = await Promise.all([
          fetch(`${BASE_URL}/api/drrmo/requests/${visibleSelectedRequest._id}`, {
            credentials: 'include'
          }),
          fetch(
            `${BASE_URL}/api/drrmo/requests/${visibleSelectedRequest._id}/feasibility`,
            {
              credentials: 'include'
            }
          )
        ]);

        const detailsData = detailsRes.ok ? await detailsRes.json() : null;
        const feasibilityData = feasibilityRes.ok ? await feasibilityRes.json() : null;

        setReviewDetails(detailsData);
        setFeasibility(feasibilityData);
      } catch (err) {
        console.error(err);
        setReviewDetails(null);
        setFeasibility(null);
        pushNotification('Failed to load request details.', 'error');
      } finally {
        setLoadingDetails(false);
      }
    };

    loadSelectedRequestSupportData();
  }, [visibleSelectedRequest, pushNotification]);

  const displayedRequest = visibleSelectedRequest
    ? reviewDetails?.request || visibleSelectedRequest
    : null;

  const receivedSummaryBarangay =
    barangayFilter || String(displayedRequest?.barangayName || '').trim();

  const topTotals = useMemo(() => {
    const receivedSource = receivedSummaryBarangay
      ? receivedRows.filter(
          (row) => String(row?.barangayName || '').trim() === receivedSummaryBarangay
        )
      : receivedRows;

    const receivedTotals = receivedSource.reduce(
      (acc, row) => {
        acc.requests += 1;
        acc.foodPacks += Number(
          row?.fulfillment?.receivedFoodPacks ||
            row?.fulfillment?.releasedFoodPacks ||
            row?.totals?.receivedFoodPacks ||
            row?.totals?.releasedFoodPacks ||
            row?.totals?.requestedFoodPacks ||
            0
        );
        return acc;
      },
      { requests: 0, foodPacks: 0 }
    );

    return filteredRows.reduce(
      (acc, row) => {
        acc.requests += 1;
        acc.pending += normalize(row?.status) === 'pending' ? 1 : 0;
        acc.awaitingRelease += normalize(row?.status) === 'approved' ? 1 : 0;
        return acc;
      },
      {
        requests: 0,
        pending: 0,
        awaitingRelease: 0,
        received: receivedTotals.requests,
        receivedFoodPacks: receivedTotals.foodPacks
      }
    );
  }, [filteredRows, receivedRows, receivedSummaryBarangay]);

  const displayedVisibleRows = getVisibleRows(displayedRequest);
  const displayedVisibleTotals = getVisibleRowTotals(displayedRequest);
  const displayedRequested = Number(
    displayedVisibleTotals.requestedFoodPacks ||
      displayedRequest?.totals?.requestedFoodPacks ||
      0
  );
  const displayedRequestedMonetaryAmount = Number(
    displayedRequest?.totals?.requestedMonetaryAmount || 0
  );
  const displayedRequestedApplianceQuantity = getRequestedApplianceQuantity(displayedRequest);
  const displayedRequestedApplianceCount = getRequestedApplianceCount(displayedRequest);
  const displayedSupportTypes = getRequestSupportTypes(displayedRequest);
  const displayedCenterCount = getVisibleCenterCount(displayedRequest);
  const displayedEditBadgeLabel = getRequestEditBadgeLabel(displayedRequest);
  const displayedNeedsFood = hasSupportType(
    displayedSupportTypes,
    SUPPORT_TYPE_FOODPACKS
  );
  const displayedNeedsMonetary = hasSupportType(
    displayedSupportTypes,
    SUPPORT_TYPE_MONETARY
  );
  const displayedNeedsAppliance = hasSupportType(
    displayedSupportTypes,
    SUPPORT_TYPE_APPLIANCE
  );
  const displayedReceiptProofItems = useMemo(() => {
    const releases = Array.isArray(reviewDetails?.releases) ? reviewDetails.releases : [];

    return releases.flatMap((release, releaseIndex) =>
      (Array.isArray(release?.receiptProofFiles) ? release.receiptProofFiles : [])
        .filter(Boolean)
        .map((proofPath, proofIndex) => ({
          key: `${release?._id || releaseIndex}-${proofIndex}`,
          url: buildProofFileHref(proofPath, BASE_URL),
          sourceValue: proofPath,
          label: `Receipt Proof ${proofIndex + 1}`,
        }))
    );
  }, [reviewDetails?.releases]);
  const displayedDistributionSummary = useMemo(() => {
    const reviewDistribution = reviewDetails?.distributions;
    const supportTypes =
      reviewDistribution?.supportTypes || displayedSupportTypes || [];

    if (reviewDistribution?.summary) {
      return {
        visibility:
          reviewDistribution.summary.visibility ||
          dafacDistributionUtils.getDafacAidVisibility({ supportTypes, caps: {} }),
        perFamilyRows: Array.isArray(reviewDistribution.summary.perFamilyRows)
          ? reviewDistribution.summary.perFamilyRows
          : [],
      };
    }

    return dafacDistributionUtils.buildAccomplishedDistributionSummary({
      supportTypes,
      caps: {},
      records: Array.isArray(reviewDistribution?.records) ? reviewDistribution.records : [],
    });
  }, [reviewDetails?.distributions, displayedSupportTypes]);
  const displayedAccomplishedRows = Array.isArray(displayedDistributionSummary?.perFamilyRows)
    ? displayedDistributionSummary.perFamilyRows
    : [];
  const displayedAccomplishedVisibility = displayedDistributionSummary?.visibility || {};
  const canShowAccomplishedEvidence =
    displayedReceiptProofItems.length > 0 || displayedAccomplishedRows.length > 0;
  const accomplishedPageSize = 2;
  const accomplishedTotalPages = Math.max(
    1,
    Math.ceil(displayedAccomplishedRows.length / accomplishedPageSize)
  );
  const displayedAccomplishedRowsPage = displayedAccomplishedRows.slice(
    (accomplishedPage - 1) * accomplishedPageSize,
    accomplishedPage * accomplishedPageSize
  );

  useEffect(() => {
    setAccomplishedPage(1);
  }, [displayedRequest?._id]);

  useEffect(() => {
    if (accomplishedPage > accomplishedTotalPages) {
      setAccomplishedPage(accomplishedTotalPages);
    }
  }, [accomplishedPage, accomplishedTotalPages]);

  const selectedIndividuals =
    displayedVisibleTotals.male +
    displayedVisibleTotals.female +
    displayedVisibleTotals.lgbtq +
    displayedVisibleTotals.pwd +
    displayedVisibleTotals.pregnant +
    displayedVisibleTotals.senior;
  const selectedVulnerable =
    displayedVisibleTotals.pwd +
    displayedVisibleTotals.pregnant +
    displayedVisibleTotals.senior;
  const selectedSubmittedAt =
    displayedRequest?.submittedAt ||
    displayedRequest?.createdAt ||
    displayedRequest?.requestDate ||
    null;

  useLayoutEffect(() => {
    if (!detailsCardRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const updateHeights = () => {
      const nextHeight = detailsCardRef.current?.offsetHeight || 0;
      setQueueCardHeight(nextHeight > 0 ? nextHeight : null);
    };

    updateHeights();

    const observer = new ResizeObserver(() => {
      updateHeights();
    });

    observer.observe(detailsCardRef.current);
    window.addEventListener('resize', updateHeights);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeights);
    };
  }, [displayedRequest, loadingDetails, filteredRows.length]);

  const openReleasePlanner = (request) => {
    if (!request?._id) return;

    navigate(inventoryReleaseRoute, {
      state: {
        openReleasePlanner: true,
        selectedReliefRequestId: request._id,
        selectedReliefRequest: request
      }
    });
  };

  const closeConfirmation = useCallback(() => {
    if (submittingAction) return;
    setConfirmState(EMPTY_CONFIRM_STATE);
    setRejectReason('');
  }, [submittingAction]);

  const openApproveConfirmation = useCallback((request) => {
    if (!request?._id) return;

    setConfirmState({
      open: true,
      title: 'Approve relief request?',
      message: `This will mark ${request.barangayName || 'this barangay'} request as approved and move it to release planning.`,
      action: 'approve',
      request
    });
    setRejectReason('');
  }, []);

  const openRejectConfirmation = useCallback((request) => {
    if (!request?._id) return;

    setConfirmState({
      open: true,
      title: 'Reject relief request?',
      message: `Enter the rejection reason for ${request.barangayName || 'this barangay'} before confirming.`,
      action: 'reject',
      request
    });
    setRejectReason('');
  }, []);

  const handleReject = async (requestId) => {
    const trimmedReason = rejectReason.trim();

    if (!trimmedReason) {
      pushNotification('Please enter a rejection reason.', 'error');
      return;
    }

    try {
      setSubmittingAction(true);

      const res = await fetch(`${BASE_URL}/api/drrmo/requests/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'reject',
          remarks: trimmedReason
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to reject request');
      }

      setPdfPreviewUrl('');
      setReviewDetails(null);
      setFeasibility(null);
      lastSelectedRequestIdRef.current = null;
      setConfirmState(EMPTY_CONFIRM_STATE);
      setRejectReason('');
      await fetchQueue();
      pushNotification('Request rejected successfully.', 'success');
    } catch (err) {
      console.error(err);
      pushNotification(err.message || 'Failed to reject request.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleApprove = async (request) => {
    try {
      setSubmittingAction(true);

      const res = await fetch(`${BASE_URL}/api/drrmo/requests/${request._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'accept',
          remarks: `Approved by ${reviewerLabel}`
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to approve request');
      }

      setConfirmState(EMPTY_CONFIRM_STATE);
      setRejectReason('');
      pushNotification('Request approved. Opening release planner...', 'success');
      await fetchQueue();

      navigate(inventoryReleaseRoute, {
        state: {
          openReleasePlanner: true,
          selectedReliefRequestId: request._id,
          selectedReliefRequest: data?.request || request
        }
      });
    } catch (err) {
      console.error(err);
      pushNotification(err.message || 'Failed to approve request.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState?.request?._id) return;

    if (confirmState.action === 'approve') {
      await handleApprove(confirmState.request);
      return;
    }

    if (confirmState.action === 'reject') {
      await handleReject(confirmState.request._id);
      return;
    }
  };

  const openPdfInNewTab = (pdfPath) => {
    if (!pdfPath) {
      pushNotification('No PDF file available for this request yet.', 'info');
      return;
    }

    window.open(`${BASE_URL}${pdfPath}`, '_blank', 'noopener,noreferrer');
    pushNotification('PDF opened in a new tab.', 'info');
  };

  const closePdfPreview = () => {
    setPdfPreviewUrl('');
  };

  const handleSelectRequest = (row) => {
    if (!row?._id) return;
    if (selectedRequest?._id === row._id) return;

    setSelectedRequest(row);
    setPdfPreviewUrl('');
    setReviewDetails(null);
    setFeasibility(null);
    lastSelectedRequestIdRef.current = null;
  };

  const selectedTone = getFlowTone(displayedRequest);

  const canApprove = normalize(displayedRequest?.status) === 'pending';
  const canOpenPlanner = normalize(displayedRequest?.status) === 'approved';
  const canReject =
    normalize(displayedRequest?.status) === 'pending' ||
    normalize(displayedRequest?.status) === 'approved';

  return (
    <DashboardShell>
      <div className="rrl-page">
        <div className="rrl-shell">
          <section className="rrl-header-card">
            <div className="rrl-header-head">
              <div className="rrl-header-main">
                <h1 className="rrl-header-title">Relief Request Review</h1>
              </div>
            </div>

            <div className="rrl-totals-row rrl-totals-row-compact">
              <div className="rrl-total-card">
                <div className="rrl-total-card-top">
                  <span>In Queue</span>
                  <span className="rrl-total-icon"><FaInbox /></span>
                </div>
                <strong>{topTotals.requests}</strong>
              </div>
              <div className="rrl-total-card pending">
                <div className="rrl-total-card-top">
                  <span>Pending Review</span>
                  <span className="rrl-total-icon"><FaClock /></span>
                </div>
                <strong>{topTotals.pending}</strong>
              </div>
              <div className="rrl-total-card warning">
                <div className="rrl-total-card-top">
                  <span>Awaiting Release</span>
                  <span className="rrl-total-icon"><FaTruckLoading /></span>
                </div>
                <strong>{topTotals.awaitingRelease}</strong>
              </div>
              <div className="rrl-total-card success">
                <div className="rrl-total-card-top">
                  <span>Successful Releases</span>
                  <span className="rrl-total-icon"><FaCheck /></span>
                </div>
                <strong>{topTotals.received}</strong>
                <small className="rrl-total-note">
                  {receivedSummaryBarangay || 'All barangays'} ·{' '}
                  {topTotals.receivedFoodPacks.toLocaleString()} food pack(s)
                </small>
              </div>
            </div>
          </section>

          <section className="rrl-board rrl-board-tight">
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
                      <h2>{getQueueHeading()}</h2>
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
                        <option value="approved">Awaiting Release</option>
                        <option value="released">Awaiting Receipt</option>
                        <option value="received">Received</option>
                      </select>
                    </div>
                    <div className="rrl-control">
                      <label>Barangay</label>
                      <select
                        className="rrl-select"
                        value={barangayFilter}
                        onChange={(e) => setBarangayFilter(e.target.value)}
                      >
                        <option value="">All barangays</option>
                        {barangayOptions.map((barangay) => (
                          <option key={barangay} value={barangay}>
                            {barangay}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="rrl-queue-list-wrap">
                  <div className="rrl-queue-list">
                    {loadingQueue ? (
                      <div className="rrl-empty-state">Loading request queue...</div>
                    ) : filteredRows.length === 0 ? (
                      <div className="rrl-empty-state">No requests found.</div>
                    ) : (
                      filteredRows.map((row) => {
                        const isActive = selectedRequest?._id === row._id;
                        const submittedAt =
                          row?.submittedAt || row?.createdAt || row?.requestDate || null;
                        const tone = getFlowTone(row);
                        const editBadgeLabel = getRequestEditBadgeLabel(row);
                        const visibleCenterCount = getVisibleCenterCount(row);
                        return (
                          <button
                            type="button"
                            key={row._id}
                            className={`rrl-queue-item ${isActive ? 'active' : ''} rrl-queue-${tone}`}
                            onClick={() => handleSelectRequest(row)}
                          >
                            <div className="rrl-queue-top">
                              <div className="rrl-queue-main">
                                <div className="rrl-queue-barangay">
                                  {row.barangayName || '-'}
                                </div>
                                <div className="rrl-queue-disaster">
                                  {row.disaster || '-'}
                                </div>
                                <div className="rrl-queue-requestno-wrap">
                                  <div className="rrl-queue-requestno">
                                  {row.requestNo || '-'}
                                  </div>
                                  {editBadgeLabel ? (
                                    <span
                                      className={`rrl-edited-badge ${
                                        editBadgeLabel === 'Resubmitted'
                                          ? 'rrl-edited-badge-resubmitted'
                                          : ''
                                      }`}
                                    >
                                      <FaExclamationTriangle />
                                      {editBadgeLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="rrl-queue-bottom">
                              <div className="rrl-queue-bottom-main">
                                <div className="rrl-queue-inline-meta">
                                  <span>{visibleCenterCount} center(s)</span>
                                  <span>{getRequestIndividuals(row)} people</span>
                                </div>
                                <div className="rrl-queue-demand-summary">
                                  {buildQueueDemandSummary(row) || getRequestTypeLabel(row)}
                                </div>
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
              {!displayedRequest ? (
                <section className="rrl-card rrl-placeholder-card">
                  <div className="rrl-placeholder-inner">
                    <h2>No selected request</h2>
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
                        {displayedRequest.barangayName || '-'}
                      </div>
                      <div className="rrl-details-disaster">
                        {displayedRequest.disaster || '-'}
                      </div>
                      <div className="rrl-details-meta-row">
                        <div className="rrl-details-requestno">
                          {displayedRequest.requestNo || '-'}
                        </div>
                        {displayedEditBadgeLabel ? (
                          <span
                            className={`rrl-edited-badge ${
                              displayedEditBadgeLabel === 'Resubmitted'
                                ? 'rrl-edited-badge-resubmitted'
                                : ''
                            }`}
                          >
                            <FaExclamationTriangle />
                            {displayedEditBadgeLabel}
                          </span>
                        ) : null}
                        {displayedRequest?.lastEditedAt ? (
                          <div className="rrl-detail-meta-pill">
                            <span>Last Edited</span>
                            <strong>{formatDateTime(displayedRequest?.lastEditedAt)}</strong>
                          </div>
                        ) : null}
                        {Number(displayedRequest?.editCount || 0) > 0 ? (
                          <div className="rrl-detail-meta-pill">
                            <span>Edit Count</span>
                            <strong>{Number(displayedRequest?.editCount || 0)}</strong>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className={`rrl-status-banner rrl-status-banner-${selectedTone}`}>
                      {getDisplayedStatusLabel(displayedRequest)}
                    </div>
                  </div>

                  <div className="rrl-meta-strip">
                    <div className="rrl-meta-chip">
                      <span>Support Type</span>
                      <strong>{getRequestTypeLabel(displayedRequest)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Request Date</span>
                      <strong>{formatDate(displayedRequest.requestDate)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Submitted</span>
                      <strong>{formatDateTime(selectedSubmittedAt)}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>People</span>
                      <strong>{selectedIndividuals}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Vulnerable</span>
                      <strong>{selectedVulnerable}</strong>
                    </div>
                    <div className="rrl-meta-chip">
                      <span>Centers</span>
                      <strong>{displayedCenterCount}</strong>
                    </div>
                  </div>

                  <div className="rrl-request-focus-layout">
                    <div className="rrl-balance-strip rrl-balance-strip-request-only">
                      <div className="rrl-balance-chip rrl-balance-chip-primary rrl-balance-chip-request">
                        <span>Requested Packs</span>
                        <strong>{displayedNeedsFood ? displayedRequested : '-'}</strong>
                      </div>
                      <div className="rrl-balance-chip rrl-balance-chip-request">
                        <span>Requested Monetary</span>
                        <strong>
                          {displayedNeedsMonetary
                            ? `PHP ${formatMoney(displayedRequestedMonetaryAmount)}`
                            : '-'}
                        </strong>
                      </div>
                      <div className="rrl-balance-chip rrl-balance-chip-request">
                        <span>Requested Appliances</span>
                        <strong>
                          {displayedNeedsAppliance
                            ? `${displayedRequestedApplianceQuantity} unit(s)`
                            : '-'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="rrl-review-layout-focused">
                    <div className="rrl-review-main">
                      <div className="rrl-panel">
                        <div className="rrl-section-head">
                          <h3>Evacuation Rows</h3>
                        </div>

                        <div className="rrl-table-wrapper">
                          <table className="rrl-table rrl-detail-table">
                            <thead>
                              <tr>
                                <th>No.</th>
                                <th>Evacuation Center</th>
                                <th>Households</th>
                                <th>Families</th>
                                <th>Male</th>
                                <th>Female</th>
                                <th>LGBTQ</th>
                                <th>PWD</th>
                                <th>Pregnant</th>
                                <th>Senior</th>
                                <th>Food Packs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayedVisibleRows.length === 0 ? (
                                <tr>
                                  <td colSpan="11" className="rrl-empty-cell">
                                    No evacuation rows found.
                                  </td>
                                </tr>
                              ) : (
                                displayedVisibleRows.map((row, index) => (
                                  <tr key={`${row.evacuationCenterName}-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{row.evacuationCenterName || '-'}</td>
                                    <td>{row.households || 0}</td>
                                    <td>{row.families || 0}</td>
                                    <td>{row.male || 0}</td>
                                    <td>{row.female || 0}</td>
                                    <td>{row.lgbtq || 0}</td>
                                    <td>{row.pwd || 0}</td>
                                    <td>{row.pregnant || 0}</td>
                                    <td>{row.senior || 0}</td>
                                    <td>{row.requestedFoodPacks || 0}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="2" className="rrl-total-label">
                                  Total
                                </td>
                                <td>{displayedVisibleTotals.households}</td>
                                <td>{displayedVisibleTotals.families}</td>
                                <td>{displayedVisibleTotals.male}</td>
                                <td>{displayedVisibleTotals.female}</td>
                                <td>{displayedVisibleTotals.lgbtq}</td>
                                <td>{displayedVisibleTotals.pwd}</td>
                                <td>{displayedVisibleTotals.pregnant}</td>
                                <td>{displayedVisibleTotals.senior}</td>
                                <td>
                                  {displayedNeedsFood
                                    ? displayedVisibleTotals.requestedFoodPacks
                                    : '-'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                    </div>

                    <div className="rrl-review-side">
                      <div className="rrl-panel rrl-decision-panel">
                        <div className="rrl-section-head">
                          <h3>Decision Panel</h3>
                        </div>

                        <div className="rrl-decision-actions">
                          {canReject ? (
                            <button
                              type="button"
                              className="rrl-btn rrl-btn-danger"
                              disabled={submittingAction}
                              onClick={() => openRejectConfirmation(displayedRequest)}
                            >
                              <FaTimes />
                              Reject
                            </button>
                          ) : (
                            <div className="rrl-btn-slot" />
                          )}

                          {canApprove ? (
                            <button
                              type="button"
                              className="rrl-btn rrl-btn-approve"
                              disabled={submittingAction}
                              onClick={() => openApproveConfirmation(displayedRequest)}
                            >
                              <FaCheck />
                              Approve
                            </button>
                          ) : (
                            <div className="rrl-btn-slot" />
                          )}

                          {canOpenPlanner ? (
                            <button
                              type="button"
                              className="rrl-btn rrl-btn-primary"
                              disabled={submittingAction}
                              onClick={() => openReleasePlanner(displayedRequest)}
                            >
                              <FaClipboardCheck />
                              Open Release Planner
                            </button>
                          ) : (
                            <div className="rrl-btn-slot" />
                          )}
                        </div>

                        <div className="rrl-pdf-inline">
                          <button
                            type="button"
                            className="rrl-btn rrl-btn-secondary"
                            onClick={() => openPdfInNewTab(getPdfPath(displayedRequest))}
                          >
                            <FaExternalLinkAlt />
                            Open PDF
                          </button>

                          <a
                            className="rrl-btn rrl-btn-secondary"
                            href={
                              getPdfPath(displayedRequest)
                                ? `${BASE_URL}${getPdfPath(displayedRequest)}`
                                : undefined
                            }
                            target="_blank"
                            rel="noreferrer"
                            download
                            onClick={(e) => {
                              if (!getPdfPath(displayedRequest)) {
                                e.preventDefault();
                                pushNotification(
                                  'No PDF file available for this request yet.',
                                  'info'
                                );
                              } else {
                                pushNotification('PDF download started.', 'info');
                              }
                            }}
                          >
                            <FaDownload />
                            Download PDF
                          </a>
                        </div>
                        </div>
                      </div>
                    </div>

                    <div className="rrl-review-full">
                      <div className="rrl-panel rrl-remarks-panel">
                        <div className="rrl-section-head">
                          <h3>Remarks</h3>
                        </div>
                        <div className="rrl-remarks-box">
                          <div className="rrl-remarks-primary">
                            {displayedRequest?.remarks || 'No remarks provided.'}
                          </div>

                          {canShowAccomplishedEvidence ? (
                            <div className="rrl-accomplished-evidence-row">
                              <div className="rrl-receipt-proof-section">
                                <div className="rrl-section-subhead">
                                  <span>Receipt Proof</span>
                                  <strong>{displayedReceiptProofItems.length} image(s)</strong>
                                </div>
                                {displayedReceiptProofItems.length > 0 ? (
                                  <div className="rrl-receipt-proof-grid">
                                    {displayedReceiptProofItems.map((proof) => (
                                      <ReceiptProofPreview key={proof.key} proof={proof} />
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rrl-mini-empty">
                                    No receipt proof uploaded yet.
                                  </div>
                                )}
                              </div>

                              <div className="rrl-accomplished-summary-section">
                                <div className="rrl-section-subhead">
                                  <span>Per-Family Distribution Summary</span>
                                  <strong>{displayedAccomplishedRows.length} family card(s)</strong>
                                </div>

                                {displayedAccomplishedRows.length > 0 ? (
                                  <>
                                    <div className="rrl-accomplished-summary-table-wrap">
                                      <table className="rrl-accomplished-summary-table">
                                        <thead>
                                          <tr>
                                            <th>Serial No.</th>
                                            <th>Family Head</th>
                                            {displayedAccomplishedVisibility.showsFoodPacks ? (
                                              <th>Food Packs</th>
                                            ) : null}
                                            {displayedAccomplishedVisibility.showsMonetary ? (
                                              <th>Monetary</th>
                                            ) : null}
                                            {displayedAccomplishedVisibility.showsAppliances ? (
                                              <th>Appliance</th>
                                            ) : null}
                                            <th>Distribution Date</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {displayedAccomplishedRowsPage.map((row) => (
                                            <tr key={row.recordId || row.serialNo}>
                                              <td>{row.serialNo || '-'}</td>
                                              <td className="rrl-accomplished-left-cell">
                                                <strong>{row.familyName || '-'}</strong>
                                              </td>
                                              {displayedAccomplishedVisibility.showsFoodPacks ? (
                                                <td>{row.foodPacksReceived || 0}</td>
                                              ) : null}
                                              {displayedAccomplishedVisibility.showsMonetary ? (
                                                <td>PHP {formatMoney(row.monetaryAmountReceived || 0)}</td>
                                              ) : null}
                                              {displayedAccomplishedVisibility.showsAppliances ? (
                                                <td>{row.applianceUnitsReceived || 0}</td>
                                              ) : null}
                                              <td>
                                                {row.distributionDate
                                                  ? new Date(row.distributionDate).toLocaleDateString()
                                                  : '-'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                    {accomplishedTotalPages > 1 ? (
                                      <div className="rrl-accomplished-pagination">
                                        <button
                                          type="button"
                                          className="rrl-btn rrl-btn-secondary"
                                          onClick={() =>
                                            setAccomplishedPage((current) => Math.max(1, current - 1))
                                          }
                                          disabled={accomplishedPage === 1}
                                        >
                                          Prev
                                        </button>
                                        <span className="rrl-accomplished-pagination-label">
                                          Page {accomplishedPage} of {accomplishedTotalPages}
                                        </span>
                                        <button
                                          type="button"
                                          className="rrl-btn rrl-btn-secondary"
                                          onClick={() =>
                                            setAccomplishedPage((current) =>
                                              Math.min(accomplishedTotalPages, current + 1)
                                            )
                                          }
                                          disabled={accomplishedPage === accomplishedTotalPages}
                                        >
                                          Next
                                        </button>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="rrl-mini-empty">
                                    No completed family distribution records yet.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}


                          <div className="rrl-remarks-summary-grid">
                            {displayedNeedsMonetary ? (
                              <div className="rrl-remarks-summary-card">
                                <span>Requested Monetary</span>
                                <strong>PHP {formatMoney(displayedRequestedMonetaryAmount)}</strong>
                              </div>
                            ) : null}
                            {displayedNeedsAppliance ? (
                              <div className="rrl-remarks-summary-card">
                                <span>Requested Appliances</span>
                                <strong>
                                  {displayedRequestedApplianceQuantity} unit(s) across{' '}
                                  {displayedRequestedApplianceCount} item type(s)
                                </strong>
                              </div>
                            ) : null}
                          </div>

                          {displayedNeedsAppliance &&
                          Array.isArray(displayedRequest?.requestedAppliances) &&
                          displayedRequest.requestedAppliances.length > 0 ? (
                            <div className="rrl-appliance-request-list">
                              {displayedRequest.requestedAppliances
                                .map((item, index) => {
                                  const itemName = String(item?.itemName || '').trim();
                                  const category = String(item?.category || '').trim();
                                  const quantity = Number(item?.quantityRequested || 0);
                                  const itemRemarks = String(item?.remarks || '').trim();

                                  if (!itemName) return null;

                                  return (
                                    <div
                                      key={`${itemName}-${index}`}
                                      className="rrl-appliance-request-card"
                                    >
                                      <div className="rrl-appliance-request-head">
                                        <strong>{itemName}</strong>
                                        <span>{quantity} unit(s)</span>
                                      </div>
                                      <div className="rrl-appliance-request-meta">
                                        <span>{category || 'Uncategorized'}</span>
                                        <span>{itemRemarks || 'No item remarks'}</span>
                                      </div>
                                    </div>
                                  );
                                })
                                .filter(Boolean)}
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

        {confirmState.open && typeof document !== 'undefined'
          ? createPortal(
              <div className="rrl-modal-backdrop" onClick={closeConfirmation}>
                <div className="rrl-modal-card" onClick={(e) => e.stopPropagation()}>
                  <h3>{confirmState.title}</h3>
                  <p>{confirmState.message}</p>

                  {confirmState.action === 'reject' ? (
                    <div className="rrl-modal-field">
                      <label htmlFor="rrl-reject-reason" className="rrl-modal-label">
                        Rejection Reason <span className="rrl-modal-required">*</span>
                      </label>
                      <textarea
                        id="rrl-reject-reason"
                        className="rrl-modal-textarea"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter the reason for rejecting this request."
                        rows={4}
                        disabled={submittingAction}
                        required
                        aria-required="true"
                      />
                      <span className="rrl-modal-help">
                        A reason is required before {reviewerLabel} can reject this request.
                      </span>
                    </div>
                  ) : null}

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
                        confirmState.action === 'reject'
                          ? 'rrl-btn-danger'
                          : 'rrl-btn-primary'
                      }`}
                      onClick={handleConfirmAction}
                      disabled={isConfirmationSubmitDisabled({
                        action: confirmState.action,
                        rejectReason,
                        submittingAction,
                      })}
                    >
                      {confirmState.action === 'reject' ? <FaTimes /> : <FaCheck />}
                      {submittingAction ? 'Processing...' : 'Confirm'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {pdfPreviewUrl ? (
          <div className="rrl-pdf-modal-overlay" onClick={closePdfPreview}>
            <div className="rrl-pdf-modal" onClick={(e) => e.stopPropagation()}>
              <div className="rrl-pdf-modal-header">
                <div>
                  <h3>Relief Request PDF</h3>
                </div>

                <button
                  type="button"
                  className="rrl-btn rrl-btn-secondary"
                  onClick={closePdfPreview}
                >
                  <FaTimes />
                  Close
                </button>
              </div>

              <iframe
                title="Relief Request PDF Preview"
                src={pdfPreviewUrl}
                className="rrl-pdf-frame"
              />
            </div>
          </div>
        ) : null}

        {typeof document !== 'undefined'
          ? createPortal(
              <div className="notification-stack rrl-notification-stack">
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
              document.body
            )
          : null}
      </div>
    </DashboardShell>
  );
}

