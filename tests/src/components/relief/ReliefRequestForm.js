import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  FaCheck,
  FaMinus,
  FaExclamationTriangle,
  FaFileImport,
  FaFilePdf,
  FaPen,
  FaPlus,
  FaRedo,
  FaTimes
} from 'react-icons/fa';
import DashboardShell from '../layout/DashboardShell';
import {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  SUPPORT_TYPE_OPTIONS,
  deriveLegacyRequestType,
  getSupportTypesFromRequest,
  getSupportTypeLabel,
  hasSupportType,
  isMonetaryMixedWithOtherSupport,
  normalizeSupportTypes
} from './supportTypes';
import {
  RELIEF_IMPORT_HEADER_ALIASES,
  buildImportSummaryText,
  deriveImportedSupportTypes,
  normalizeImportedRequestType,
  shouldShowConfirmReceivedAction
} from './reliefImportUtils';
import {
  mapSpreadsheetRow,
  parseSafeNumber
} from '../shared/spreadsheetImportUtils';
import * as dafacWorkbookUtils from './dafacWorkbookUtils';
import DafacDistributionCard from './DafacDistributionCard';
import AccomplishedReportPanel from './AccomplishedReportPanel';
import { buildProofFileHref, isImageProofFile } from '../Donations/proofFileUtils';
import '../css/ReliefRequestForm.css';
import { API_BASE_URL } from "../../config/api";
import { getTodayInputDate } from "../Donations/inventoryExpiryUtils";

const BASE_URL = API_BASE_URL;
const dafacDistributionUtils = require('./dafacDistributionUtils');

const numberFields = [
  'households',
  'families',
  'male',
  'female',
  'lgbtq',
  'pwd',
  'pregnant',
  'senior',
  'requestedFoodPacks'
];

const STAGE_STEPS = [
  { key: 'prepare', label: 'Prepare', hint: 'Set request details' },
  { key: 'review', label: 'For Review', hint: 'Waiting for reviewer' },
  { key: 'approved', label: 'Approved', hint: 'Ready for release' },
  { key: 'to_receive', label: 'Receive Goods', hint: 'Release in progress' },
  { key: 'received', label: 'Received', hint: 'Confirmation complete' },
  { key: 'dafac', label: 'DAFAC Distribution', hint: 'Encode family assistance' },
  { key: 'accomplished', label: 'Accomplished Report', hint: 'Export full report' }
];
const createPreparedRow = (row = {}) => ({
  evacPlaceId: row.evacPlaceId || row._id || '',
  evacuationCenterName: String(row.evacuationCenterName || row.name || '').trim(),
  households: Number(row.households || 0),
  families: Number(row.families || 0),
  male: Number(row.male || 0),
  female: Number(row.female || 0),
  lgbtq: Number(row.lgbtq || 0),
  pwd: Number(row.pwd || 0),
  pregnant: Number(row.pregnant || 0),
  senior: Number(row.senior || 0),
  requestedFoodPacks: Number(row.requestedFoodPacks || 0),
  isActiveRow: row.isActiveRow !== undefined ? Boolean(row.isActiveRow) : true,
  rowRemarks: String(row.rowRemarks || '').trim()
});

const buildRowsFromRequest = (request) => {
  const sourceRows = Array.isArray(request?.rows) ? request.rows : [];
  return sourceRows.map((row) => createPreparedRow(row));
};

const buildRowsFromEvacs = (evacs = []) =>
  evacs.map((place) =>
    createPreparedRow({
      evacPlaceId: place._id,
      evacuationCenterName: place.name,
      households: 0,
      families: 0,
      male: 0,
      female: 0,
      lgbtq: 0,
      pwd: 0,
      pregnant: 0,
      senior: 0,
      requestedFoodPacks: 0,
      isActiveRow: true,
      rowRemarks: ''
    })
  );

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '-';
  }
};

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
};

const clampToTodayOrFutureDate = (value) => {
  const today = getTodayInputDate();
  if (!value) return today;
  return value < today ? today : value;
};

const createDistributionFamilyMember = (member = {}) => ({
  fullName: sanitizeInlineText(member.fullName || '', { maxLength: 120 }),
  relationshipToHead: sanitizeInlineText(member.relationshipToHead || '', {
    maxLength: 80
  }),
  age: String(member.age ?? '').trim(),
  sex: sanitizeInlineText(member.sex || '', { maxLength: 24 }),
  education: sanitizeInlineText(member.education || '', { maxLength: 60 }),
  occupationalSkills: sanitizeInlineText(member.occupationalSkills || '', {
    maxLength: 80
  }),
  remarks: sanitizeInlineText(member.remarks || '', {
    maxLength: 120,
    multiline: true
  })
});

const createDistributionDraft = (record = {}) => ({
  _id: record._id || '',
  serialNo: String(record.serialNo || '').trim(),
  evacuationCenterName: sanitizeInlineText(record.evacuationCenterName || '', {
    maxLength: 120
  }),
  siteLabel: sanitizeInlineText(record.siteLabel || '', { maxLength: 120 }),
  distributionDate: record.distributionDate
    ? new Date(record.distributionDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10),
  headOfFamily: {
    surname: sanitizeInlineText(record?.headOfFamily?.surname || '', { maxLength: 80 }),
    firstName: sanitizeInlineText(record?.headOfFamily?.firstName || '', { maxLength: 80 }),
    middleName: sanitizeInlineText(record?.headOfFamily?.middleName || '', { maxLength: 80 }),
    sex: sanitizeInlineText(record?.headOfFamily?.sex || '', { maxLength: 24 }),
    age: String(record?.headOfFamily?.age ?? '').trim(),
    birthDate: record?.headOfFamily?.birthDate
      ? new Date(record.headOfFamily.birthDate).toISOString().slice(0, 10)
      : '',
    occupation: sanitizeInlineText(record?.headOfFamily?.occupation || '', { maxLength: 80 }),
    monthlyIncome: String(record?.headOfFamily?.monthlyIncome ?? '').trim()
  },
  familyProfile: {
    is4PsBeneficiary: Boolean(record?.familyProfile?.is4PsBeneficiary),
    isIpBeneficiary: Boolean(record?.familyProfile?.isIpBeneficiary),
    ipEthnicity: sanitizeInlineText(record?.familyProfile?.ipEthnicity || '', {
      maxLength: 80
    })
  },
  housingProfile: {
    tenureStatus: sanitizeInlineText(record?.housingProfile?.tenureStatus || '', {
      maxLength: 120
    }),
    housingCondition: sanitizeInlineText(record?.housingProfile?.housingCondition || '', {
      maxLength: 120
    })
  },
  healthProfile: {
    healthCondition: sanitizeInlineText(record?.healthProfile?.healthCondition || '', {
      maxLength: 120
    })
  },
  familyMembers:
    Array.isArray(record?.familyMembers) && record.familyMembers.length
      ? record.familyMembers.map((member) => createDistributionFamilyMember(member))
      : [createDistributionFamilyMember()],
  distribution: {
    foodPacksReceived: String(record?.distribution?.foodPacksReceived ?? '').trim(),
    monetaryAmountReceived: String(record?.distribution?.monetaryAmountReceived ?? '').trim(),
    applianceUnitsReceived: String(
      record?.distribution?.applianceUnitsReceived ??
        (Array.isArray(record?.distribution?.applianceItems)
          ? record.distribution.applianceItems.reduce(
              (sum, item) => sum + Number(item?.quantityReceived || 0),
              0
            )
          : '')
    ).trim()
  },
  signOff: {
    familyHeadPrintedName: sanitizeInlineText(
      record?.signOff?.familyHeadPrintedName || '',
      { maxLength: 120 }
    ),
    barangayOfficerPrintedName: sanitizeInlineText(
      record?.signOff?.barangayOfficerPrintedName || '',
      { maxLength: 120 }
    ),
    lswdoPrintedName: sanitizeInlineText(record?.signOff?.lswdoPrintedName || '', {
      maxLength: 120
    })
  },
  remarks: sanitizeInlineText(record?.remarks || '', {
    maxLength: 240,
    multiline: true
  }),
  distributionStatus: record?.distributionStatus || 'completed'
});

const createDistributionEditorCard = (record = {}, mode = 'create') => ({
  localId: `${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  mode,
  sourceRecordId: record?._id || '',
  draft: createDistributionDraft(record)
});

const normalizeStage = (stage) => String(stage || '').toLowerCase();
const getDeclaredSupportTypes = (request = {}) => getSupportTypesFromRequest(request);

const normalizeValue = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const sanitizeInlineText = (value, { maxLength = 240, multiline = false } = {}) => {
  const raw = String(value || '').replace(/[<>]/g, '');
  const normalized = multiline
    ? raw
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
    : raw.replace(/\s+/g, ' ');

  return normalized.slice(0, maxLength);
};

const sanitizeCurrencyInput = (value) => {
  const raw = String(value ?? '').replace(/[^\d.]/g, '');
  if (!raw) return '';

  const [whole, ...fractionParts] = raw.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fractionParts.join('').slice(0, 2);

  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
};

const sanitizeWholeNumberInput = (value) => {
  const raw = String(value ?? '').replace(/[^\d]/g, '');
  return raw.replace(/^0+(?=\d)/, '') || (raw ? '0' : '');
};

const createRequestedAppliance = (item = {}) => ({
  itemName: sanitizeInlineText(item.itemName || '', { maxLength: 120 }),
  category: sanitizeInlineText(item.category || '', { maxLength: 80 }),
  quantityRequested: String(item.quantityRequested ?? '').trim(),
  remarks: sanitizeInlineText(item.remarks || '', {
    maxLength: 180,
    multiline: true
  })
});

const hasRequestedApplianceContent = (item = {}) =>
  Boolean(
    String(item.itemName || '').trim() ||
      String(item.category || '').trim() ||
      parseSafeNumber(item.quantityRequested) > 0 ||
      String(item.remarks || '').trim()
  );

const hasCompleteRequestedAppliance = (item = {}) =>
  Boolean(
    String(item.itemName || '').trim() &&
      String(item.category || '').trim() &&
      parseSafeNumber(item.quantityRequested) > 0
  );

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const isCancelledStatus = (value) => {
  const normalized = normalizeStatus(value);
  return normalized === 'cancelled' || normalized === 'canceled';
};

const getStageMeta = (stage) => {
  switch (normalizeStage(stage)) {
    case 'pending_review':
      return { label: 'For Review', tone: 'pending', activeStep: 2, completedSteps: 1 };
    case 'approved_waiting_release':
      return { label: 'Approved', tone: 'approved', activeStep: 3, completedSteps: 2 };
    case 'partially_released':
      return { label: 'Receive Goods', tone: 'released', activeStep: 4, completedSteps: 3 };
    case 'released_waiting_receipt':
      return { label: 'Receive Goods', tone: 'released', activeStep: 4, completedSteps: 3 };
    case 'completed':
      return { label: 'Received', tone: 'completed', activeStep: 5, completedSteps: 4 };
    case 'rejected':
      return { label: 'Rejected', tone: 'rejected', activeStep: 2, completedSteps: 1 };
    case 'cancelled':
    case 'canceled':
    case 'preparation':
    default:
      return { label: 'Prepare', tone: 'draft', activeStep: 1, completedSteps: 0 };
  }
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

const serializeRowsForCompare = (rows = []) =>
  rows.map((row) => ({
    evacPlaceId: row.evacPlaceId || '',
    evacuationCenterName: String(row.evacuationCenterName || '').trim(),
    households: Number(row.households || 0),
    families: Number(row.families || 0),
    male: Number(row.male || 0),
    female: Number(row.female || 0),
    lgbtq: Number(row.lgbtq || 0),
    pwd: Number(row.pwd || 0),
    pregnant: Number(row.pregnant || 0),
    senior: Number(row.senior || 0),
    requestedFoodPacks: Number(row.requestedFoodPacks || 0),
    isActiveRow: Boolean(row.isActiveRow),
    rowRemarks: String(row.rowRemarks || '').trim()
  }));

export default function ReliefRequestForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const distributionFileInputRef = useRef(null);

  const editMode = location.state?.mode === 'edit';
  const editingRequest = location.state?.request || null;

  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [barangayName, setBarangayName] = useState('');
  const [requestId, setRequestId] = useState('');
  const [requestNo, setRequestNo] = useState('Auto-generated');
  const [disaster, setDisaster] = useState('');
  const [supportTypes, setSupportTypes] = useState([SUPPORT_TYPE_FOODPACKS]);
  const [requestedMonetaryAmount, setRequestedMonetaryAmount] = useState('');
  const [requestedAppliances, setRequestedAppliances] = useState([
    createRequestedAppliance()
  ]);
  const [requestDate, setRequestDate] = useState(
    getTodayInputDate()
  );
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState([]);
  const [bootstrapRows, setBootstrapRows] = useState([]);
  const minAllowedDate = useMemo(() => getTodayInputDate(), []);

  const [journey, setJourney] = useState({
    request: null,
    releases: [],
    stage: 'preparation',
    canEdit: false,
    canCancel: false,
    canReceiveAnyRelease: false,
    canRequestAgain: false,
    summary: null
  });

  const [pageError, setPageError] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const [formFeedback, setFormFeedback] = useState({
    type: '',
    message: ''
  });
  const [distributionImportIssues, setDistributionImportIssues] = useState([]);

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    action: '',
    payload: null
  });

  const [importingFile, setImportingFile] = useState(false);
  const [importInfo, setImportInfo] = useState({
    hasImported: false,
    fileName: '',
    summary: null,
    issues: [],
    source: 'manual'
  });
  const [distributionState, setDistributionState] = useState({
    records: [],
    caps: null,
    summary: null,
    request: null,
    loading: false,
    loaded: false
  });
  const [distributionEditorCards, setDistributionEditorCards] = useState([]);
  const [distributionSubmitting, setDistributionSubmitting] = useState(false);
  const [distributionImporting, setDistributionImporting] = useState(false);
  const [distributionPage, setDistributionPage] = useState(1);
  const [distributionConfirmed, setDistributionConfirmed] = useState(false);
  const [receiptProofFiles, setReceiptProofFiles] = useState([]);

  const fetchLatestBootstrapRows = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/api/relief-requests/bootstrap`, {
      credentials: 'include'
    });

    const data = res.ok ? await res.json() : null;

    if (!res.ok || !data) {
      throw new Error('Failed to refresh evacuation center rows.');
    }

    const freshRows = Array.isArray(data.rows)
      ? data.rows.map((row) => createPreparedRow(row))
      : [];

    setBootstrapRows(freshRows);
    return freshRows;
  }, []);

  const loadJourneyData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoadingPage(true);
          setPageError('');
        }

        const sessionRes = await fetch(`${BASE_URL}/api/debug-session`, {
          credentials: 'include'
        });

        if (!sessionRes.ok) {
          navigate('/');
          return;
        }

        const sessionData = await sessionRes.json();
        const role = String(sessionData?.role || '').toLowerCase();

        if (role !== 'barangay') {
          navigate('/');
          return;
        }

        const barangayRes = await fetch(`${BASE_URL}/api/barangays/me`, {
          credentials: 'include'
        });

        const barangayData = barangayRes.ok ? await barangayRes.json() : null;

        if (!barangayRes.ok || !barangayData) {
          throw new Error('Failed to load barangay information.');
        }

        setBarangayName(barangayData.barangayName || barangayData.name || '');

        const [bootstrapRes, journeyRes, evacsRes] = await Promise.all([
          fetch(`${BASE_URL}/api/relief-requests/bootstrap`, {
            credentials: 'include'
          }),
          fetch(`${BASE_URL}/api/relief-requests/journey/current`, {
            credentials: 'include'
          }),
          fetch(`${BASE_URL}/evacs`, {
            credentials: 'include'
          })
        ]);

        const bootstrapData = bootstrapRes.ok ? await bootstrapRes.json() : null;
        const journeyData = journeyRes.ok ? await journeyRes.json() : null;
        const evacsData = evacsRes.ok ? await evacsRes.json() : [];

        if (!journeyRes.ok || !journeyData) {
          throw new Error('Failed to load request status.');
        }

        const bootstrapPrepared = Array.isArray(bootstrapData?.rows)
          ? bootstrapData.rows.map((row) => createPreparedRow(row))
          : [];

        const fallbackEvacs = Array.isArray(evacsData)
          ? evacsData
              .filter((place) => {
                const placeBarangayId = String(place.barangayId || '');
                const currentBarangayId = String(barangayData._id || '');
                const isVisible =
                  place.isRequestVisible === undefined
                    ? true
                    : Boolean(place.isRequestVisible);

                return (
                  !place.isArchived &&
                  isVisible &&
                  (!placeBarangayId ||
                    !currentBarangayId ||
                    placeBarangayId === currentBarangayId)
                );
              })
              .map((place) => ({
                _id: place._id,
                name: place.name
              }))
          : [];

        const resolvedBootstrapRows =
          bootstrapPrepared.length > 0
            ? bootstrapPrepared
            : buildRowsFromEvacs(fallbackEvacs);

        const sanitizedJourney = {
          request: journeyData.request || null,
          releases: Array.isArray(journeyData.releases) ? journeyData.releases : [],
          stage: journeyData.stage || 'preparation',
          canEdit: Boolean(journeyData.canEdit),
          canCancel: Boolean(journeyData.canCancel),
          canReceiveAnyRelease: Boolean(journeyData.canReceiveAnyRelease),
          canRequestAgain: Boolean(journeyData.canRequestAgain),
          summary: journeyData.summary || null
        };

        setBootstrapRows(resolvedBootstrapRows);
        setJourney(sanitizedJourney);
        setSessionChecked(true);

        if (editMode && editingRequest) {
          setRequestId(editingRequest._id || '');
          setRequestNo(editingRequest.requestNo || 'Auto-generated');
          setDisaster(editingRequest.disaster || '');
          setSupportTypes(getSupportTypesFromRequest(editingRequest));
          setRequestedMonetaryAmount(
            String(editingRequest?.totals?.requestedMonetaryAmount || '')
          );
          setRequestedAppliances(
            (Array.isArray(editingRequest?.requestedAppliances) &&
            editingRequest.requestedAppliances.length
              ? editingRequest.requestedAppliances
              : [createRequestedAppliance()]
            ).map((item) => createRequestedAppliance(item))
          );
          setRequestDate(
            editingRequest.requestDate
              ? new Date(editingRequest.requestDate).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10)
          );
          setRemarks(editingRequest.remarks || '');
          setRows(buildRowsFromRequest(editingRequest));
          setShowEditor(true);
          setImportInfo({
            hasImported: editingRequest.entryMode === 'excel_import',
            fileName: '',
            summary: null,
            issues: [],
            source: editingRequest.entryMode === 'excel_import' ? 'excel_import' : 'manual'
          });
          return;
        }

        const journeyRequestStatus = normalizeStatus(sanitizedJourney.request?.status);
        const journeyStageStatus = normalizeStatus(sanitizedJourney.stage);
        const canRestoreExistingRequest =
          sanitizedJourney.canEdit ||
          journeyRequestStatus === 'rejected' ||
          journeyStageStatus === 'rejected';

        if (sanitizedJourney.request && canRestoreExistingRequest) {
          setRequestId(sanitizedJourney.request._id || '');
          setRequestNo(sanitizedJourney.request.requestNo || 'Auto-generated');
          setDisaster(sanitizedJourney.request.disaster || '');
          setSupportTypes(getSupportTypesFromRequest(sanitizedJourney.request));
          setRequestedMonetaryAmount(
            String(sanitizedJourney.request?.totals?.requestedMonetaryAmount || '')
          );
          setRequestedAppliances(
            (Array.isArray(sanitizedJourney.request?.requestedAppliances) &&
            sanitizedJourney.request.requestedAppliances.length
              ? sanitizedJourney.request.requestedAppliances
              : [createRequestedAppliance()]
            ).map((item) => createRequestedAppliance(item))
          );
          setRequestDate(
            sanitizedJourney.request.requestDate
              ? new Date(sanitizedJourney.request.requestDate).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10)
          );
          setRemarks(sanitizedJourney.request.remarks || '');
          setRows(buildRowsFromRequest(sanitizedJourney.request));
          setShowEditor(false);
          setImportInfo({
            hasImported: sanitizedJourney.request.entryMode === 'excel_import',
            fileName: '',
            summary: null,
            issues: [],
            source:
              sanitizedJourney.request.entryMode === 'excel_import' ? 'excel_import' : 'manual'
          });
          return;
        }

        setRequestId('');
        setRequestNo('Auto-generated');
        setDisaster('');
        setSupportTypes([SUPPORT_TYPE_FOODPACKS]);
        setRequestedMonetaryAmount('');
        setRequestedAppliances([createRequestedAppliance()]);
        setRequestDate(new Date().toISOString().slice(0, 10));
        setRemarks('');
        setRows(resolvedBootstrapRows);
        setShowEditor(false);
        setImportInfo({
          hasImported: false,
          fileName: '',
          summary: null,
          issues: [],
          source: 'manual'
        });
      } catch (err) {
        console.error(err);
        setPageError(err.message || 'Failed to load request page.');
        setSessionChecked(true);
      } finally {
        setLoadingPage(false);
      }
    },
    [editMode, editingRequest, navigate]
  );

  useEffect(() => {
    loadJourneyData();
  }, [loadJourneyData]);

  useEffect(() => {
    if (showEditor || editMode || !sessionChecked || loadingPage) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      loadJourneyData({ silent: true });
    }, 12000);

    return () => clearInterval(intervalId);
  }, [showEditor, editMode, sessionChecked, loadingPage, loadJourneyData]);

  useEffect(() => {
    const canStayInEditor =
      journey.canEdit ||
      normalizeStatus(journey.request?.status) === 'rejected' ||
      normalizeStatus(journey.stage) === 'rejected';

    if (!canStayInEditor && !editMode) {
      setShowEditor(false);
    }
  }, [journey.canEdit, journey.request?.status, journey.stage, editMode]);

  const latestRequest = useMemo(() => {
    if (!journey.request) return null;
    if (isCancelledStatus(journey.request?.status)) return null;
    return journey.request;
  }, [journey.request]);

  const loadDistributionData = useCallback(
    async ({ silent = false } = {}) => {
      if (!latestRequest?._id) {
        setDistributionState({
          records: [],
          caps: null,
          summary: null,
          request: null,
          loading: false,
          loaded: false
        });
        setDistributionPage(1);
        return;
      }

      try {
        if (!silent) {
          setDistributionState((prev) => ({ ...prev, loading: true }));
        }

        const res = await fetch(`${BASE_URL}/api/relief-distributions/${latestRequest._id}`, {
          credentials: 'include'
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || 'Failed to load distribution records.');
        }

        setDistributionState({
          records: Array.isArray(data?.records) ? data.records : [],
          caps: data?.caps || null,
          summary: data?.summary || null,
          request: data?.request || null,
          loading: false,
          loaded: true
        });
        setDistributionPage(1);
      } catch (err) {
        console.error(err);
        setDistributionState((prev) => ({
          ...prev,
          loading: false,
          loaded: true
        }));
      }
    },
    [latestRequest?._id]
  );

  useEffect(() => {
    loadDistributionData({ silent: false });
  }, [loadDistributionData]);

  const preparedRows = useMemo(() => rows.map((row) => createPreparedRow(row)), [rows]);

  const activeRows = useMemo(
    () => preparedRows.filter((row) => row.isActiveRow),
    [preparedRows]
  );

  const requestRowsForDisplay = useMemo(() => {
    return Array.isArray(latestRequest?.rows)
      ? latestRequest.rows.map((row) => createPreparedRow(row))
      : [];
  }, [latestRequest?.rows]);

  const activeRequestRowsForDisplay = useMemo(() => {
    return requestRowsForDisplay.filter((row) => row.isActiveRow);
  }, [requestRowsForDisplay]);

  const displayRequestedPacks = useMemo(() => {
    const rowTotal = activeRequestRowsForDisplay.reduce(
      (sum, row) => sum + Number(row.requestedFoodPacks || 0),
      0
    );

    return Number(
      latestRequest?.totalRequestedFoodPacks ||
        latestRequest?.requestedFoodPacks ||
        latestRequest?.requestedPacks ||
        latestRequest?.totals?.requestedFoodPacks ||
        latestRequest?.summary?.requestedFoodPacks ||
        journey.summary?.requestedFoodPacks ||
        journey.summary?.totalRequestedFoodPacks ||
        rowTotal ||
        0
    );
  }, [activeRequestRowsForDisplay, latestRequest, journey.summary]);

  const displayRequestedMonetaryAmount = useMemo(() => {
    return Number(
      latestRequest?.totals?.requestedMonetaryAmount ||
        journey.summary?.requestedMonetaryAmount ||
        0
    );
  }, [latestRequest, journey.summary]);

  const requestedApplianceQuantity = useMemo(
    () =>
      requestedAppliances.reduce(
        (sum, item) => sum + parseSafeNumber(item.quantityRequested),
        0
      ),
    [requestedAppliances]
  );

  const displayRequestedApplianceQuantity = useMemo(() => {
    const requestItems = Array.isArray(latestRequest?.requestedAppliances)
      ? latestRequest.requestedAppliances
      : [];

    const latestTotal = requestItems.reduce(
      (sum, item) => sum + parseSafeNumber(item.quantityRequested),
      0
    );

    return Number(
      latestRequest?.totals?.requestedApplianceQuantity ||
        latestRequest?.summary?.requestedApplianceQuantity ||
        journey.summary?.requestedApplianceQuantity ||
        latestTotal ||
        0
    );
  }, [latestRequest, journey.summary]);

  const requestType = useMemo(
    () => deriveLegacyRequestType(supportTypes),
    [supportTypes]
  );

  const displaySupportTypes = useMemo(
    () =>
      latestRequest
        ? getDeclaredSupportTypes(latestRequest)
        : supportTypes,
    [latestRequest, supportTypes]
  );

  const displaySupportTypeLabel = useMemo(
    () => getSupportTypeLabel(displaySupportTypes),
    [displaySupportTypes]
  );

  const currentSupportTypeLabel = useMemo(
    () => getSupportTypeLabel(supportTypes),
    [supportTypes]
  );

  const displayIncludesFoodPacks = hasSupportType(
    displaySupportTypes,
    SUPPORT_TYPE_FOODPACKS
  );
  const displayIncludesMonetary = hasSupportType(
    displaySupportTypes,
    SUPPORT_TYPE_MONETARY
  );
  const displayIncludesAppliance = hasSupportType(
    displaySupportTypes,
    SUPPORT_TYPE_APPLIANCE
  );

  const displayTotalAffected = useMemo(() => {
    const rowTotal = activeRequestRowsForDisplay.reduce(
      (sum, row) =>
        sum +
        Number(row.male || 0) +
        Number(row.female || 0) +
        Number(row.lgbtq || 0) +
        Number(row.pwd || 0) +
        Number(row.pregnant || 0) +
        Number(row.senior || 0),
      0
    );

    return Number(
      latestRequest?.totalAffected ||
        latestRequest?.totalIndividuals ||
        latestRequest?.totals?.totalAffected ||
        latestRequest?.totals?.individuals ||
        latestRequest?.summary?.totalAffected ||
        journey.summary?.totalAffected ||
        journey.summary?.totalIndividuals ||
        rowTotal ||
        0
    );
  }, [activeRequestRowsForDisplay, latestRequest, journey.summary]);

  const displayVulnerableCount = useMemo(() => {
    const rowTotal = activeRequestRowsForDisplay.reduce(
      (sum, row) =>
        sum +
        Number(row.pwd || 0) +
        Number(row.pregnant || 0) +
        Number(row.senior || 0),
      0
    );

    return Number(
      latestRequest?.vulnerableCount ||
        latestRequest?.totalVulnerable ||
        latestRequest?.totals?.vulnerableCount ||
        latestRequest?.totals?.totalVulnerable ||
        latestRequest?.summary?.vulnerableCount ||
        journey.summary?.vulnerableCount ||
        journey.summary?.totalVulnerable ||
        rowTotal ||
        0
    );
  }, [activeRequestRowsForDisplay, latestRequest, journey.summary]);

  const evacNameMap = useMemo(() => {
    const map = new Map();

    bootstrapRows.forEach((row) => {
      const normalizedName = normalizeValue(row.evacuationCenterName);
      if (normalizedName) {
        map.set(normalizedName, createPreparedRow(row));
      }
    });

    return map;
  }, [bootstrapRows]);

  const totals = useMemo(() => {
    return activeRows.reduce(
      (acc, row) => {
        acc.households += Number(row.households || 0);
        acc.families += Number(row.families || 0);
        acc.male += Number(row.male || 0);
        acc.female += Number(row.female || 0);
        acc.lgbtq += Number(row.lgbtq || 0);
        acc.pwd += Number(row.pwd || 0);
        acc.pregnant += Number(row.pregnant || 0);
        acc.senior += Number(row.senior || 0);
        acc.requestedFoodPacks += Number(row.requestedFoodPacks || 0);
        return acc;
      },
      {
        households: 0,
        families: 0,
        male: 0,
        female: 0,
        lgbtq: 0,
        pwd: 0,
        pregnant: 0,
        senior: 0,
        requestedFoodPacks: 0
      }
    );
  }, [activeRows]);

  const includesFoodPacks = hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS);
  const includesMonetary = hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY);
  const includesAppliance = hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE);
  const activeJourneySupportTypes = useMemo(
    () =>
      journey?.request
        ? getDeclaredSupportTypes(journey.request)
        : supportTypes,
    [journey?.request, supportTypes]
  );
  const journeyUsesStandaloneMonetary = useMemo(
    () =>
      activeJourneySupportTypes.length === 1 &&
      activeJourneySupportTypes.includes(SUPPORT_TYPE_MONETARY),
    [activeJourneySupportTypes]
  );
  const journeySteps = useMemo(
    () =>
      STAGE_STEPS.map((step) => {
        if (step.key === 'review') {
          return {
            ...step,
            hint: journeyUsesStandaloneMonetary ? 'Waiting for Admin' : 'Waiting for DRRMO'
          };
        }

        if (step.key === 'to_receive') {
          return {
            ...step,
            label: journeyUsesStandaloneMonetary ? 'Receive Aid' : 'Receive Goods'
          };
        }

        return step;
      }),
    [journeyUsesStandaloneMonetary]
  );

  const totalIndividuals = useMemo(() => {
    return (
      totals.male +
      totals.female +
      totals.lgbtq +
      totals.pwd +
      totals.pregnant +
      totals.senior
    );
  }, [totals]);

  const vulnerableCount = useMemo(
    () => totals.pwd + totals.pregnant + totals.senior,
    [totals]
  );

  const hasInvalidRows = useMemo(() => {
    if (!preparedRows.length) return true;

    const enabledRows = preparedRows.filter((row) => row.isActiveRow);
    if (!enabledRows.length) return true;

    return enabledRows.some((row) => {
      if (!String(row.evacuationCenterName || '').trim()) return true;

      return numberFields.some((field) => {
        const value = Number(row[field]);
        return Number.isNaN(value) || value < 0;
      });
    });
  }, [preparedRows]);

  const requestedMonetaryValue = useMemo(
    () => parseSafeNumber(requestedMonetaryAmount),
    [requestedMonetaryAmount]
  );

  const normalizedRequestedAppliances = useMemo(
    () => requestedAppliances.map((item) => createRequestedAppliance(item)),
    [requestedAppliances]
  );

  const validRequestedAppliances = useMemo(
    () =>
      normalizedRequestedAppliances.filter(
        (item) =>
          item.itemName.trim() &&
          item.category.trim() &&
          parseSafeNumber(item.quantityRequested) > 0
      ),
    [normalizedRequestedAppliances]
  );

  const inlineErrors = useMemo(() => {
    const errors = {};

    if (!supportTypes.length) {
      errors.supportTypes = 'Select at least one support type.';
    } else if (isMonetaryMixedWithOtherSupport(supportTypes)) {
      errors.supportTypes = 'Monetary requests must be submitted separately from food packs or appliances.';
    }

    if (!sanitizeInlineText(disaster, { maxLength: 160 }).trim()) {
      errors.disaster = 'Disaster or incident is required.';
    }

    if (!requestDate) {
      errors.requestDate = 'Request date is required.';
    } else if (requestDate < minAllowedDate) {
      errors.requestDate = 'Request date cannot be in the past.';
    }

    if (includesMonetary && requestedMonetaryValue <= 0) {
      errors.requestedMonetaryAmount = 'Enter a valid monetary amount.';
    }

    if (includesMonetary && !sanitizeInlineText(remarks, { maxLength: 800, multiline: true }).trim()) {
      errors.remarks = 'Remarks are required when monetary support is included.';
    }

    if (includesFoodPacks && Number(totals.requestedFoodPacks || 0) <= 0) {
      errors.requestedFoodPacks = 'Add requested food packs in at least one active row.';
    }

    if (includesAppliance) {
      if (!normalizedRequestedAppliances.length) {
        errors.requestedAppliances = 'Add at least one appliance request item.';
      } else {
        const hasAnyStartedRow = normalizedRequestedAppliances.some(
          (item) =>
            item.itemName.trim() ||
            item.category.trim() ||
            String(item.quantityRequested || '').trim() ||
            item.remarks.trim()
        );

      if (!hasAnyStartedRow) {
        errors.requestedAppliances = 'Add at least one appliance request item.';
      } else if (validRequestedAppliances.length !== normalizedRequestedAppliances.length) {
        errors.requestedAppliances =
          'Complete each appliance row with item name, category, and quantity.';
        }
      }
    }

    return errors;
  }, [
    supportTypes,
    disaster,
    requestDate,
    minAllowedDate,
    includesMonetary,
    requestedMonetaryValue,
    remarks,
    includesFoodPacks,
    totals.requestedFoodPacks,
    includesAppliance,
    normalizedRequestedAppliances,
    validRequestedAppliances.length
  ]);

  const hasInvalidDemand = useMemo(() => {
    return Object.keys(inlineErrors).length > 0;
  }, [inlineErrors]);

  const baselineSource = useMemo(() => {
    if (editMode && editingRequest) {
      return {
        disaster: editingRequest.disaster || '',
        supportTypes: getSupportTypesFromRequest(editingRequest),
        requestedMonetaryAmount: String(
          editingRequest?.totals?.requestedMonetaryAmount || ''
        ),
        requestedAppliances: (Array.isArray(editingRequest?.requestedAppliances) &&
        editingRequest.requestedAppliances.length
          ? editingRequest.requestedAppliances
          : [createRequestedAppliance()]
        ).map((item) => createRequestedAppliance(item)),
        requestDate: editingRequest.requestDate
          ? new Date(editingRequest.requestDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        remarks: editingRequest.remarks || '',
        rows: buildRowsFromRequest(editingRequest)
      };
    }

    if (
      journey.request &&
      (journey.canEdit ||
        normalizeStatus(journey.request?.status) === 'rejected' ||
        normalizeStatus(journey.stage) === 'rejected')
    ) {
      return {
        disaster: journey.request.disaster || '',
        supportTypes: getSupportTypesFromRequest(journey.request),
        requestedMonetaryAmount: String(
          journey.request?.totals?.requestedMonetaryAmount || ''
        ),
        requestedAppliances: (Array.isArray(journey.request?.requestedAppliances) &&
        journey.request.requestedAppliances.length
          ? journey.request.requestedAppliances
          : [createRequestedAppliance()]
        ).map((item) => createRequestedAppliance(item)),
        requestDate: journey.request.requestDate
          ? new Date(journey.request.requestDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        remarks: journey.request.remarks || '',
        rows: buildRowsFromRequest(journey.request)
      };
    }

    return {
      disaster: '',
      supportTypes: [SUPPORT_TYPE_FOODPACKS],
      requestedMonetaryAmount: '',
      requestedAppliances: [createRequestedAppliance()],
      requestDate: new Date().toISOString().slice(0, 10),
      remarks: '',
      rows: bootstrapRows.map((row) => createPreparedRow(row))
    };
  }, [
    editMode,
    editingRequest,
    journey.request,
    journey.canEdit,
    journey.stage,
    bootstrapRows
  ]);

  const isDirty = useMemo(() => {
    const current = JSON.stringify({
      disaster: sanitizeInlineText(disaster, { maxLength: 160 }).trim(),
      supportTypes: normalizeSupportTypes(supportTypes),
      requestedMonetaryAmount: String(requestedMonetaryAmount || ''),
      requestedAppliances: requestedAppliances.map((item) =>
        createRequestedAppliance(item)
      ),
      requestDate,
      remarks: sanitizeInlineText(remarks, { maxLength: 800, multiline: true }).trim(),
      rows: serializeRowsForCompare(preparedRows)
    });

    const baseline = JSON.stringify({
      disaster: sanitizeInlineText(baselineSource.disaster || '', {
        maxLength: 160
      }).trim(),
      supportTypes: normalizeSupportTypes(baselineSource.supportTypes),
      requestedMonetaryAmount: String(
        baselineSource.requestedMonetaryAmount || ''
      ),
      requestedAppliances: (baselineSource.requestedAppliances || []).map((item) =>
        createRequestedAppliance(item)
      ),
      requestDate: baselineSource.requestDate,
      remarks: sanitizeInlineText(baselineSource.remarks || '', {
        maxLength: 800,
        multiline: true
      }).trim(),
      rows: serializeRowsForCompare(baselineSource.rows || [])
    });

    return current !== baseline;
  }, [
    disaster,
    supportTypes,
    requestedMonetaryAmount,
    requestedAppliances,
    requestDate,
    remarks,
    preparedRows,
    baselineSource
  ]);

  const isEditingExisting = Boolean(editMode || requestId);
  const isSubmitDisabled =
    submitting ||
    loadingPage ||
    !barangayName.trim() ||
    !disaster.trim() ||
    !requestDate ||
    !preparedRows.length ||
    hasInvalidRows ||
    hasInvalidDemand ||
    (isEditingExisting && !isDirty);

  const hasCompletedReceiptState = useMemo(() => {
    const normalizedStage = normalizeStatus(journey?.stage);
    const normalizedRequestStatus = normalizeStatus(latestRequest?.status);

    return (
      Number(journey.summary?.receivedReleases || 0) > 0 ||
      Boolean(journey.summary?.receivedAt || latestRequest?.receivedAt) ||
      normalizedStage === 'completed' ||
      normalizedRequestStatus === 'received' ||
      normalizedRequestStatus === 'completed'
    );
  }, [
    journey?.stage,
    journey.summary?.receivedReleases,
    journey.summary?.receivedAt,
    latestRequest?.status,
    latestRequest?.receivedAt
  ]);

  const dafacAidVisibility = useMemo(
    () =>
      dafacDistributionUtils.getDafacAidVisibility({
        supportTypes: distributionState.request
          ? getDeclaredSupportTypes(distributionState.request)
          : displaySupportTypes,
        caps: distributionState.caps || {}
      }),
    [distributionState.request, distributionState.caps, displaySupportTypes]
  );

  const accomplishedDistributionSummary = useMemo(
    () =>
      dafacDistributionUtils.buildAccomplishedDistributionSummary({
        supportTypes: distributionState.request
          ? getDeclaredSupportTypes(distributionState.request)
          : displaySupportTypes,
        caps: distributionState.caps || {},
        records: distributionState.records || []
      }),
    [distributionState.request, distributionState.caps, distributionState.records, displaySupportTypes]
  );

  const hasAnyDistributionRecords = useMemo(
    () => Array.isArray(distributionState.records) && distributionState.records.length > 0,
    [distributionState.records]
  );

  const isAccomplishedReady = useMemo(() => {
    if (!latestRequest?._id || !hasCompletedReceiptState) return false;

    const completedCount = Number(accomplishedDistributionSummary.completedCount || 0);
    if (completedCount <= 0) return false;

    const visibility = accomplishedDistributionSummary.visibility || {};
    const totals = accomplishedDistributionSummary.totals || {};

    const foodReady =
      !visibility.showsFoodPacks || Number(totals.foodPacksRemaining || 0) <= 0;
    const monetaryReady =
      !visibility.showsMonetary || Number(totals.monetaryRemaining || 0) <= 0;
    const applianceReady =
      !visibility.showsAppliances ||
      Number(totals.applianceUnitsRemaining || 0) <= 0;

    return foodReady && monetaryReady && applianceReady;
  }, [latestRequest?._id, hasCompletedReceiptState, accomplishedDistributionSummary]);

  useEffect(() => {
    const requestStage = normalizeStage(
      distributionState.request?.currentStage || latestRequest?.currentStage || journey?.stage
    );
    setDistributionConfirmed(requestStage === 'accomplished');
  }, [distributionState.request?.currentStage, latestRequest?.currentStage, journey?.stage]);
    

  useEffect(() => {
    if (isAccomplishedReady) {
      return;
    }

    if (distributionConfirmed) {
      setDistributionConfirmed(false);
    }
  }, [distributionConfirmed, isAccomplishedReady]);


  const stageMeta = useMemo(() => {
    if (editMode || showEditor) return getStageMeta('preparation');
    if (!latestRequest) return getStageMeta('preparation');
    if (normalizeStage(distributionState.request?.currentStage || latestRequest?.currentStage || journey.stage) === 'accomplished') {
      return {
        label: 'Accomplished Report',
        tone: 'completed',
        activeStep: 7,
        completedSteps: 6
      };
    }

    if (normalizeStage(distributionState.request?.currentStage || latestRequest?.currentStage || journey.stage) === 'accomplished') {
      return {
        label: 'Accomplished Report',
        tone: 'completed',
        activeStep: 7,
        completedSteps: 6
      };
    }

    if (hasCompletedReceiptState) {
      if (isAccomplishedReady && distributionConfirmed) {
        return {
          label: 'Accomplished Report',
          tone: 'completed',
          activeStep: 7,
          completedSteps: 6
        };
      }

      return {
        label: 'DAFAC Distribution',
        tone: hasAnyDistributionRecords ? 'approved' : 'released',
        activeStep: 6,
        completedSteps: 5
      };
    }
    return getStageMeta(journey.stage);
  }, [
    editMode,
    showEditor,
    latestRequest,
    distributionState.request?.currentStage,
    distributionState.request?.currentStage,
    hasCompletedReceiptState,
    journey.stage,
    hasAnyDistributionRecords,
    isAccomplishedReady,
    distributionConfirmed
  ]);

  const requestStatusLabel = useMemo(() => {
    const normalizedStage = normalizeStatus(journey?.stage);
    const normalizedRequestStatus = normalizeStatus(latestRequest?.status);

    if (
      normalizedStage === 'pending_review' ||
      normalizedRequestStatus === 'pending' ||
      normalizedRequestStatus === 'pending_review'
    ) {
      return 'For Review';
    }

    if (
      normalizedStage === 'approved_waiting_release' ||
      normalizedRequestStatus === 'approved'
    ) {
      return 'Approved';
    }

    if (
      normalizedStage === 'released_waiting_receipt' ||
      normalizedStage === 'partially_released'
    ) {
      return 'Receive Goods';
    }

    if (
      normalizedStage === 'completed' ||
      normalizedRequestStatus === 'received' ||
      normalizedRequestStatus === 'completed'
    ) {
      return 'Received';
    }

    if (normalizedStage === 'rejected' || normalizedRequestStatus === 'rejected') {
      return 'Rejected';
    }

    if (
      normalizedStage === 'cancelled' ||
      normalizedStage === 'canceled' ||
      normalizedRequestStatus === 'cancelled' ||
      normalizedRequestStatus === 'canceled'
    ) {
      return 'Prepare';
    }

    return stageMeta.label || 'Prepare';
  }, [journey?.stage, latestRequest?.status, stageMeta.label]);

  const canShowRequestAgainButton = useMemo(() => {

    const currentRequestStage = normalizeStage(
      distributionState.request?.currentStage || latestRequest?.currentStage || journey?.stage
    );

    if (currentRequestStage === 'accomplished' || stageMeta.activeStep === 7) {
      return true;
    }


    if (hasCompletedReceiptState) return false;
    if (stageMeta.activeStep >= 5) return false;
    if (journey.canRequestAgain) return true;
    if (!latestRequest) return true;


    const normalizedStatus = normalizeStatus(latestRequest?.status);
    const normalizedStage = normalizeStatus(journey?.stage);

    return (
      ['completed', 'received', 'rejected', 'cancelled', 'canceled'].includes(
        normalizedStatus
      ) ||
        ['completed', 'received', 'rejected', 'cancelled', 'canceled'].includes(
          normalizedStage
        )
      );
    }, [
      distributionState.request?.currentStage,
      journey.canRequestAgain,
      journey.stage,
      latestRequest,
      hasCompletedReceiptState,
      stageMeta.activeStep
    ]);

  const decisionRemarks = useMemo(() => {
    return (
      String(journey.summary?.decisionRemarks || '').trim() ||
      String(journey.summary?.rejectionRemarks || '').trim() ||
      String(latestRequest?.rejectionReason || '').trim() ||
      String(latestRequest?.rejectionRemarks || '').trim() ||
      String(latestRequest?.decisionRemarks || '').trim() ||
      String(latestRequest?.approvalRemarks || '').trim() ||
      String(latestRequest?.reviewRemarks || '').trim()
    );
  }, [journey.summary, latestRequest]);

  const isRejectedJourney = useMemo(() => {
    return (
      normalizeStatus(journey?.stage) === 'rejected' ||
      normalizeStatus(latestRequest?.status) === 'rejected' ||
      Boolean(journey.summary?.isRejected)
    );
  }, [journey?.stage, latestRequest?.status, journey.summary?.isRejected]);

  const releaseRecords = useMemo(() => {
    const raw = [
      ...(Array.isArray(journey.releases) ? journey.releases : []),
      ...(Array.isArray(latestRequest?.releases) ? latestRequest.releases : []),
      ...(Array.isArray(latestRequest?.reliefReleases) ? latestRequest.reliefReleases : []),
      ...(Array.isArray(latestRequest?.releaseHistory) ? latestRequest.releaseHistory : []),
      ...(latestRequest?.release ? [latestRequest.release] : [])
    ].filter(Boolean);

    const seen = new Set();

    return raw.filter((entry) => {
      const key =
        entry?._id ||
        entry?.id ||
        entry?.releaseNo ||
        `${entry?.createdAt || ''}-${entry?.updatedAt || ''}`;

      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [journey.releases, latestRequest]);

  const receivedReleaseRecords = useMemo(() => {
    return releaseRecords.filter((release) => {
      const status = normalizeStatus(
        release?.status ||
          release?.releaseStatus ||
          release?.receiveStatus ||
          release?.receiptStatus ||
          release?.acknowledgementStatus
      );

      return (
        Boolean(
          release?.receivedAt ||
            release?.dateReceived ||
            release?.acknowledgedAt ||
            release?.receiptDate
        ) ||
        status === 'received' ||
        status === 'completed'
      );
    });
  }, [releaseRecords]);

  const pendingReleaseRecords = useMemo(() => {
    return releaseRecords.filter((release) => {
      const status = normalizeStatus(
        release?.status ||
          release?.releaseStatus ||
          release?.receiveStatus ||
          release?.receiptStatus ||
          release?.acknowledgementStatus
      );

      return status !== 'received' && status !== 'completed' && status !== 'cancelled';
    });
  }, [releaseRecords]);

  const hasReceiptCompletionSignal = useMemo(() => {
    const normalizedStage = normalizeStatus(journey?.stage);
    const normalizedStatus = normalizeStatus(latestRequest?.status);

    return (
      receivedReleaseRecords.length > 0 ||
      Number(journey.summary?.receivedReleases || 0) > 0 ||
      Boolean(journey.summary?.receivedAt || latestRequest?.receivedAt) ||
      normalizedStage === 'completed' ||
      normalizedStatus === 'received' ||
      normalizedStatus === 'completed'
    );
  }, [
    receivedReleaseRecords.length,
    journey?.stage,
    journey.summary?.receivedReleases,
    journey.summary?.receivedAt,
    latestRequest?.status,
    latestRequest?.receivedAt
  ]);

  const receivedItems = useMemo(() => {
    const hasReceiptEvidence =
      receivedReleaseRecords.length > 0 ||
      Number(journey.summary?.receivedReleases || 0) > 0 ||
      Boolean(journey.summary?.receivedAt || latestRequest?.receivedAt);

    const sourceRecords =
      receivedReleaseRecords.length > 0
        ? receivedReleaseRecords
        : hasReceiptEvidence || normalizeStatus(journey?.stage) === 'completed'
          ? releaseRecords
          : [];

    return sourceRecords.flatMap((release) => {
      const releaseDate =
        release?.receivedAt ||
        release?.dateReceived ||
        release?.acknowledgedAt ||
        release?.receiptDate ||
        release?.updatedAt ||
        release?.createdAt ||
        null;

      const releaseLabel = release?.releaseNo || release?.referenceNo || release?._id || '-';

      return (Array.isArray(release?.items) ? release.items : []).map((item, index) => {
        const quantity =
          item?.quantityReceived ??
          item?.quantityReleased ??
          item?.quantity ??
          item?.packsReceived ??
          item?.packsReleased ??
          0;

        const amount =
          item?.amountReceived ??
          item?.amountReleased ??
          item?.amount ??
          0;

        return {
          key: `${releaseLabel}-${item?._id || item?.inventoryItemId || item?.itemName || index}`,
          itemName: item?.itemName || item?.name || 'Unnamed item',
          category: item?.category || '-',
          unit: item?.unit || (amount ? 'PHP' : '-'),
          quantity: Number(quantity || 0),
          amount: Number(amount || 0),
          remarks: item?.remarks || release?.remarks || '-',
          releaseLabel,
          releaseDate
        };
      });
    });
  }, [
    receivedReleaseRecords,
    releaseRecords,
    journey?.stage,
    journey.summary?.receivedReleases,
    journey.summary?.receivedAt,
    latestRequest?.receivedAt
  ]);

  const releasedItems = useMemo(() => {
    return pendingReleaseRecords.flatMap((release) => {
      const releaseDate =
        release?.updatedAt ||
        release?.createdAt ||
        release?.releasedAt ||
        release?.dateReleased ||
        null;

      const releaseLabel = release?.releaseNo || release?.referenceNo || release?._id || '-';

      return (Array.isArray(release?.items) ? release.items : []).map((item, index) => {
        const quantity =
          item?.quantityReleased ??
          item?.quantityReceived ??
          item?.quantity ??
          item?.packsReleased ??
          item?.packsReceived ??
          0;

        const amount =
          item?.amountReleased ??
          item?.amountReceived ??
          item?.amount ??
          0;

        return {
          key: `${releaseLabel}-${item?._id || item?.inventoryItemId || item?.itemName || index}`,
          itemName: item?.itemName || item?.name || 'Unnamed item',
          category: item?.category || '-',
          unit: item?.unit || (amount ? 'PHP' : '-'),
          quantity: Number(quantity || 0),
          amount: Number(amount || 0),
          remarks: item?.remarks || release?.remarks || '-',
          releaseLabel,
          releaseDate
        };
      });
    });
  }, [pendingReleaseRecords]);

  const receivedSummary = useMemo(() => {
    const sourceRecords =
      receivedReleaseRecords.length > 0
        ? receivedReleaseRecords
        : normalizeStatus(journey?.stage) === 'completed'
          ? releaseRecords
          : [];

    const latestReceivedAt = sourceRecords.reduce((latest, release) => {
      const value =
        release?.receivedAt ||
        release?.dateReceived ||
        release?.acknowledgedAt ||
        release?.receiptDate ||
        null;

      if (!value) return latest;
      if (!latest) return value;

      return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, null);

    const totalFoodPacks = sourceRecords.reduce((sum, release) => {
      const packs =
        release?.packsReceived ??
        release?.receivedFoodPacks ??
        release?.foodPacksReceived ??
        release?.packsReleased ??
        release?.releasedFoodPacks ??
        release?.foodPacksReleased ??
        0;

      return sum + Number(packs || 0);
    }, 0);

    const totalQuantity = receivedItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const totalAmount = receivedItems.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const releaseLevelAmount = sourceRecords.reduce((sum, release) => {
      const amount =
        release?.receivedMonetaryAmount ??
        release?.releasedMonetaryAmount ??
        release?.amountReceived ??
        release?.amountReleased ??
        0;

      return sum + Number(amount || 0);
    }, 0);

    const totalApplianceUnits = receivedItems.reduce((sum, item) => {
      const category = normalizeStatus(item?.category);
      return sum + (category.includes('appliance') ? Number(item.quantity || 0) : 0);
    }, 0);

    return {
      releaseCount: sourceRecords.length,
      latestReceivedAt,
      totalFoodPacks,
      itemLines: receivedItems.length,
      totalQuantity,
      totalAmount: totalAmount || releaseLevelAmount,
      totalApplianceUnits
    };
  }, [receivedReleaseRecords, releaseRecords, receivedItems, journey?.stage]);

  const displayReceivedPacks = useMemo(() => {
    return Number(
      journey.summary?.receivedFoodPacks ||
        receivedSummary.totalFoodPacks ||
        0
    );
  }, [journey.summary?.receivedFoodPacks, receivedSummary.totalFoodPacks]);

  const receiptProofItems = useMemo(() => {
    const proofSource =
      receivedReleaseRecords.length > 0
        ? receivedReleaseRecords
        : normalizeStatus(journey?.stage) === 'completed'
          ? releaseRecords
          : [];

    return proofSource.flatMap((release, releaseIndex) =>
      (Array.isArray(release?.receiptProofFiles) ? release.receiptProofFiles : [])
        .filter(Boolean)
        .map((proofPath, proofIndex) => ({
          key: `${release?._id || releaseIndex}-${proofIndex}`,
          url: `${BASE_URL}/${String(proofPath).replace(/^\/+/, '')}`,
          label: `Receipt Proof ${proofIndex + 1}`
        }))
    );
  }, [receivedReleaseRecords, releaseRecords, journey?.stage]);

  const releaseProofItems = useMemo(() => {
    const proofSource = releaseRecords.length > 0 ? releaseRecords : [];

    return proofSource.flatMap((release, releaseIndex) =>
      (Array.isArray(release?.proofFiles) ? release.proofFiles : [])
        .filter(Boolean)
        .map((proofPath, proofIndex) => ({
          key: `release-${release?._id || releaseIndex}-${proofIndex}`,
          url: buildProofFileHref(proofPath, BASE_URL),
          sourceValue: proofPath,
          label: `Release Proof ${proofIndex + 1}`
        }))
    );
  }, [releaseRecords]);

  useEffect(() => {
    if (hasReceiptCompletionSignal || !latestRequest?._id) {
      setReceiptProofFiles([]);
    }
  }, [hasReceiptCompletionSignal, latestRequest?._id]);

  const shouldShowReceivedSection = useMemo(() => {
    const normalizedStage = normalizeStatus(journey?.stage);
    const normalizedStatus = normalizeStatus(latestRequest?.status);

    return (
      normalizedStage === 'released_waiting_receipt' ||
      normalizedStage === 'partially_released' ||
      normalizedStage === 'completed' ||
      normalizedStatus === 'received' ||
      normalizedStatus === 'completed'
    );
  }, [journey?.stage, latestRequest?.status]);

  const shouldShowDistributionSection = useMemo(
    () => Boolean(latestRequest?._id && hasCompletedReceiptState),
    [latestRequest?._id, hasCompletedReceiptState]
  );

  const shouldShowAccomplishedSection = useMemo(
    () => Boolean(shouldShowDistributionSection && isAccomplishedReady && distributionConfirmed),
    [shouldShowDistributionSection, isAccomplishedReady, distributionConfirmed]
  );

  const displayDeliveryItems = useMemo(() => {
    const hasConfirmedReceipt =
      receivedReleaseRecords.length > 0 ||
      Number(journey.summary?.receivedReleases || 0) > 0 ||
      Boolean(journey.summary?.receivedAt || latestRequest?.receivedAt) ||
      normalizeStatus(journey?.stage) === 'completed' ||
      normalizeStatus(latestRequest?.status) === 'received' ||
      normalizeStatus(latestRequest?.status) === 'completed';

    if (!hasConfirmedReceipt && releasedItems.length > 0) {
      return releasedItems;
    }

    if (receivedItems.length > 0) {
      return receivedItems;
    }

    return releasedItems;
  }, [
    receivedReleaseRecords.length,
    journey.summary?.receivedReleases,
    journey.summary?.receivedAt,
    latestRequest?.receivedAt,
    journey?.stage,
    latestRequest?.status,
    receivedItems,
    releasedItems
  ]);

  const isReceiptConfirmed = useMemo(() => {
    return hasReceiptCompletionSignal;
  }, [hasReceiptCompletionSignal]);

  const canShowConfirmReceivedAction = useMemo(() => {
    return shouldShowConfirmReceivedAction({
      canReceiveAnyRelease: journey.canReceiveAnyRelease,
      stage: journey.stage,
      requestStatus: latestRequest?.status,
      releaseRecords,
      hasReceiptEvidence: isReceiptConfirmed
    });
  }, [journey.canReceiveAnyRelease, journey.stage, latestRequest?.status, releaseRecords, isReceiptConfirmed]);

  const receiptPanelSummary = useMemo(() => {
    const showingReleasedForConfirmation =
      !isReceiptConfirmed &&
      displayDeliveryItems.length > 0;

    const latestActivityAt = displayDeliveryItems.reduce((latest, item) => {
      const value = item?.releaseDate || null;

      if (!value) return latest;
      if (!latest) return value;

      return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, null);

    const totalFoodPacks = showingReleasedForConfirmation
      ? displayDeliveryItems.reduce((sum, item) => {
          const category = normalizeStatus(item?.category);
          const isFoodPackLike =
            category.includes('food') ||
            category.includes('canned') ||
            category.includes('goods');
          return sum + (isFoodPackLike ? Number(item?.quantity || 0) : 0);
        }, 0)
      : displayReceivedPacks;

    const totalQuantity = displayDeliveryItems.reduce(
      (sum, item) => sum + Number(item?.quantity || 0),
      0
    );

    const itemLevelAmount = displayDeliveryItems.reduce(
      (sum, item) => sum + Number(item?.amount || 0),
      0
    );

    const amountSourceRecords = showingReleasedForConfirmation
      ? pendingReleaseRecords
      : receivedReleaseRecords.length > 0
        ? receivedReleaseRecords
        : releaseRecords;

    const releaseLevelAmount = amountSourceRecords.reduce((sum, release) => {
      const amount = showingReleasedForConfirmation
        ? release?.releasedMonetaryAmount ??
          release?.amountReleased ??
          0
        : release?.receivedMonetaryAmount ??
          release?.releasedMonetaryAmount ??
          release?.amountReceived ??
          release?.amountReleased ??
          0;

      return sum + Number(amount || 0);
    }, 0);

    const totalApplianceUnits = displayDeliveryItems.reduce((sum, item) => {
      const category = normalizeStatus(item?.category);
      return sum + (category.includes('appliance') ? Number(item?.quantity || 0) : 0);
    }, 0);

    const totalAmount = showingReleasedForConfirmation
      ? itemLevelAmount || releaseLevelAmount
      : receivedSummary.totalAmount || itemLevelAmount || releaseLevelAmount;

    return {
      showingReleasedForConfirmation,
      totalFoodPacks,
      totalQuantity,
      totalApplianceUnits,
      totalAmount,
      itemLines: displayDeliveryItems.length,
      latestActivityAt:
        latestActivityAt || receivedSummary.latestReceivedAt || null,
    };
  }, [
    displayDeliveryItems,
    displayReceivedPacks,
    isReceiptConfirmed,
    pendingReleaseRecords,
    receivedReleaseRecords,
    releaseRecords,
    receivedSummary.totalAmount,
    receivedSummary.latestReceivedAt
  ]);

  const clearFeedback = () => {
    setFormFeedback({ type: '', message: '' });
    setDistributionImportIssues([]);
  };

  const receiptProofPreviews = useMemo(
    () =>
      receiptProofFiles.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        url: URL.createObjectURL(file)
      })),
    [receiptProofFiles]
  );

  useEffect(
    () => () => {
      receiptProofPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [receiptProofPreviews]
  );

  const setSuccessFeedback = (message) => {
    setFormFeedback({ type: 'success', message });
  };

  const setErrorFeedback = (message) => {
    setFormFeedback({ type: 'error', message });
  };

  const handleReceiptProofSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) =>
      String(file?.type || '').startsWith('image/')
    );

    if (!selectedFiles.length) {
      setErrorFeedback('Select at least one image file for receipt proof.');
      return;
    }

    setReceiptProofFiles(selectedFiles.slice(0, 5));
  };

  const removeReceiptProofFile = (indexToRemove) => {
    setReceiptProofFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const resetDistributionConfirmation = useCallback(() => {
    setDistributionConfirmed(false);
  }, []);




  
  const handleConfirmDistributionStep = useCallback(async () => {
    if (!isAccomplishedReady || !latestRequest?._id) {
      setErrorFeedback('Complete the DAFAC distribution totals first before confirming.');
      return;
    }

    try {
      setSubmittingAction(true);
      clearFeedback();

      const res = await fetch(
        `${BASE_URL}/api/relief-distributions/${latestRequest._id}/confirm-accomplished`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to confirm the accomplished report.');
      }

      setDistributionConfirmed(true);
      setSuccessFeedback(
        data?.message || 'DAFAC distribution confirmed. You can now review the accomplished report.'
      );
      await loadJourneyData({ silent: true });
      await loadDistributionData({ silent: true });
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to confirm the accomplished report.');
    } finally {
      setSubmittingAction(false);
    }
  }, [isAccomplishedReady, latestRequest?._id, loadDistributionData, loadJourneyData]);


  const updateDistributionEditorCard = (localId, updater) => {
    setDistributionEditorCards((prev) =>
      prev.map((card) => {
        if (card.localId !== localId) return card;
        return {
          ...card,
          draft: updater(card.draft)
        };
      })
    );
  };

  const openCreateDistributionEditor = () => {
    setDistributionEditorCards((prev) => [...prev, createDistributionEditorCard({}, 'create')]);
  };

  const openEditDistributionEditor = (record) => {
    setDistributionEditorCards((prev) => {
      const existingIndex = prev.findIndex(
        (card) => card.mode === 'edit' && card.sourceRecordId === record?._id
      );

      if (existingIndex >= 0) {
        return prev;
      }

      return [createDistributionEditorCard(record, 'edit'), ...prev];
    });
  };

  const closeDistributionEditor = (localId) => {
    if (!localId) {
      setDistributionEditorCards([]);
      return;
    }

    setDistributionEditorCards((prev) => prev.filter((card) => card.localId !== localId));
  };

  const handleDistributionDraftField = (localId, path, value) => {
    updateDistributionEditorCard(localId, (prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let cursor = next;

      for (let index = 0; index < keys.length - 1; index += 1) {
        cursor = cursor[keys[index]];
      }

      cursor[keys[keys.length - 1]] =
        path === 'distributionDate' ? clampToTodayOrFutureDate(value) : value;
      return next;
    });
  };

  const handleDistributionMemberChange = (localId, index, field, value) => {
    updateDistributionEditorCard(localId, (prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.map((member, memberIndex) =>
        memberIndex === index
          ? {
              ...member,
              [field]:
                field === 'age'
                  ? sanitizeWholeNumberInput(value)
                  : sanitizeInlineText(value, {
                      maxLength:
                        field === 'remarks'
                          ? 120
                          : field === 'fullName'
                            ? 120
                            : field === 'relationshipToHead'
                              ? 80
                              : 60,
                      multiline: field === 'remarks'
                    })
            }
          : member
      )
    }));
  };

  const addDistributionMember = (localId) => {
    updateDistributionEditorCard(localId, (prev) => ({
      ...prev,
      familyMembers: [...prev.familyMembers, createDistributionFamilyMember()]
    }));
  };

  const removeDistributionMember = (localId, index) => {
    updateDistributionEditorCard(localId, (prev) => ({
      ...prev,
      familyMembers:
        prev.familyMembers.length > 1
          ? prev.familyMembers.filter((_, memberIndex) => memberIndex !== index)
          : [createDistributionFamilyMember()]
    }));
  };

  const openConfirmation = ({ title, message, action, payload = null }) => {
    setConfirmState({
      open: true,
      title,
      message,
      action,
      payload
    });
  };

  const closeConfirmation = () => {
    setConfirmState({
      open: false,
      title: '',
      message: '',
      action: '',
      payload: null
    });
  };

  const distributionGridState = useMemo(() => {
    const editEditorByRecordId = new Map();
    const createEditorEntries = [];

    (distributionEditorCards || []).forEach((editorCard) => {
      const entry = {
        type: 'editor',
        key: `editor-${editorCard.localId}`,
        editorCard
      };

      if (editorCard.mode === 'edit' && editorCard.sourceRecordId) {
        editEditorByRecordId.set(editorCard.sourceRecordId, entry);
        return;
      }

      createEditorEntries.push(entry);
    });

    const savedEntries = (distributionState.records || []).map((record) => {
      const recordId = record?._id || '';
      if (recordId && editEditorByRecordId.has(recordId)) {
        return editEditorByRecordId.get(recordId);
      }

      return {
        type: 'saved',
        key: `saved-${recordId || record.serialNo}`,
        record
      };
    });

    const entries = [...savedEntries, ...createEditorEntries];
    const pageSize = 3;
    const totalPages = Math.max(1, Math.floor(entries.length / pageSize) + 1);
    const page = Math.min(Math.max(1, distributionPage), totalPages);
    const startIndex = (page - 1) * pageSize;
    const visibleEntries = entries.slice(startIndex, startIndex + pageSize);
    const addCardCount =
      page === totalPages ? Math.max(1, pageSize - visibleEntries.length) : 0;

    return {
      page,
      totalPages,
      entries: visibleEntries,
      addCardCount
    };
  }, [distributionState.records, distributionEditorCards, distributionPage]);

  useEffect(() => {
    if (distributionPage !== distributionGridState.page) {
      setDistributionPage(distributionGridState.page);
    }
  }, [distributionPage, distributionGridState.page]);

  const buildDistributionPayload = (draft) => {
    const sourceDraft = draft || createDistributionDraft();
    const familyMembers = (sourceDraft.familyMembers || [])
      .map((member) => ({
        fullName: sanitizeInlineText(member.fullName, { maxLength: 120 }).trim(),
        relationshipToHead: sanitizeInlineText(member.relationshipToHead, {
          maxLength: 80
        }).trim(),
        age: parseSafeNumber(member.age),
        sex: sanitizeInlineText(member.sex, { maxLength: 24 }).trim(),
        education: sanitizeInlineText(member.education, { maxLength: 60 }).trim(),
        occupationalSkills: sanitizeInlineText(member.occupationalSkills, {
          maxLength: 80
        }).trim(),
        remarks: sanitizeInlineText(member.remarks, {
          maxLength: 120,
          multiline: true
        }).trim()
      }))
      .filter(
        (member) =>
          member.fullName ||
          member.relationshipToHead ||
          member.age > 0 ||
          member.sex ||
          member.education ||
          member.occupationalSkills ||
          member.remarks
      );

    return {
      serialNo: sanitizeInlineText(sourceDraft.serialNo, { maxLength: 40 }).trim(),
      evacuationCenterName: sanitizeInlineText(sourceDraft.evacuationCenterName, {
        maxLength: 120
      }).trim(),
      siteLabel: sanitizeInlineText(sourceDraft.siteLabel, { maxLength: 120 }).trim(),
      distributionDate: sourceDraft.distributionDate,
      headOfFamily: {
        surname: sanitizeInlineText(sourceDraft.headOfFamily.surname, {
          maxLength: 80
        }).trim(),
        firstName: sanitizeInlineText(sourceDraft.headOfFamily.firstName, {
          maxLength: 80
        }).trim(),
        middleName: sanitizeInlineText(sourceDraft.headOfFamily.middleName, {
          maxLength: 80
        }).trim(),
        sex: sanitizeInlineText(sourceDraft.headOfFamily.sex, {
          maxLength: 24
        }).trim(),
        age: parseSafeNumber(sourceDraft.headOfFamily.age),
        birthDate: sourceDraft.headOfFamily.birthDate || null,
        occupation: sanitizeInlineText(sourceDraft.headOfFamily.occupation, {
          maxLength: 80
        }).trim(),
        monthlyIncome: parseSafeNumber(sourceDraft.headOfFamily.monthlyIncome)
      },
      familyProfile: {
        is4PsBeneficiary: Boolean(sourceDraft.familyProfile.is4PsBeneficiary),
        isIpBeneficiary: Boolean(sourceDraft.familyProfile.isIpBeneficiary),
        ipEthnicity: sanitizeInlineText(sourceDraft.familyProfile.ipEthnicity, {
          maxLength: 80
        }).trim()
      },
      housingProfile: {
        tenureStatus: sanitizeInlineText(sourceDraft.housingProfile.tenureStatus, {
          maxLength: 120
        }).trim(),
        housingCondition: sanitizeInlineText(
          sourceDraft.housingProfile.housingCondition,
          { maxLength: 120 }
        ).trim()
      },
      healthProfile: {
        healthCondition: sanitizeInlineText(
          sourceDraft.healthProfile.healthCondition,
          { maxLength: 120 }
        ).trim()
      },
      familyMembers,
      distribution: {
        foodPacksReceived: dafacAidVisibility.showsFoodPacks
          ? parseSafeNumber(sourceDraft.distribution.foodPacksReceived)
          : 0,
        monetaryAmountReceived: dafacAidVisibility.showsMonetary
          ? parseSafeNumber(sourceDraft.distribution.monetaryAmountReceived)
          : 0,
        applianceUnitsReceived: dafacAidVisibility.showsAppliances
          ? parseSafeNumber(sourceDraft.distribution.applianceUnitsReceived)
          : 0
      },
      signOff: {
        familyHeadPrintedName: sanitizeInlineText(
          sourceDraft.signOff.familyHeadPrintedName,
          { maxLength: 120 }
        ).trim(),
        barangayOfficerPrintedName: sanitizeInlineText(
          sourceDraft.signOff.barangayOfficerPrintedName,
          { maxLength: 120 }
        ).trim(),
        lswdoPrintedName: sanitizeInlineText(sourceDraft.signOff.lswdoPrintedName, {
          maxLength: 120
        }).trim()
      },
      remarks: sanitizeInlineText(sourceDraft.remarks, {
        maxLength: 240,
        multiline: true
      }).trim(),
      distributionStatus: 'completed'
    };
  };

  const validateDistributionDraft = (draft) => {
    const payload = buildDistributionPayload(draft);

    if (!payload.serialNo) {
      throw new Error('Serial number is required for the DAFAC record.');
    }

    if (!payload.evacuationCenterName) {
      throw new Error('Evacuation center is required.');
    }

    if (!payload.headOfFamily.surname && !payload.headOfFamily.firstName) {
      throw new Error('Head of family name is required.');
    }

    if (!payload.distributionDate) {
      throw new Error('Distribution date is required.');
    }

    if (payload.distributionDate < minAllowedDate) {
      throw new Error('Distribution date cannot be in the past.');
    }

    if (dafacAidVisibility.showsFoodPacks && payload.distribution.foodPacksReceived <= 0) {
      throw new Error('Enter how many food packs this family received.');
    }

    if (
      dafacAidVisibility.showsMonetary &&
      payload.distribution.monetaryAmountReceived <= 0
    ) {
      throw new Error('Enter how much monetary assistance this family received.');
    }

    if (
      dafacAidVisibility.showsAppliances &&
      payload.distribution.applianceUnitsReceived <= 0
    ) {
      throw new Error('Enter how many appliance units this family received.');
    }

    return payload;
  };

  const handleRowNumberChange = (index, field, value) => {
    const sanitized =
      value === '' ? '' : Math.max(0, Number.isNaN(Number(value)) ? 0 : Number(value));

    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: sanitized } : row))
    );
  };

  const handleRowRemarksChange = (index, value) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              rowRemarks: sanitizeInlineText(value, {
                maxLength: 180,
                multiline: true
              })
            }
          : row
      )
    );
  };

  const handleSupportTypeToggle = (type) => {
    setSupportTypes((prev) => {
      const normalized = normalizeSupportTypes(prev);
      const hasType = normalized.includes(type);

      if (type === SUPPORT_TYPE_MONETARY) {
        return hasType ? normalized : [SUPPORT_TYPE_MONETARY];
      }

      const withoutMonetary = normalized.filter(
        (entry) => entry !== SUPPORT_TYPE_MONETARY
      );
      const nextTypes = hasType
        ? withoutMonetary.filter((entry) => entry !== type)
        : [...withoutMonetary, type];

      return nextTypes.length
        ? normalizeSupportTypes(nextTypes)
        : [SUPPORT_TYPE_FOODPACKS];
    });

    if (
      type === SUPPORT_TYPE_MONETARY &&
      !includesMonetary
    ) {
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          requestedFoodPacks: 0
        }))
      );
      setRequestedAppliances([createRequestedAppliance()]);
      setFormFeedback({
        type: 'info',
        message:
          'Monetary assistance must be requested separately. Food packs and appliance requests were cleared.'
      });
      return;
    }

    if (type === SUPPORT_TYPE_FOODPACKS && includesFoodPacks) {
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          requestedFoodPacks: 0
        }))
      );
    }

    if (type === SUPPORT_TYPE_MONETARY && includesMonetary) {
      setRequestedMonetaryAmount('');
    }

    if (type === SUPPORT_TYPE_APPLIANCE && includesAppliance) {
      setRequestedAppliances([createRequestedAppliance()]);
    }
  };

  const handleRequestedApplianceChange = (index, field, value) => {
    setRequestedAppliances((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        if (field === 'quantityRequested') {
          return {
            ...item,
            quantityRequested: sanitizeWholeNumberInput(value)
          };
        }

        return {
          ...item,
          [field]: sanitizeInlineText(value, {
            maxLength: field === 'remarks' ? 180 : field === 'category' ? 80 : 120,
            multiline: field === 'remarks'
          })
        };
      })
    );
  };

  const handleAddRequestedAppliance = () => {
    setRequestedAppliances((prev) => [...prev, createRequestedAppliance()]);
  };

  const handleRemoveRequestedAppliance = (index) => {
    setRequestedAppliances((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : [createRequestedAppliance()]
    );
  };

  const handleToggleRow = (index) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const nextState = !row.isActiveRow;

        if (!nextState) {
          return {
            ...row,
            isActiveRow: false,
            households: 0,
            families: 0,
            male: 0,
            female: 0,
            lgbtq: 0,
            pwd: 0,
            pregnant: 0,
            senior: 0,
            requestedFoodPacks: 0,
            rowRemarks: ''
          };
        }

        return {
          ...row,
          isActiveRow: true
        };
      })
    );
  };

  const resetImportState = () => {
    setImportInfo({
      hasImported: false,
      fileName: '',
      summary: null,
      issues: [],
      source: 'manual'
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetForm = () => {
    clearFeedback();
    setDisaster(sanitizeInlineText(baselineSource.disaster || '', { maxLength: 160 }));
    setSupportTypes(normalizeSupportTypes(baselineSource.supportTypes));
    setRequestedMonetaryAmount(baselineSource.requestedMonetaryAmount || '');
    setRequestedAppliances(
      (baselineSource.requestedAppliances || [createRequestedAppliance()]).map((item) =>
        createRequestedAppliance(item)
      )
    );
    setRequestDate(baselineSource.requestDate);
    setRemarks(
      sanitizeInlineText(baselineSource.remarks || '', {
        maxLength: 800,
        multiline: true
      })
    );
    setRows((baselineSource.rows || []).map((row) => createPreparedRow(row)));
    resetImportState();
  };

  const buildPayload = () => ({
    disaster: sanitizeInlineText(disaster, { maxLength: 160 }).trim(),
    supportTypes: normalizeSupportTypes(supportTypes),
    requestType,
    requestedMonetaryAmount: includesMonetary ? requestedMonetaryValue : 0,
    requestedAppliances: includesAppliance
      ? validRequestedAppliances.map((item) => ({
          itemName: item.itemName.trim(),
          category: item.category.trim(),
          quantityRequested: parseSafeNumber(item.quantityRequested),
          remarks: item.remarks.trim()
        }))
      : [],
    requestDate,
    remarks: sanitizeInlineText(remarks, { maxLength: 800, multiline: true }).trim(),
    rows: preparedRows.map((row) => ({
      evacPlaceId: row.evacPlaceId || null,
      evacuationCenterName: row.evacuationCenterName.trim(),
      households: Number(row.households || 0),
      families: Number(row.families || 0),
      male: Number(row.male || 0),
      female: Number(row.female || 0),
      lgbtq: Number(row.lgbtq || 0),
      pwd: Number(row.pwd || 0),
      pregnant: Number(row.pregnant || 0),
      senior: Number(row.senior || 0),
      requestedFoodPacks: includesFoodPacks ? Number(row.requestedFoodPacks || 0) : 0,
      isActiveRow: Boolean(row.isActiveRow),
      rowRemarks: String(row.rowRemarks || '').trim()
        ? sanitizeInlineText(row.rowRemarks, { maxLength: 180, multiline: true }).trim()
        : ''
    })),
    entryMode: importInfo.source === 'excel_import' ? 'excel_import' : 'manual',
    rowSource:
      importInfo.source === 'excel_import' ? 'manual_override' : 'evac_place_snapshot',
    resubmitRejected: isRejectedJourney
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearFeedback();

    if (isSubmitDisabled) {
      if (isEditingExisting && !isDirty) {
        setErrorFeedback('No changes to save.');
        return;
      }
      if (inlineErrors.supportTypes) {
        setErrorFeedback(inlineErrors.supportTypes);
        return;
      }
      if (includesMonetary && requestedMonetaryValue <= 0) {
        setErrorFeedback('Enter the requested monetary amount.');
        return;
      }
      if (includesMonetary && !remarks.trim()) {
        setErrorFeedback('Remarks are required when monetary support is included.');
        return;
      }
      if (includesFoodPacks && Number(totals.requestedFoodPacks || 0) <= 0) {
        setErrorFeedback('Enter the requested food packs for this request type.');
        return;
      }
      if (includesAppliance && inlineErrors.requestedAppliances) {
        setErrorFeedback(inlineErrors.requestedAppliances);
        return;
      }
      setErrorFeedback('Please complete the request before saving.');
      return;
    }

    try {
      setSubmitting(true);

      const endpoint =
        isEditingExisting
          ? `${BASE_URL}/api/relief-requests/${requestId}`
          : `${BASE_URL}/api/relief-requests`;

      const method = isEditingExisting ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload())
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to save relief request.');
      }

      setSuccessFeedback(
        data?.message ||
          (method === 'POST'
            ? 'Relief request submitted successfully.'
            : 'Relief request updated successfully.')
      );

      if (data?.request?._id) {
        setRequestId(data.request._id);
      }

      await loadJourneyData({ silent: true });
      setShowEditor(false);
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to save relief request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState.action) return;

    try {
      setSubmittingAction(true);
      clearFeedback();

      if (confirmState.action === 'cancel') {
        const res = await fetch(`${BASE_URL}/api/relief-requests/${latestRequest?._id}/cancel`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            remarks: remarks.trim()
          })
        });

        const contentType = res.headers.get('content-type') || '';
        const rawText = await res.text();

        let data = {};
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = {};
          }
        }

        if (!res.ok) {
          throw new Error(
            data?.message ||
              (rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')
                ? 'Cancel route returned HTML instead of JSON. Check the backend route or server error.'
                : 'Failed to cancel request.')
          );
        }

        setSuccessFeedback(data?.message || 'Relief request cancelled successfully.');

        setJourney({
          request: null,
          releases: [],
          stage: 'preparation',
          canEdit: false,
          canCancel: false,
          canReceiveAnyRelease: false,
          canRequestAgain: true,
          summary: null
        });

        setRequestId('');
        setRequestNo('Auto-generated');
        setDisaster('');
        setSupportTypes([SUPPORT_TYPE_FOODPACKS]);
        setRequestedMonetaryAmount('');
        setRequestedAppliances([createRequestedAppliance()]);
        setRequestDate(new Date().toISOString().slice(0, 10));
        setRemarks('');
        setRows(bootstrapRows.map((row) => createPreparedRow(row)));
        setShowEditor(false);
        resetImportState();

        await loadJourneyData({ silent: true });
      }

      if (confirmState.action === 'receive') {
        if (!receiptProofFiles.length) {
          throw new Error('Attach at least one receipt proof image before confirming receipt.');
        }

        const formData = new FormData();
        receiptProofFiles.forEach((file) => {
          formData.append('receiptProofFiles', file);
        });

        const res = await fetch(`${BASE_URL}/api/relief-requests/${latestRequest?._id}/received`, {
          method: 'PUT',
          credentials: 'include',
          body: formData
        });

        const contentType = res.headers.get('content-type') || '';
        const rawText = await res.text();

        let data = {};
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = {};
          }
        }

        if (!res.ok) {
          throw new Error(
            data?.message ||
              (rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')
                ? 'Receive route returned HTML instead of JSON. Check the backend route or server error.'
                : 'Failed to mark request as received.')
          );
        }

        setSuccessFeedback(
          data?.message || 'Received deliveries updated successfully.'
        );
        setReceiptProofFiles([]);
        await loadJourneyData({ silent: true });
      }

      if (confirmState.action === 'not_received') {
        const res = await fetch(`${BASE_URL}/api/relief-requests/${latestRequest?._id}/not-received`, {
          method: 'PUT',
          credentials: 'include'
        });

        const contentType = res.headers.get('content-type') || '';
        const rawText = await res.text();

        let data = {};
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = {};
          }
        }

        if (!res.ok) {
          throw new Error(
            data?.message ||
              (rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')
                ? 'Not-received route returned HTML instead of JSON. Check the backend route or server error.'
                : 'Failed to notify DRRMO about the missing delivery.')
          );
        }

        setSuccessFeedback(
          data?.message || 'DRRMO has been notified that the delivery was not received.'
        );
        await loadJourneyData({ silent: true });
      }

      if (confirmState.action === 'delete_distribution') {
        await handleDeleteDistributionRecord(confirmState.payload?.recordId);
      }
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Action failed.');
    } finally {
      setSubmittingAction(false);
      closeConfirmation();
    }
  };

  const handleStartNewRequest = async () => {
    try {
      clearFeedback();

      const freshRows = await fetchLatestBootstrapRows();

      setShowEditor(true);
      setRows(freshRows.map((row) => createPreparedRow(row)));
      setRequestId('');
      setRequestNo('Auto-generated');
      setDisaster('');
      setSupportTypes([SUPPORT_TYPE_FOODPACKS]);
      setRequestedMonetaryAmount('');
      setRequestedAppliances([createRequestedAppliance()]);
      setRequestDate(new Date().toISOString().slice(0, 10));
      setRemarks('');
      resetImportState();
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to prepare a new request.');
    }
  };

  const handleExportRequestPdf = () => {
    if (!latestRequest?._id) return;

    window.open(
      `${BASE_URL}/api/relief-requests/mine/${latestRequest._id}/export-pdf`,
      '_blank'
    );
  };

  const handleExportAccomplishedPdf = () => {
    if (!latestRequest?._id) return;

    window.open(
      `${BASE_URL}/api/relief-distributions/${latestRequest._id}/export-accomplished-report-pdf`,
      '_blank'
    );
  };

  const handleSaveDistributionRecord = async (editorCard) => {
    if (!latestRequest?._id) return;

    try {
      setDistributionSubmitting(true);
      clearFeedback();
      resetDistributionConfirmation();

      const payload = validateDistributionDraft(editorCard?.draft);
      const isEditing = editorCard?.mode === 'edit' && editorCard?.draft?._id;
      const endpoint = isEditing
        ? `${BASE_URL}/api/relief-distributions/${latestRequest._id}/records/${editorCard.draft._id}`
        : `${BASE_URL}/api/relief-distributions/${latestRequest._id}/records`;

      const res = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to save the DAFAC record.');
      }

      setSuccessFeedback(
        data?.message ||
          (isEditing
            ? 'DAFAC family distribution updated successfully.'
            : 'DAFAC family distribution created successfully.')
      );
      closeDistributionEditor(editorCard?.localId);
      await loadDistributionData({ silent: true });
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to save the DAFAC record.');
    } finally {
      setDistributionSubmitting(false);
    }
  };

  const handleDeleteDistributionRecord = async (recordId) => {
    if (!latestRequest?._id || !recordId) return;

    try {
      setDistributionSubmitting(true);
      clearFeedback();
      resetDistributionConfirmation();

      const res = await fetch(
        `${BASE_URL}/api/relief-distributions/${latestRequest._id}/records/${recordId}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to remove the DAFAC record.');
      }

      setSuccessFeedback(data?.message || 'DAFAC record removed successfully.');
      setDistributionEditorCards((prev) =>
        prev.filter((card) => card?.draft?._id !== recordId && card?.sourceRecordId !== recordId)
      );
      await loadDistributionData({ silent: true });
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to remove the DAFAC record.');
    } finally {
      setDistributionSubmitting(false);
    }
  };

  const handleChooseDistributionFile = () => {
    if (!distributionFileInputRef.current) {
      setErrorFeedback('The DAFAC import picker is unavailable. Refresh the page and try again.');
      return;
    }

    distributionFileInputRef.current.click();
  };

  const handleDistributionWorkbookImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !latestRequest?._id) return;

    try {
      setDistributionImporting(true);
      clearFeedback();
      resetDistributionConfirmation();

      const fileName = String(file.name || '').trim();
      if (!fileName) {
        throw new Error('Please choose a DAFAC workbook file before importing.');
      }

      const loweredName = fileName.toLowerCase();
      if (!loweredName.endsWith('.xlsx') && !loweredName.endsWith('.xls')) {
        throw new Error('Only Excel workbook files (.xlsx or .xls) can be imported.');
      }

      const workbookBase64 = await dafacWorkbookUtils.readFileAsDataUrl(file);
      const res = await fetch(
        `${BASE_URL}/api/relief-distributions/${latestRequest._id}/import-workbook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workbookBase64
          })
        }
      );
      const data = await res.json();

      if (!res.ok) {
        const issues = Array.isArray(data?.issues) ? data.issues : [];
        const error = new Error(
          data?.message ||
            (issues.length ? issues.join(' ') : 'Failed to import the DAFAC workbook.')
        );
        error.issues = issues;
        error.serialNos = Array.isArray(data?.serialNos) ? data.serialNos : [];
        throw error;
      }

      setSuccessFeedback(data?.message || 'DAFAC workbook imported successfully.');
      await loadDistributionData({ silent: true });
      setDistributionEditorCards(
        (Array.isArray(data?.records) ? data.records : []).map((record) =>
          createDistributionEditorCard(record, 'edit')
        )
      );
    } catch (err) {
      console.error(err);
      const issues = Array.isArray(err?.issues) ? err.issues : [];
      const serialNos = Array.isArray(err?.serialNos) ? err.serialNos : [];
      setDistributionImportIssues([
        ...issues,
        ...(serialNos.length
          ? [`Serial numbers involved: ${serialNos.join(', ')}`]
          : []),
      ]);
      setErrorFeedback(err.message || 'Failed to import the DAFAC workbook.');
    } finally {
      setDistributionImporting(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleEditCurrentRequest = () => {
    if (!latestRequest) return;

    clearFeedback();
    setRequestId(latestRequest._id || '');
    setRequestNo(latestRequest.requestNo || 'Auto-generated');
    setDisaster(latestRequest.disaster || '');
      setSupportTypes(getSupportTypesFromRequest(latestRequest));
    setRequestedMonetaryAmount(
      String(latestRequest?.totals?.requestedMonetaryAmount || '')
    );
    setRequestedAppliances(
      (Array.isArray(latestRequest?.requestedAppliances) &&
      latestRequest.requestedAppliances.length
        ? latestRequest.requestedAppliances
        : [createRequestedAppliance()]
      ).map((item) => createRequestedAppliance(item))
    );
    setRequestDate(
      latestRequest.requestDate
        ? new Date(latestRequest.requestDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setRemarks(latestRequest.remarks || '');
    setRows(buildRowsFromRequest(latestRequest));
    setImportInfo({
      hasImported: latestRequest.entryMode === 'excel_import',
      fileName: '',
      summary: null,
      issues: [],
      source: latestRequest.entryMode === 'excel_import' ? 'excel_import' : 'manual'
    });
    setShowEditor(true);
  };

  const handleChooseFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCloseEditor = () => {
    clearFeedback();
    setShowEditor(false);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearFeedback();
    setImportingFile(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];

      if (!firstSheetName) {
        throw new Error('The selected file does not contain a worksheet.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        raw: false
      });

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        throw new Error('The selected file does not contain any data rows.');
      }

      const mappedRows = [];
      const importedAppliances = [];
      const issues = [];
      let matchedRows = 0;
      let unmatchedRows = 0;
      let importedRequestType = '';
      let importedMonetaryAmount = null;

      rawRows.forEach((rawRow, index) => {
        const mapped = mapSpreadsheetRow(rawRow, RELIEF_IMPORT_HEADER_ALIASES);

        if (!importedRequestType && mapped.requestType) {
          importedRequestType = normalizeImportedRequestType(mapped.requestType);
          if (!importedRequestType) {
            issues.push(
              `Row ${index + 2}: Unrecognized support type "${mapped.requestType}".`
            );
          }
        }

        const rowMonetaryAmount = parseSafeNumber(mapped.requestedMonetaryAmount);
        if (rowMonetaryAmount > 0) {
          importedMonetaryAmount = Math.max(importedMonetaryAmount || 0, rowMonetaryAmount);
        }

        const importedAppliance = createRequestedAppliance({
          itemName: mapped.applianceItemName,
          category: mapped.applianceCategory,
          quantityRequested: parseSafeNumber(mapped.requestedApplianceQuantity) || '',
          remarks: mapped.applianceRemarks
        });

        if (hasRequestedApplianceContent(importedAppliance)) {
          if (hasCompleteRequestedAppliance(importedAppliance)) {
            importedAppliances.push(importedAppliance);
          } else {
            issues.push(
              `Row ${index + 2}: Complete appliance item, category, and quantity.`
            );
          }
        }

        const evacuationCenterName = String(
          mapped.evacuationCenterName || ''
        ).trim();

        if (!evacuationCenterName) {
          issues.push(`Row ${index + 2}: Missing evacuation center name.`);
          return;
        }

        const matchedBootstrapRow = evacNameMap.get(normalizeValue(evacuationCenterName));

        if (matchedBootstrapRow) {
          matchedRows += 1;
        } else {
          unmatchedRows += 1;
          issues.push(
            `Row ${index + 2}: "${evacuationCenterName}" did not match an existing evacuation center.`
          );
        }

        mappedRows.push(
          createPreparedRow({
            evacPlaceId: matchedBootstrapRow?.evacPlaceId || '',
            evacuationCenterName:
              matchedBootstrapRow?.evacuationCenterName || evacuationCenterName,
            households: parseSafeNumber(mapped.households),
            families: parseSafeNumber(mapped.families),
            male: parseSafeNumber(mapped.male),
            female: parseSafeNumber(mapped.female),
            lgbtq: parseSafeNumber(mapped.lgbtq),
            pwd: parseSafeNumber(mapped.pwd),
            pregnant: parseSafeNumber(mapped.pregnant),
            senior: parseSafeNumber(mapped.senior),
            requestedFoodPacks: parseSafeNumber(mapped.requestedFoodPacks),
            isActiveRow: true,
            rowRemarks: String(mapped.rowRemarks || '').trim()
          })
        );
      });

      if (!mappedRows.length) {
        throw new Error('No valid data rows were found in the file.');
      }

      const matchedNames = new Set(
        mappedRows.map((row) => normalizeValue(row.evacuationCenterName))
      );

      const untouchedBootstrapRows = bootstrapRows
        .filter((row) => !matchedNames.has(normalizeValue(row.evacuationCenterName)))
        .map((row) => createPreparedRow(row));

      setRows([...mappedRows, ...untouchedBootstrapRows]);

      const derivedFoodPackTotal = mappedRows.reduce(
        (sum, row) => sum + Number(row.requestedFoodPacks || 0),
        0
      );
      if (
        importedMonetaryAmount > 0 &&
        (derivedFoodPackTotal > 0 || importedAppliances.length > 0)
      ) {
        throw new Error(
          'Monetary assistance must be imported as a standalone request. Remove food pack and appliance values from this workbook.'
        );
      }

      const finalImportedSupportTypes = deriveImportedSupportTypes({
        importedRequestType,
        derivedFoodPackTotal,
        importedMonetaryAmount,
        importedAppliances,
        previousSupportTypes: supportTypes
      });

      if (isMonetaryMixedWithOtherSupport(finalImportedSupportTypes)) {
        throw new Error(
          'Monetary assistance must be imported as a standalone request. Remove food pack and appliance values from this workbook.'
        );
      }

      const existingAppliances = requestedAppliances
        .map((item) => createRequestedAppliance(item))
        .filter(hasRequestedApplianceContent);
      const nextRequestedAppliances = finalImportedSupportTypes.includes(SUPPORT_TYPE_APPLIANCE)
        ? importedAppliances.length > 0
          ? importedAppliances
          : existingAppliances.length > 0
            ? existingAppliances
            : [createRequestedAppliance()]
        : [createRequestedAppliance()];

      setSupportTypes(finalImportedSupportTypes);
      const nextRequestedMonetaryAmount =
        importedMonetaryAmount && importedMonetaryAmount > 0
          ? String(importedMonetaryAmount)
          : finalImportedSupportTypes.includes(SUPPORT_TYPE_MONETARY)
            ? sanitizeWholeNumberInput(requestedMonetaryAmount)
            : '';
      setRequestedMonetaryAmount(
        nextRequestedMonetaryAmount
      );
      setRequestedAppliances(nextRequestedAppliances);

      const summary = {
        totalRows: mappedRows.length,
        matchedRows,
        unmatchedRows,
        requestType: getSupportTypeLabel(finalImportedSupportTypes),
        requestedMonetaryAmount: parseSafeNumber(nextRequestedMonetaryAmount),
        requestedApplianceQuantity: nextRequestedAppliances.reduce(
          (sum, item) => sum + parseSafeNumber(item.quantityRequested),
          0
        )
      };

      setImportInfo({
        hasImported: true,
        fileName: file.name,
        summary,
        issues,
        source: 'excel_import'
      });

      setSuccessFeedback(`Import complete. ${buildImportSummaryText(summary, formatMoney)}.`);
    } catch (err) {
      console.error(err);
      setErrorFeedback(err.message || 'Failed to import file.');
      setImportInfo({
        hasImported: false,
        fileName: '',
        summary: null,
        issues: [],
        source: 'manual'
      });
    } finally {
      setImportingFile(false);
      if (event.target) event.target.value = '';
    }
  };

  const showEditorSection = showEditor || editMode;
  const isJourneyInMotion =
    !showEditorSection &&
    stageMeta.activeStep >= 2 &&
    stageMeta.activeStep <= 6;
  const requestLayoutClass =
    stageMeta.activeStep >= 4 ? 'rrf-phase-fulfillment' : 'rrf-phase-early';
  const journeyProgressWidth = `${Math.min(
    100,
    Math.max(0, ((stageMeta.activeStep - 1) / (journeySteps.length - 1)) * 100)
  )}%`;

  return (
    <DashboardShell>
      <div className="rrf-page">
        <div className="rrf-shell">
          {loadingPage && !sessionChecked ? (
            <div className="rrf-loading-card">
              <div className="rrf-spinner" />
              <h2>Loading request</h2>
            </div>
          ) : (
            <>
              <section className="rrf-header-card">
                <div className="rrf-header-copy">
                  <span className="rrf-kicker">Barangay Relief Request</span>
                  <h1 className="rrf-title">Request, track, and confirm relief delivery</h1>
                </div>
              </section>

              <section
                className={`rrf-progress-card rrf-progress-card-compact ${
                  isJourneyInMotion ? 'rrf-progress-card-active' : 'rrf-progress-card-static'
                }`}
              >
                <div className="rrf-progress-head">
                  <div>
                    <span className="rrf-progress-kicker">Journey Progress</span>
                    <h2>Current request status</h2>
                  </div>
                  <div className="rrf-stage-head">
                    <span className="rrf-stage-context">
                      {displaySupportTypeLabel}
                    </span>
                    <span className={`rrf-stage-badge rrf-stage-${stageMeta.tone}`}>
                      {stageMeta.label}
                    </span>
                  </div>
                </div>

                <div
                  className={`rrf-journey-flow ${
                    isJourneyInMotion ? 'active' : 'static'
                  }`}
                  style={{ '--rrf-progress-width': journeyProgressWidth }}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                </div>

                <div className="rrf-progress-steps seven-step">
                  {journeySteps.map((step, index) => {
                    const stepNumber = index + 1;
                    const isDone = stageMeta.completedSteps >= stepNumber;
                    const isActive = stageMeta.activeStep === stepNumber;
                    const isIdle = !isDone && !isActive;

                    return (
                      <div
                        key={step.key}
                        className={`rrf-step rrf-step-${step.key} ${isDone ? 'done' : ''} ${
                          isActive ? 'active' : ''
                        } ${isIdle ? 'idle' : ''}`}
                      >
                        <span>{stepNumber}</span>
                        <div>
                          <strong>{step.label}</strong>
                          <small>{step.hint}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {pageError ? (
                <section className="rrf-card rrf-empty-card">
                  <div className="rrf-empty-state">
                    <h2>Unable to load request page</h2>
                    <p>{pageError}</p>
                  </div>
                </section>
              ) : null}

              {formFeedback.message ? (
                <section className={`rrf-feedback-card ${formFeedback.type}`}>
                  <p>{formFeedback.message}</p>
                  {distributionImportIssues.length > 0 ? (
                    <ul className="rrf-feedback-list">
                      {distributionImportIssues.map((issue, index) => (
                        <li key={`distribution-issue-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              <input
                ref={distributionFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleDistributionWorkbookImport}
                className="rrf-hidden-input"
              />

              <div className="rrf-layout-single">
                {showEditorSection ? (
                  <form className="rrf-form" onSubmit={handleSubmit}>
                    <section className="rrf-card">
                      <div className="rrf-panel-head">
                        <div>
                          <h2>
                            {isRejectedJourney
                              ? 'Edit Rejected Request'
                              : isEditingExisting
                                ? 'Edit Request'
                                : 'Prepare Request'}
                          </h2>
                        </div>

                        <div className="rrf-inline-actions">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleImportFile}
                            className="rrf-hidden-input"
                          />

                          <button
                            type="button"
                            className="rrf-btn rrf-btn-secondary"
                            onClick={handleChooseFile}
                            disabled={importingFile || submitting}
                          >
                            {importingFile ? 'Importing…' : 'Import Excel / CSV'}
                            <FaFileImport />
                          </button>

                          <button
                            type="button"
                            className="rrf-btn rrf-btn-secondary"
                            onClick={handleResetForm}
                            disabled={submitting}
                          >
                            Reset
                            <FaRedo />
                          </button>
                        </div>
                      </div>

                      {importInfo.hasImported ? (
                        <div className="rrf-import-strip">
                          <div className="rrf-import-strip-main">
                            <strong>{importInfo.fileName || 'Imported file'}</strong>
                            <span>{buildImportSummaryText(importInfo.summary, formatMoney)}</span>
                          </div>

                          {importInfo.issues?.length ? (
                            <small>{importInfo.issues.length} issue(s)</small>
                          ) : (
                            <small>Applied</small>
                          )}
                        </div>
                      ) : null}

                      <div className="rrf-editor-grid">
                        <div className="rrf-editor-main">
                          <div className="rrf-form-grid">
                            <div className="rrf-field">
                              <label htmlFor="requestNo">Request No.</label>
                              <input id="requestNo" type="text" value={requestNo} readOnly />
                            </div>

                            <div className="rrf-field">
                              <label htmlFor="barangayName">Barangay</label>
                              <input
                                id="barangayName"
                                type="text"
                                value={barangayName}
                                readOnly
                              />
                            </div>

                            <div className="rrf-field">
                              <label htmlFor="disaster">Disaster / Incident</label>
                              <input
                                id="disaster"
                                type="text"
                                value={disaster}
                                onChange={(e) =>
                                  setDisaster(
                                    sanitizeInlineText(e.target.value, {
                                      maxLength: 160
                                    })
                                  )
                                }
                              />
                              {inlineErrors.disaster ? (
                                <small className="rrf-inline-error">{inlineErrors.disaster}</small>
                              ) : null}
                            </div>

                            <div className="rrf-field">
                              <label htmlFor="requestDate">Request Date</label>
                              <input
                                id="requestDate"
                                type="date"
                                value={requestDate}
                                min={minAllowedDate}
                                onChange={(e) =>
                                  setRequestDate(clampToTodayOrFutureDate(e.target.value))
                                }
                              />
                              {inlineErrors.requestDate ? (
                                <small className="rrf-inline-error">{inlineErrors.requestDate}</small>
                              ) : null}
                            </div>

                            <div className="rrf-field rrf-support-type-field">
                              <label>Support Type</label>
                              <div className="rrf-support-type-options">
                                {SUPPORT_TYPE_OPTIONS.map((option) => {
                                  const checked = supportTypes.includes(option.value);
                                  return (
                                    <label
                                      key={option.value}
                                      className={`rrf-support-type-chip ${checked ? 'active' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => handleSupportTypeToggle(option.value)}
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {inlineErrors.supportTypes ? (
                                <small className="rrf-inline-error">{inlineErrors.supportTypes}</small>
                              ) : null}
                            </div>

                            <div className="rrf-field">
                              <label htmlFor="requestedMonetaryAmount">
                                Requested Monetary Amount
                              </label>
                              <input
                                id="requestedMonetaryAmount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={requestedMonetaryAmount}
                                onChange={(e) =>
                                  setRequestedMonetaryAmount(
                                    sanitizeCurrencyInput(e.target.value)
                                  )
                                }
                                disabled={!includesMonetary}
                                placeholder={
                                  includesMonetary ? 'Enter amount in PHP' : 'Not included'
                                }
                              />
                              {inlineErrors.requestedMonetaryAmount ? (
                                <small className="rrf-inline-error">
                                  {inlineErrors.requestedMonetaryAmount}
                                </small>
                              ) : null}
                            </div>
                          </div>

                          <div className="rrf-field rrf-remarks-field">
                            <label htmlFor="remarks">
                              Overall Remarks
                              {includesMonetary ? ' *' : ''}
                            </label>
                            <textarea
                              id="remarks"
                              value={remarks}
                              onChange={(e) =>
                                setRemarks(
                                  sanitizeInlineText(e.target.value, {
                                    maxLength: 800,
                                    multiline: true
                                  })
                                )
                              }
                              placeholder={
                                includesMonetary
                                  ? 'Required for monetary requests.'
                                  : ''
                              }
                            />
                            {inlineErrors.remarks ? (
                              <small className="rrf-inline-error">{inlineErrors.remarks}</small>
                            ) : null}
                          </div>

                          {includesAppliance ? (
                            <div className="rrf-appliance-section">
                              <div className="rrf-subsection-head">
                                <div>
                                  <span className="rrf-subsection-kicker">Appliance Requests</span>
                                  <h3>List requested appliance items</h3>
                                </div>
                                <button
                                  type="button"
                                  className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                  onClick={handleAddRequestedAppliance}
                                >
                                  <FaPlus />
                                  Add Item
                                </button>
                              </div>

                              <div className="rrf-appliance-list">
                                {requestedAppliances.map((item, index) => (
                                  <div key={`appliance-${index}`} className="rrf-appliance-row">
                                    <div className="rrf-form-grid rrf-form-grid-appliance">
                                      <div className="rrf-field">
                                        <label>Item Name</label>
                                        <input
                                          type="text"
                                          value={item.itemName}
                                          onChange={(e) =>
                                            handleRequestedApplianceChange(index, 'itemName', e.target.value)
                                          }
                                          placeholder="e.g. Generator"
                                        />
                                      </div>

                                      <div className="rrf-field">
                                        <label>Category</label>
                                        <input
                                          type="text"
                                          value={item.category}
                                          onChange={(e) =>
                                            handleRequestedApplianceChange(index, 'category', e.target.value)
                                          }
                                          placeholder="e.g. Power Equipment"
                                        />
                                      </div>

                                      <div className="rrf-field">
                                        <label>Quantity Requested</label>
                                        <input
                                          type="number"
                                          min="0"
                                          value={item.quantityRequested}
                                          onChange={(e) =>
                                            handleRequestedApplianceChange(
                                              index,
                                              'quantityRequested',
                                              e.target.value
                                            )
                                          }
                                          placeholder="0"
                                        />
                                      </div>

                                      <div className="rrf-field">
                                        <label>Remarks</label>
                                        <input
                                          type="text"
                                          value={item.remarks}
                                          onChange={(e) =>
                                            handleRequestedApplianceChange(index, 'remarks', e.target.value)
                                          }
                                          placeholder="Optional"
                                        />
                                      </div>
                                    </div>

                                    {requestedAppliances.length > 1 ? (
                                      <button
                                        type="button"
                                        className="rrf-btn rrf-btn-danger rrf-btn-small"
                                        onClick={() => handleRemoveRequestedAppliance(index)}
                                      >
                                        <FaMinus />
                                        Remove
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>

                              {inlineErrors.requestedAppliances ? (
                                <small className="rrf-inline-error">
                                  {inlineErrors.requestedAppliances}
                                </small>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="rrf-editor-side">
                          <div className="rrf-card rrf-summary-card rrf-summary-card-compact">
                            <div className="rrf-panel-head rrf-panel-head-tight">
                              <div>
                                <h2>Live Totals</h2>
                              </div>
                            </div>

                            <div className="rrf-summary-list">
                              <div className="rrf-summary-item">
                                <span>Centers</span>
                                <strong>{activeRows.length}</strong>
                              </div>
                              <div className="rrf-summary-item">
                                <span>Families</span>
                                <strong>{totals.families}</strong>
                              </div>
                              <div className="rrf-summary-item">
                                <span>Individuals</span>
                                <strong>{totalIndividuals}</strong>
                              </div>
                              <div className="rrf-summary-item">
                                <span>Vulnerable</span>
                                <strong>{vulnerableCount}</strong>
                              </div>
                              <div className="rrf-summary-item emphasis">
                                <span>Support Type</span>
                                <strong>{currentSupportTypeLabel}</strong>
                              </div>
                              <div className="rrf-summary-item emphasis">
                                <span>Food Packs</span>
                                <strong>
                                  {includesFoodPacks ? totals.requestedFoodPacks : '-'}
                                </strong>
                              </div>
                              <div className="rrf-summary-item emphasis">
                                <span>Monetary</span>
                                <strong>
                                  {includesMonetary
                                    ? `PHP ${formatMoney(requestedMonetaryValue)}`
                                    : '-'}
                                </strong>
                              </div>
                              <div className="rrf-summary-item emphasis">
                                <span>Appliance Units</span>
                                <strong>{includesAppliance ? requestedApplianceQuantity : '-'}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rrf-table-card">
                        <div className="rrf-subsection-head">
                          <div>
                            <span className="rrf-subsection-kicker">Evacuation center rows</span>
                            <h3>Review and update row data</h3>
                          </div>
                        </div>

                        <div className="rrf-table-wrapper rrf-table-wrapper-tall">
                          <table className="rrf-table rrf-table-compact">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Status</th>
                                <th className="rrf-left-cell">Evacuation Center</th>
                                <th>Households</th>
                                <th>Families</th>
                                <th>Male</th>
                                <th>Female</th>
                                <th>LGBTQ</th>
                                <th>PWD</th>
                                <th>Pregnant</th>
                                <th>Senior</th>
                                <th>Food Packs</th>
                                <th className="rrf-left-cell">Row Remarks</th>
                              </tr>
                            </thead>

                            <tbody>
                              {preparedRows.map((row, index) => (
                                <tr
                                  key={`${row.evacuationCenterName}-${index}`}
                                  className={!row.isActiveRow ? 'rrf-row-muted' : ''}
                                >
                                  <td className="rrf-row-number">{index + 1}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className={`rrf-toggle-btn ${row.isActiveRow ? 'active' : ''}`}
                                      onClick={() => handleToggleRow(index)}
                                    >
                                      {row.isActiveRow ? 'On' : 'Off'}
                                    </button>
                                  </td>

                                  <td className="rrf-left-cell">
                                    <div className="rrf-evac-static">
                                      <strong>{row.evacuationCenterName || 'Unnamed center'}</strong>
                                    </div>
                                  </td>

                                  {numberFields.map((field) => (
                                    <td key={`${field}-${index}`} className="rrf-number-cell">
                                      <input
                                        type="number"
                                        min="0"
                                        value={row[field]}
                                        onChange={(e) =>
                                          handleRowNumberChange(index, field, e.target.value)
                                        }
                                        disabled={
                                          !row.isActiveRow ||
                                          (field === 'requestedFoodPacks' &&
                                            !includesFoodPacks)
                                        }
                                      />
                                    </td>
                                  ))}

                                  <td className="rrf-left-cell rrf-cell-remarks">
                                    <input
                                      type="text"
                                      value={row.rowRemarks || ''}
                                      onChange={(e) =>
                                        handleRowRemarksChange(index, e.target.value)
                                      }
                                      disabled={!row.isActiveRow}
                                      placeholder="Optional"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>

                            <tfoot>
                              <tr>
                                <td colSpan="3" className="rrf-total-label">
                                  Total
                                </td>
                                <td>{totals.households}</td>
                                <td>{totals.families}</td>
                                <td>{totals.male}</td>
                                <td>{totals.female}</td>
                                <td>{totals.lgbtq}</td>
                                <td>{totals.pwd}</td>
                                <td>{totals.pregnant}</td>
                                <td>{totals.senior}</td>
                                <td>{includesFoodPacks ? totals.requestedFoodPacks : '-'}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        {inlineErrors.requestedFoodPacks ? (
                          <small className="rrf-inline-error rrf-inline-error-block">
                            {inlineErrors.requestedFoodPacks}
                          </small>
                        ) : null}
                      </div>

                      <div className="rrf-submit-row">
                        <button
                          type="button"
                          className="rrf-btn rrf-btn-secondary"
                          onClick={handleCloseEditor}
                          disabled={submitting}
                        >
                          Close Editor
                          <FaTimes />
                        </button>
                        <button
                          type="submit"
                          className="rrf-btn rrf-btn-primary"
                          disabled={isSubmitDisabled}
                        >
                          <FaCheck />
                          {submitting
                            ? isEditingExisting
                              ? 'Saving...'
                              : 'Submitting...'
                            : isEditingExisting
                              ? isRejectedJourney
                                ? 'Resubmit Request'
                                : 'Save Changes'
                              : 'Submit Request'}
                        </button>
                      </div>
                    </section>
                  </form>
                ) : null}

                {!showEditorSection && latestRequest ? (
                  <section
                    className={`rrf-card rrf-current-request-card rrf-unified-request-card ${requestLayoutClass}`}
                  >
                    <div className="rrf-unified-request-header">
                      <div className="rrf-unified-request-title">
                        <span className="rrf-subsection-kicker">Current request</span>
                        <h2>Relief Request Overview</h2>
                      </div>

                      <div className="rrf-inline-actions rrf-inline-actions-right">
                        {journey.canEdit || isRejectedJourney ? (
                          <button
                            type="button"
                            className="rrf-btn rrf-btn-secondary"
                            onClick={handleEditCurrentRequest}
                          >
                            {isRejectedJourney ? 'Edit & Resubmit' : 'Edit Request'}
                            <FaPen />
                          </button>
                        ) : null}

                        {journey.canCancel ? (
                          <button
                            type="button"
                            className="rrf-btn rrf-btn-danger"
                            onClick={() =>
                              openConfirmation({
                                title: 'Cancel this request?',
                                message: 'This request will no longer continue in the queue.',
                                action: 'cancel'
                              })
                            }
                            disabled={submittingAction}
                          >
                            Cancel Request
                            <FaTimes />
                          </button>
                        ) : null}

                        {canShowConfirmReceivedAction ? (
                          <>
                            <button
                              type="button"
                              className="rrf-btn rrf-btn-secondary"
                              onClick={() =>
                                openConfirmation({
                                  title: "Report delivery not received?",
                                  message:
                                    "This will notify DRRMO that the current release was not received yet.",
                                  action: "not_received"
                                })
                              }
                              disabled={submittingAction}
                            >
                              Didn't Receive
                              <FaTimes />
                            </button>

                          <button
                            type="button"
                            className="rrf-btn rrf-btn-primary"
                            onClick={() =>
                              openConfirmation({
                                title: 'Confirm received deliveries?',
                                message:
                                  'Only the currently released deliveries will be marked as received.',
                                action: 'receive'
                              })
                            }
                            disabled={
                              submittingAction ||
                              (!isReceiptConfirmed && receiptProofFiles.length === 0)
                            }
                          >
                            Confirm Received
                            <FaCheck />
                          </button>
                          </>
                        ) : null}

                        {canShowRequestAgainButton ? (
                          <button
                            type="button"
                            className="rrf-btn rrf-btn-primary"
                            onClick={handleStartNewRequest}
                          >
                            Prepare New Request
                            <FaPlus />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isRejectedJourney ? (
                      <div className="rrf-result-banner rrf-result-banner-rejected rrf-result-banner-combined">
                        <div className="rrf-result-banner-icon">
                          <FaExclamationTriangle />
                        </div>

                        <div className="rrf-result-banner-content">
                          <span className="rrf-result-banner-kicker">Request Rejected</span>
                          <h3>This request needs revision</h3>
                          <p>
                            {decisionRemarks ||
                              'DRRMO rejected this request. Please review and resubmit it.'}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="rrf-unified-request-body">
                      <div className="rrf-request-overview-shell">
                        <div className="rrf-request-overview-top">
                          <div className="rrf-request-reference featured">
                            <span>Request No.</span>
                            <strong>{latestRequest.requestNo || '-'}</strong>
                            <em className="rrf-request-subtitle">
                              {latestRequest.disaster || 'No disaster / incident provided'}
                            </em>
                          </div>

                          <div className="rrf-request-meta-item">
                            <span>Status</span>
                            <strong>{requestStatusLabel}</strong>
                          </div>

                          <div className="rrf-request-meta-item">
                            <span>Request Date</span>
                            <strong>{formatDate(latestRequest.requestDate)}</strong>
                          </div>

                          <div className="rrf-request-meta-item">
                            <span>Request Type</span>
                            <strong>{displaySupportTypeLabel}</strong>
                          </div>

                          <div className="rrf-request-meta-item">
                            <span>Entry Mode</span>
                            <strong>
                              {latestRequest.entryMode === 'excel_import'
                                ? 'Excel Import'
                                : 'Manual Encoding'}
                            </strong>
                          </div>
                        </div>

                        <div className="rrf-request-metrics-grid">
                          <div className="rrf-request-metric success">
                            <span>Requested Packs</span>
                            <strong>
                              {!displayIncludesFoodPacks
                                ? '-'
                                : displayRequestedPacks}
                            </strong>
                          </div>

                          <div className="rrf-request-metric warning">
                            <span>Requested Monetary</span>
                            <strong>
                              {!displayIncludesMonetary
                                ? '-'
                                : `PHP ${formatMoney(displayRequestedMonetaryAmount)}`}
                            </strong>
                          </div>

                          <div className="rrf-request-metric info">
                            <span>Appliance Units</span>
                            <strong>
                              {displayIncludesAppliance ? displayRequestedApplianceQuantity : '-'}
                            </strong>
                          </div>

                          <div className="rrf-request-metric neutral">
                            <span>Vulnerable Count</span>
                            <strong>{displayVulnerableCount}</strong>
                          </div>

                          <div className="rrf-request-metric highlight">
                            <span>Total Affected</span>
                            <strong>{displayTotalAffected}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {shouldShowReceivedSection ? (
                        <div className="rrf-unified-receipt-panel">
                          <div className="rrf-unified-receipt-head">
                            <div>
                              <span className="rrf-subsection-kicker">Receipt Details</span>
                            <h3>
                              {isReceiptConfirmed
                                ? 'Delivery Received'
                                : displayDeliveryItems.length
                                  ? 'Released for Confirmation'
                                  : 'Waiting for Delivery'}
                            </h3>
                            </div>

                          {latestRequest?._id && shouldShowReceivedSection ? (
                            <button
                              type="button"
                              className="rrf-btn rrf-btn-secondary rrf-btn-small"
                              onClick={handleExportRequestPdf}
                            >
                              <FaFilePdf />
                              Export PDF
                            </button>
                          ) : null}
                        </div>

                          <div className="rrf-receipt-summary-grid">
                            <div className="rrf-receipt-summary-card featured">
                              <span>
                                {receiptPanelSummary.showingReleasedForConfirmation
                                  ? 'Released Food Packs'
                                : 'Received Food Packs'}
                            </span>
                            <strong>{receiptPanelSummary.totalFoodPacks}</strong>
                            <small>
                              {receiptPanelSummary.showingReleasedForConfirmation
                                ? 'Packs awaiting confirmation'
                                : 'Distributed packs'}
                            </small>
                          </div>

                          <div className="rrf-receipt-summary-card">
                            <span>Total Quantity</span>
                            <strong>{Number(receiptPanelSummary.totalQuantity || 0)}</strong>
                            <small>
                              {receiptPanelSummary.showingReleasedForConfirmation
                                ? 'Units prepared for delivery'
                                : 'Units received'}
                              </small>
                            </div>

                            <div className="rrf-receipt-summary-card">
                              <span>
                                {receiptPanelSummary.showingReleasedForConfirmation
                                  ? 'Released Appliances'
                                  : 'Received Appliances'}
                              </span>
                              <strong>{Number(receiptPanelSummary.totalApplianceUnits || 0)}</strong>
                              <small>
                                {receiptPanelSummary.showingReleasedForConfirmation
                                  ? 'Appliance units for delivery'
                                  : 'Appliance units accepted'}
                              </small>
                            </div>

                            <div className="rrf-receipt-summary-card">
                              <span>Total Amount</span>
                              <strong>
                                PHP {Number(receiptPanelSummary.totalAmount || 0).toFixed(2)}
                              </strong>
                              <small>
                              {receiptPanelSummary.showingReleasedForConfirmation
                                ? 'Monetary release value'
                                : 'Monetary value'}
                            </small>
                          </div>

                          <div className="rrf-receipt-summary-card">
                            <span>Item Lines</span>
                            <strong>{Number(receiptPanelSummary.itemLines || 0)}</strong>
                            <small>
                              {receiptPanelSummary.showingReleasedForConfirmation
                                ? 'Release item lines'
                                : 'Accepted items'}
                            </small>
                            </div>

                            <div className="rrf-receipt-summary-card rrf-receipt-summary-card-date">
                              <span>
                                {receiptPanelSummary.showingReleasedForConfirmation
                                  ? 'Last Released'
                                  : 'Last Received'}
                            </span>
                            <strong>{formatDateTime(receiptPanelSummary.latestActivityAt)}</strong>
                            <small>
                              {receiptPanelSummary.showingReleasedForConfirmation
                                ? 'Latest release activity'
                                : 'Latest confirmation'}
                            </small>
                          </div>
                        </div>

                        <div className="rrf-unified-items-panel">
                          {!isReceiptConfirmed ? (
                            <div className="rrf-receipt-proof-panel">
                              <div className="rrf-subsection-head">
                                <div>
                                  <span className="rrf-subsection-kicker">Release Proof</span>
                                  <h3>Uploaded by DRRMO or Accountant</h3>
                                </div>
                              </div>

                              <p className="rrf-receipt-proof-note">
                                Barangay can review the release evidence here before confirming receipt.
                              </p>

                              {releaseProofItems.length > 0 ? (
                                <div className="rrf-proof-grid">
                                  {releaseProofItems.map((proof) => (
                                    <div key={proof.key} className="rrf-proof-card">
                                      {isImageProofFile(proof.sourceValue || proof.url) ? (
                                        <img
                                          src={proof.url}
                                          alt={proof.label}
                                        />
                                      ) : (
                                        <a
                                          href={proof.url || '#'}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="rrf-proof-file-link"
                                          title={proof.label}
                                        >
                                          <FaFilePdf />
                                          <span>{proof.label}</span>
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rrf-received-empty compact">
                                  <div>
                                    <h4>No release proof uploaded yet</h4>
                                    <p>The release record exists, but no proof file has been attached yet.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}

                          <div className="rrf-receipt-proof-panel">
                            <div className="rrf-subsection-head">
                              <div>
                                <span className="rrf-subsection-kicker">Receipt Proof</span>
                                <h3>{isReceiptConfirmed ? 'Uploaded Receipt Proof' : 'Upload Receipt Proof'}</h3>
                              </div>
                              {!isReceiptConfirmed ? (
                                <button
                                  type="button"
                                  className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                  onClick={() => distributionFileInputRef.current?.click()}
                                >
                                  <FaPlus />
                                  Add Proof
                                </button>
                              ) : null}
                            </div>

                            {!isReceiptConfirmed ? (
                              <>
                                <input
                                  ref={distributionFileInputRef}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  hidden
                                  onChange={handleReceiptProofSelection}
                                />
                                <p className="rrf-receipt-proof-note">
                                  Upload at least one image before confirming receipt in Step 5.
                                </p>
                              </>
                            ) : null}

                            <div className="rrf-proof-grid">
                              {(isReceiptConfirmed ? receiptProofItems : receiptProofPreviews).map(
                                (proof, index) => (
                                  <div key={proof.key} className="rrf-proof-card">
                                    <img
                                      src={isReceiptConfirmed ? proof.url : proof.url}
                                      alt={proof.label || `Receipt proof ${index + 1}`}
                                    />
                                    {!isReceiptConfirmed ? (
                                      <button
                                        type="button"
                                        className="rrf-btn rrf-btn-danger rrf-btn-small"
                                        onClick={() => removeReceiptProofFile(index)}
                                      >
                                        <FaMinus />
                                      </button>
                                    ) : null}
                                  </div>
                                )
                              )}
                            </div>

                            {!isReceiptConfirmed && !receiptProofPreviews.length ? (
                              <div className="rrf-received-empty compact">
                                <div>
                                  <h4>No receipt proof uploaded yet</h4>
                                  <p>Barangay must attach receipt proof before continuing to Step 6.</p>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="rrf-unified-items-head">
                            <div>
                              <span className="rrf-subsection-kicker">
                                {isReceiptConfirmed ? 'Accepted Items' : 'Release Items'}
                              </span>
                              <h3>
                                {isReceiptConfirmed
                                  ? 'Delivered Item Breakdown'
                                  : 'Release Item Breakdown'}
                              </h3>
                            </div>
                          </div>

                          {displayDeliveryItems.length ? (
                            <div className="rrf-table-wrapper rrf-unified-items-scroll">
                              <table className="rrf-table rrf-unified-items-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Item</th>
                                    <th>Category</th>
                                    <th>Quantity / Amount</th>
                                    <th>Unit</th>
                                    <th>{isReceiptConfirmed ? 'Received Date' : 'Release Date'}</th>
                                    <th>Remarks</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {displayDeliveryItems.map((item, index) => (
                                    <tr key={item.key || index}>
                                      <td>{index + 1}</td>
                                      <td className="rrf-left-cell">
                                        <strong>{item.itemName}</strong>
                                      </td>
                                      <td>{item.category}</td>
                                      <td>
                                        {Number(item.amount || 0) > 0
                                          ? `PHP ${Number(item.amount || 0).toFixed(2)}`
                                          : Number(item.quantity || 0)}
                                      </td>
                                      <td>{item.unit}</td>
                                      <td>{formatDateTime(item.releaseDate)}</td>
                                      <td>{item.remarks || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="rrf-received-empty">
                              <div className="rrf-received-empty-icon">
                                <FaExclamationTriangle />
                              </div>
                              <div>
                                <h4>
                                  {isReceiptConfirmed
                                    ? 'No received item lines yet'
                                    : 'No released item lines yet'}
                                </h4>
                                <p>
                                  {isReceiptConfirmed
                                    ? 'Delivery information will appear here once the barangay confirms receipt.'
                                    : 'Release information will appear here once DRRMO sends goods or monetary support for this request.'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {shouldShowDistributionSection ? (
                      <div className="rrf-distribution-stage">
                        {stageMeta.activeStep === 6 ? (
                        <section className="rrf-card rrf-dafac-stage-card">
                          <div className="rrf-panel-head">
                            <div>
                              <h2>DAFAC Distribution</h2>
                            </div>

                            <div className="rrf-inline-actions">
                              <button
                                type="button"
                                className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                onClick={handleChooseDistributionFile}
                                disabled={distributionImporting || distributionSubmitting}
                              >
                                {distributionImporting ? 'Importing…' : 'Import Excel'}
                                <FaFileImport />
                              </button>
                            </div>
                          </div>

                          {distributionState.loading ? (
                            <div className="rrf-received-empty">
                              <div>
                                <h4>Loading DAFAC records</h4>
                                <p>Fetching completed family distributions.</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="rrf-dafac-card-grid">
                                {distributionGridState.entries.map((entry) => {
                                  if (entry.type === 'saved') {
                                    const record = entry.record;
                                    return (
                                      <DafacDistributionCard
                                        key={entry.key}
                                        record={record}
                                        visibility={dafacAidVisibility}
                                        onEdit={openEditDistributionEditor}
                                        onDelete={(item) =>
                                          openConfirmation({
                                            title: 'Remove this DAFAC record?',
                                            message:
                                              'This family distribution record will be archived from the request.',
                                            action: 'delete_distribution',
                                            payload: { recordId: item?._id }
                                          })
                                        }
                                      />
                                    );
                                  }

                                  const editorCard = entry.editorCard;
                                  return (
                                  <div key={entry.key} className="rrf-dafac-editor-card">
                                    <div className="rrf-dafac-editor-head">
                                      <p className="rrf-dafac-editor-note">
                                        {editorCard.mode === 'edit'
                                          ? 'Update this family card, then save.'
                                          : 'Fill this family card, then save it into the grid.'}
                                      </p>
                                      <button
                                        type="button"
                                        className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                        onClick={() => closeDistributionEditor(editorCard.localId)}
                                      >
                                        Close
                                        <FaTimes />
                                      </button>
                                    </div>

                                    <div className="rrf-dafac-editor-grid compact">
                                      <div className="rrf-field">
                                        <label>Serial No.</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.serialNo}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'serialNo',
                                              sanitizeInlineText(e.target.value, { maxLength: 40 })
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>Evacuation Center</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.evacuationCenterName}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'evacuationCenterName',
                                              sanitizeInlineText(e.target.value, { maxLength: 120 })
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>Site Label</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.siteLabel}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'siteLabel',
                                              sanitizeInlineText(e.target.value, { maxLength: 120 })
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>Date</label>
                                        <input
                                          type="date"
                                          value={editorCard.draft.distributionDate}
                                          min={minAllowedDate}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'distributionDate',
                                              e.target.value
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>Surname</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.headOfFamily.surname}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'headOfFamily.surname',
                                              sanitizeInlineText(e.target.value, { maxLength: 80 })
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>First Name</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.headOfFamily.firstName}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'headOfFamily.firstName',
                                              sanitizeInlineText(e.target.value, { maxLength: 80 })
                                            )
                                          }
                                        />
                                      </div>
                                      {dafacAidVisibility.showsFoodPacks ? (
                                        <div className="rrf-field">
                                          <label>Food Packs</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={editorCard.draft.distribution.foodPacksReceived}
                                            onChange={(e) =>
                                              handleDistributionDraftField(
                                                editorCard.localId,
                                                'distribution.foodPacksReceived',
                                                sanitizeWholeNumberInput(e.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      ) : null}
                                      {dafacAidVisibility.showsMonetary ? (
                                        <div className="rrf-field">
                                          <label>Monetary</label>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={editorCard.draft.distribution.monetaryAmountReceived}
                                            onChange={(e) =>
                                              handleDistributionDraftField(
                                                editorCard.localId,
                                                'distribution.monetaryAmountReceived',
                                                sanitizeCurrencyInput(e.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      ) : null}
                                      {dafacAidVisibility.showsAppliances ? (
                                        <div className="rrf-field">
                                          <label>Appliance</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={editorCard.draft.distribution.applianceUnitsReceived}
                                            onChange={(e) =>
                                              handleDistributionDraftField(
                                                editorCard.localId,
                                                'distribution.applianceUnitsReceived',
                                                sanitizeWholeNumberInput(e.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="rrf-dafac-mini-section">
                                      <div className="rrf-subsection-head">
                                        <h3>Family members</h3>
                                        <button
                                          type="button"
                                          className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                          onClick={() => addDistributionMember(editorCard.localId)}
                                        >
                                          <FaPlus />
                                          Add Member
                                        </button>
                                      </div>

                                      <div className="rrf-dafac-mini-list">
                                        {editorCard.draft.familyMembers.map((member, index) => (
                                          <div key={`member-${index}`} className="rrf-dafac-mini-row">
                                            <input
                                              type="text"
                                              placeholder="Full name"
                                              value={member.fullName}
                                              onChange={(e) =>
                                                handleDistributionMemberChange(
                                                  editorCard.localId,
                                                  index,
                                                  'fullName',
                                                  e.target.value
                                                )
                                              }
                                            />
                                            <input
                                              type="text"
                                              placeholder="Relationship"
                                              value={member.relationshipToHead}
                                              onChange={(e) =>
                                                handleDistributionMemberChange(
                                                  editorCard.localId,
                                                  index,
                                                  'relationshipToHead',
                                                  e.target.value
                                                )
                                              }
                                            />
                                            <input
                                              type="number"
                                              min="0"
                                              placeholder="Age"
                                              value={member.age}
                                              onChange={(e) =>
                                                handleDistributionMemberChange(
                                                  editorCard.localId,
                                                  index,
                                                  'age',
                                                  e.target.value
                                                )
                                              }
                                            />
                                            <button
                                              type="button"
                                              className="rrf-btn rrf-btn-danger rrf-btn-small"
                                              onClick={() =>
                                                removeDistributionMember(editorCard.localId, index)
                                              }
                                            >
                                              <FaMinus />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rrf-dafac-editor-grid signoff">
                                      <div className="rrf-field">
                                        <label>Family Head Printed Name</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.signOff.familyHeadPrintedName}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'signOff.familyHeadPrintedName',
                                              sanitizeInlineText(e.target.value, { maxLength: 120 })
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="rrf-field">
                                        <label>Barangay Officer</label>
                                        <input
                                          type="text"
                                          value={editorCard.draft.signOff.barangayOfficerPrintedName}
                                          onChange={(e) =>
                                            handleDistributionDraftField(
                                              editorCard.localId,
                                              'signOff.barangayOfficerPrintedName',
                                              sanitizeInlineText(e.target.value, { maxLength: 120 })
                                            )
                                          }
                                        />
                                      </div>
                                    </div>

                                    <div className="rrf-field rrf-remarks-field compact">
                                      <label>Remarks</label>
                                      <textarea
                                        value={editorCard.draft.remarks}
                                        onChange={(e) =>
                                          handleDistributionDraftField(
                                            editorCard.localId,
                                            'remarks',
                                            sanitizeInlineText(e.target.value, {
                                              maxLength: 240,
                                              multiline: true
                                            })
                                          )
                                        }
                                      />
                                    </div>

                                    <div className="rrf-inline-actions rrf-inline-actions-right">
                                      <button
                                        type="button"
                                        className="rrf-btn rrf-btn-primary"
                                        onClick={() => handleSaveDistributionRecord(editorCard)}
                                        disabled={distributionSubmitting}
                                      >
                                        {distributionSubmitting ? 'Saving…' : 'Save Family Record'}
                                        <FaCheck />
                                      </button>
                                    </div>
                                  </div>
                                  );
                                })}

                                {Array.from({ length: distributionGridState.addCardCount }).map((_, index) => (
                                  <button
                                    key={`add-card-${distributionGridState.page}-${index}`}
                                    type="button"
                                    className="rrf-dafac-add-card"
                                    onClick={openCreateDistributionEditor}
                                  >
                                    <span>+</span>
                                  </button>
                                ))}
                              </div>

                              {distributionGridState.totalPages > 1 ? (
                                <div className="rrf-dafac-pagination">
                                  <button
                                    type="button"
                                    className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                    disabled={distributionGridState.page <= 1}
                                    onClick={() =>
                                      setDistributionPage((prev) => Math.max(1, prev - 1))
                                    }
                                  >
                                    Prev
                                  </button>
                                  <span>
                                    Page {distributionGridState.page} of{' '}
                                    {distributionGridState.totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    className="rrf-btn rrf-btn-secondary rrf-btn-small"
                                    disabled={
                                      distributionGridState.page >=
                                      distributionGridState.totalPages
                                    }
                                    onClick={() =>
                                      setDistributionPage((prev) =>
                                        Math.min(distributionGridState.totalPages, prev + 1)
                                      )
                                    }
                                  >
                                    Next
                                  </button>
                                </div>
                              ) : null}

                              <div className="rrf-dafac-received-strip">
                                {dafacAidVisibility.showsFoodPacks ? (
                                  <div className="rrf-dafac-received-pill">
                                    <span>Relief Received</span>
                                    <strong>{accomplishedDistributionSummary.totals?.foodPacksCap || 0}</strong>
                                  </div>
                                ) : null}
                                {dafacAidVisibility.showsMonetary ? (
                                  <div className="rrf-dafac-received-pill">
                                    <span>Monetary Received</span>
                                    <strong>
                                      PHP {formatMoney(accomplishedDistributionSummary.totals?.monetaryCap || 0)}
                                    </strong>
                                  </div>
                                ) : null}
                                {dafacAidVisibility.showsAppliances ? (
                                  <div className="rrf-dafac-received-pill">
                                    <span>Appliance Units Received</span>
                                    <strong>{accomplishedDistributionSummary.totals?.applianceUnitsCap || 0}</strong>
                                  </div>
                                ) : null}
                              </div>

                              <div className="rrf-dafac-confirm-strip">
                                <div className="rrf-dafac-confirm-copy">
                                  <strong>Step 6 Review</strong>
                                  <span>
                                    Keep reviewing the DAFAC cards here. Move to the accomplished
                                    report only after you confirm the full family distribution.
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="rrf-btn rrf-btn-primary"
                                  onClick={handleConfirmDistributionStep}
                                  disabled={!isAccomplishedReady || distributionSubmitting}
                                >
                                  Confirm Distribution
                                  <FaCheck />
                                </button>
                              </div>

                            </>
                          )}
                        </section>
                        ) : null}

                        {shouldShowAccomplishedSection && stageMeta.activeStep === 7 ? (
                          <AccomplishedReportPanel
                            summary={accomplishedDistributionSummary}
                            visibility={dafacAidVisibility}
                            onExport={handleExportAccomplishedPdf}
                            disabled={distributionSubmitting || !latestRequest?._id}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {!showEditorSection && !latestRequest ? (
                  <section className="rrf-card rrf-empty-card">
                    <div className="rrf-empty-inline">
                      <div>
                        <h2>No active request</h2>
                      </div>

                      <button
                        type="button"
                        className="rrf-btn rrf-btn-primary"
                        onClick={handleStartNewRequest}
                      >
                        Prepare New Request
                        <FaPlus />
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>

              {confirmState.open && typeof document !== 'undefined'
                ? createPortal(
                <div className="rrf-modal-backdrop" onClick={closeConfirmation}>
                  <div className="rrf-modal-card" onClick={(e) => e.stopPropagation()}>
                    <h3>{confirmState.title}</h3>
                    <p>{confirmState.message}</p>

                    <div className="rrf-modal-actions">
                      <button
                        type="button"
                        className="rrf-btn rrf-btn-secondary"
                        onClick={closeConfirmation}
                        disabled={submittingAction}
                      >
                        Go Back
                        <FaTimes />
                      </button>
                      <button
                        type="button"
                        className={`rrf-btn ${
                          confirmState.action === 'cancel'
                            ? 'rrf-btn-danger'
                            : 'rrf-btn-primary'
                        }`}
                        onClick={handleConfirmAction}
                        disabled={submittingAction}
                      >
                        {submittingAction ? 'Processing…' : 'Confirm'}
                        {confirmState.action === 'cancel' ? <FaTimes /> : <FaCheck />}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              ) : null}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
