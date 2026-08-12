import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import "../css/InventoryAdd.css";
import DashboardShell from "../layout/DashboardShell";
import { useAuth } from "../../context/AuthContext";
import {
  canEditInventoryType,
  getInventoryViewTypes,
  normalizeRole,
} from "../auth/roleAccessUtils";
import {
  FaBlender,
  FaArchive,
  FaBell,
  FaBoxes,
  FaCheck,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaFilePdf,
  FaFileInvoiceDollar,
  FaHistory,
  FaMoneyBillWave,
  FaPen,
  FaPlus,
  FaRedo,
  FaSave,
  FaTimes,
  FaTrash,
  FaUndo,
  FaUpload,
} from "react-icons/fa";
import {
  INVENTORY_IMPORT_HEADER_ALIASES,
  getInventoryImportModeConfig,
  validateInventoryImportRow,
} from "./inventoryImportUtils";
import {
  mapSpreadsheetRow,
  parseSafeNumber,
} from "../shared/spreadsheetImportUtils";
import { resolveInventoryType } from "./inventoryTypeUtils";
import {
  getTodayInputDate,
  validateFutureOrTodayInventoryDate,
} from "./inventoryExpiryUtils";
import { API_BASE_URL } from "../../config/api";
import ProofDocumentPreview from "./ProofDocumentPreview";
import {
  buildProofFileHref,
  buildProofFileHrefCandidates,
  isImageProofFile,
} from "./proofFileUtils";
import {
  MAX_INVENTORY_CATEGORY_LENGTH as MAX_CUSTOM_CATEGORY_LENGTH,
  MAX_INVENTORY_DESCRIPTION_LENGTH as MAX_DESCRIPTION_LENGTH,
  MAX_INVENTORY_NAME_LENGTH as MAX_NAME_LENGTH,
  MAX_INVENTORY_SEARCH_LENGTH as MAX_SEARCH_LENGTH,
  MAX_INVENTORY_SOURCE_NAME_LENGTH as MAX_SOURCE_NAME_LENGTH,
  MAX_INVENTORY_UNIT_LENGTH as MAX_UNIT_LENGTH,
  sanitizeInventoryCompactText,
  sanitizeInventoryNoteText,
  sanitizeInventoryReferenceText,
  sanitizeInventorySearchText,
} from "./inventoryTextUtils";

const BASE_URL = API_BASE_URL;

const CUSTOM_CATEGORY_VALUE = "__custom__";
const TOAST_LIMIT = 3;
const TOAST_DURATION = 10000;
const DEFAULT_NON_EXPIRING_GOODS_CATEGORIES = [
  "clothes",
  "shoes/footwear",
  "blankets",
  "mats",
  "towels",
  "bedding",
  "mosquito nets",
];
const DEFAULT_APPLIANCE_CATEGORIES = [
  "kitchen appliances",
  "cleaning appliances",
  "cooling appliances",
  "lighting equipment",
  "communication devices",
  "power equipment",
  "emergency equipment",
];
const CUSTOM_UNIT_VALUE = "__custom_unit__";
const MAX_QUANTITY = 1000000;
const MAX_AMOUNT = 1000000000;
const ALLOWED_PROOF_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
];
const DOCUMENT_PROOF_EXTENSIONS = ["pdf", "doc", "docx"];
const CATEGORY_UNIT_HINTS = [
  { keywords: ["rice", "grain", "corn"], units: ["kg", "sack", "bag"] },
  { keywords: ["water", "drink", "juice", "milk"], units: ["bottle", "liter", "gallon", "box"] },
  { keywords: ["canned", "sardines", "tuna"], units: ["can", "box", "pack"] },
  { keywords: ["noodle", "biscuit", "snack", "food"], units: ["pack", "box", "piece"] },
  { keywords: ["clothes", "blanket", "towel", "bedding", "mat"], units: ["piece", "set", "bundle"] },
  { keywords: ["hygiene", "kit", "soap", "toothpaste"], units: ["piece", "pack", "box"] },
];

const getFileExtension = (value = "") => {
  const parts = String(value || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
};

const isDocumentProofFile = (value = "") => {
  const fileName = typeof value === "string" ? value : value?.name || "";
  return DOCUMENT_PROOF_EXTENSIONS.includes(getFileExtension(fileName));
};

const getProofAcceptValue = () =>
  ALLOWED_PROOF_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const SOURCE_TYPE_LABELS = {
  external: "Donated",
  government: "NGO",
  internal: "LGU",
};

const getSourceTypeLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return SOURCE_TYPE_LABELS[normalized] || String(value || "").trim() || "-";
};

const extractReferenceFromDescription = (description = "") => {
  const match = String(description || "").match(/Reference Number:\s*(.+)$/im);
  return match ? String(match[1] || "").trim() : "";
};

const stripReferenceFromDescription = (description = "") =>
  String(description || "")
    .replace(/\n?\s*Reference Number:\s*.+$/im, "")
    .trim();

const InventoryAdd = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = normalizeRole(user?.role || localStorage.getItem("role"));
  const isAdmin = role === "admin";
  const isDrrmo = role === "drrmo";
  const isAccountant = role === "accountant";
  const canReviewMobileDonations = isAdmin || isAccountant;
  const allowedDonationTypes = useMemo(
    () => (isAdmin ? ["monetary"] : getInventoryViewTypes(role)),
    [isAdmin, role]
  );
  const defaultDonationType = isAccountant ? "monetary" : allowedDonationTypes[0] || "goods";
  const canAccessInventoryAdd = isAdmin || isDrrmo || isAccountant;
  const donationQueuePath = isAdmin
    ? "/admin/donations/queue"
    : isAccountant
    ? "/accountant/donations/queue"
    : "";
  const [items, setItems] = useState([]);
  const [archivedItems, setArchivedItems] = useState([]);
  const [proofFiles, setProofFiles] = useState([]);
  const [proofPreview, setProofPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [donationType, setDonationType] = useState(defaultDonationType);
  const canEditSelectedType = canEditInventoryType(role, donationType);
  const [editingItemId, setEditingItemId] = useState("");
  const [existingProofCount, setExistingProofCount] = useState(0);
  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);
  const toastTimersRef = useRef({});
  const [confirmationDialog, setConfirmationDialog] = useState(null);
  const [importingFile, setImportingFile] = useState(false);
  const [importInfo, setImportInfo] = useState({
    hasImported: false,
    fileName: "",
    importedCount: 0,
    skippedCount: 0,
    issues: [],
  });

  const [toasts, setToasts] = useState([]);

  const getToastIcon = (type) => {
    if (type === "success") return <FaCheck />;
    if (type === "error") return <FaTimes />;
    if (type === "warning") return <FaExclamationTriangle />;
    return <FaBell />;
  };

  const openConfirmationDialog = (config) => {
    setConfirmationDialog({
      title: "Confirm Action",
      message: "Please confirm before continuing.",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      tone: "primary",
      icon: <FaExclamationTriangle />,
      ...config,
    });
  };

  const closeConfirmationDialog = () => {
    if (loading) return;
    setConfirmationDialog(null);
  };

  const confirmDialogAction = async () => {
    if (!confirmationDialog?.onConfirm) return;
    await confirmationDialog.onConfirm();
    setConfirmationDialog(null);
  };

  const [form, setForm] = useState({
    type: "goods",
    name: "",
    category: "",
    customCategory: "",
    requiresExpiration: "required",
    quantity: "",
    unit: "",
    amount: "",
    referenceNumber: "",
    expirationDate: "",
    condition: "brand_new",
    usageDuration: "",
    description: "",
    sourceType: "external",
    sourceName: ""
  });

  const [formErrors, setFormErrors] = useState({});

  const [filters, setFilters] = useState({
    search: "",
    category: "",
    expiryStatus: "",
    addedBy: "",
    date: ""
  });

  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc"
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const minExpirationDate = useMemo(() => getTodayInputDate(), []);

  const pushToast = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setToasts((prev) => [{ id, message, type }, ...prev].slice(0, TOAST_LIMIT));

    if (toastTimersRef.current[id]) {
      clearTimeout(toastTimersRef.current[id]);
    }

    toastTimersRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      delete toastTimersRef.current[id];
    }, TOAST_DURATION);
  }, []);

  const removeToast = (id) => {
    if (toastTimersRef.current[id]) {
      clearTimeout(toastTimersRef.current[id]);
      delete toastTimersRef.current[id];
    }

    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) =>
        clearTimeout(timer)
      );
    };
  }, []);

  useEffect(() => {
    if (!allowedDonationTypes.includes(donationType)) {
      setDonationType(defaultDonationType);
    }
  }, [allowedDonationTypes, defaultDonationType, donationType]);

  const normalizeType = (type) => (type || "goods").toLowerCase();

  const normalizeCategoryValue = useCallback((value) => {
    return String(value || "").trim().toLowerCase();
  }, []);

  const isGoodsCategoryExpiryRequired = useCallback(
    (category, explicitRule) => {
      const value = normalizeCategoryValue(category);
      if (!value) return false;

      if (explicitRule === "required") return true;
      if (explicitRule === "not_required") return false;

      return !DEFAULT_NON_EXPIRING_GOODS_CATEGORIES.includes(value);
    },
    [normalizeCategoryValue]
  );

  const getExpiryStatus = (item) => {
    if (!item?.expirationDate) return "none";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(item.expirationDate);
    expiry.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "expired";
    if (diffDays <= 30) return "soon";
    return "ok";
  };

  const getExpiryBadgeLabel = (item) => {
    const status = getExpiryStatus(item);
    if (status === "expired") return "Expired";
    if (status === "soon") return "Expiring Soon";
    return "";
  };

  const getExpiryBadgeClass = (item) => {
    const status = getExpiryStatus(item);
    if (status === "expired") return "badge-expiry-expired";
    if (status === "soon") return "badge-expiry-soon";
    if (status === "ok") return "badge-expiry-ok";
    return "badge-expiry-none";
  };

  const fetchInventory = useCallback(async () => {
    try {
      setFetching(true);
      const res = await axios.get(`${BASE_URL}/api/inventory`, {
        withCredentials: true
      });

      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching inventory:", err);
      pushToast("Failed to fetch inventory items.", "error");
    } finally {
      setFetching(false);
    }
  }, [pushToast]);

  const fetchArchivedInventory = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/inventory/archived`, {
        withCredentials: true
      });

      setArchivedItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching archived inventory:", err);
      pushToast("Failed to fetch archived inventory items.", "error");
    }
  }, [pushToast]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (showArchived) {
      fetchArchivedInventory();
    }
  }, [showArchived, fetchArchivedInventory]);

  const resetForm = () => {
    setForm({
      type: donationType,
      name: "",
      category: "",
      customCategory: "",
      requiresExpiration: "required",
      quantity: "",
      unit: "",
      amount: "",
      referenceNumber: "",
      expirationDate: "",
      condition: "brand_new",
      usageDuration: "",
      description: "",
      sourceType: "external",
      sourceName: ""
    });
    setProofFiles([]);
    setExistingProofCount(0);
    setFormErrors({});
    setEditingItemId("");
    setImportInfo({
      hasImported: false,
      fileName: "",
      importedCount: 0,
      skippedCount: 0,
      issues: [],
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (editingItemId) return;

    setForm({
      type: donationType,
      name: "",
      category: "",
      customCategory: "",
      requiresExpiration: "required",
      quantity: "",
      unit: "",
      amount: "",
      referenceNumber: "",
      expirationDate: "",
      condition: "brand_new",
      usageDuration: "",
      description: "",
      sourceType: "external",
      sourceName: ""
    });
    setProofFiles([]);
    setExistingProofCount(0);
    setFormErrors({});
    setImportInfo({
      hasImported: false,
      fileName: "",
      importedCount: 0,
      skippedCount: 0,
      issues: [],
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }

    }, [donationType, editingItemId]);

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString();
  };

  const formatShortDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  const formatExpiryDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  const formatCategory = (category) => {
    if (!category) return "-";
    return category
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const isRecentDonation = (createdAt) => {
    if (!createdAt) return false;
    const itemDate = new Date(createdAt);
    const now = new Date();
    const diffInDays = (now - itemDate) / (1000 * 60 * 60 * 24);
    return diffInDays <= 7;
  };

  const getFormTitle = () => {
    if (editingItemId) {
      if (donationType === "goods") return "Edit Goods Donation";
      if (donationType === "appliance") return "Edit Appliance Donation";
      return "Edit Monetary Donation";
    }

    if (donationType === "goods") return "Add Goods Donation";
    if (donationType === "appliance") return "Add Appliance Donation";
    return "Add Monetary Donation";
  };

  const getPrimaryFieldLabel = () => {
    if (donationType === "goods") return "Item Name";
    if (donationType === "appliance") return "Appliance Name";
    return "Donor Name";
  };

  const getPrimaryFieldPlaceholder = () => {
    if (donationType === "goods") {
      return "e.g. Rice, Canned Goods, Hygiene Kit";
    }
    if (donationType === "appliance") {
      return "e.g. Electric Fan, Generator, Radio";
    }
    return "e.g. Juan Dela Cruz, ABC Foundation";
  };

  const getSourceNamePlaceholder = () => {
    if (donationType === "goods" || donationType === "appliance") {
      return "e.g. NGO, Barangay Office, Private Donor";
    }
    return "e.g. Municipal Office, Foundation, Private Sponsor";
  };

  const getProofLabel = () => {
    return "Upload at least one document proof (PDF/DOC/DOCX) and one picture proof (JPG/PNG/WEBP). Videos and unsupported files are not allowed.";
  };

  const getImportButtonLabel = () => {
    if (donationType === "monetary") return "Import Monetary Excel / CSV";
    if (donationType === "appliance") return "Import Appliance Excel / CSV";
    return "Import Goods Excel / CSV";
  };

  const buildInventoryImportSummaryText = (summary) => {
    if (!summary?.hasImported) return "";
    return `${summary.importedCount} row${summary.importedCount === 1 ? "" : "s"} imported - ${summary.skippedCount} skipped`;
  };

  const appendInventoryFormData = (formData, type, payload) => {
    formData.append("type", type);
    formData.append("name", String(payload.name || "").trim());
    formData.append("description", String(payload.description || "").trim());
    formData.append("sourceType", payload.sourceType || "external");
    formData.append("sourceName", String(payload.sourceName || "").trim());

    if (type === "goods") {
      formData.append("category", String(payload.category || "").trim().toLowerCase());
      formData.append("requiresExpiration", payload.requiresExpiration ? "true" : "false");
      formData.append("quantity", String(payload.quantity || ""));
      formData.append("unit", String(payload.unit || "").trim());
      formData.append("expirationDate", payload.expirationDate || "");
      return;
    }

    if (type === "appliance") {
      formData.append("category", String(payload.category || "").trim().toLowerCase());
      formData.append("quantity", String(payload.quantity || ""));
      formData.append("condition", payload.condition || "brand_new");
      formData.append("usageDuration", String(payload.usageDuration || "").trim());
      return;
    }

    formData.append("amount", String(payload.amount || ""));
    formData.append("referenceNumber", String(payload.referenceNumber || "").trim());
    formData.set(
      "description",
      [
        String(payload.description || "").trim(),
        payload.referenceNumber
          ? `Reference Number: ${String(payload.referenceNumber || "").trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  };

  const buildInventoryImportPayload = (mappedRow, mode) => {
    if (mode === "monetary") {
      return {
        name: String(mappedRow.itemName || "").trim(),
        amount: parseSafeNumber(mappedRow.amount),
        referenceNumber: String(mappedRow.referenceNumber || "").trim(),
        description: String(mappedRow.description || "").trim(),
        sourceType: String(mappedRow.sourceType || "external").trim().toLowerCase() || "external",
        sourceName: String(mappedRow.itemName || "").trim(),
      };
    }

    if (mode === "appliance") {
      return {
        name: String(mappedRow.itemName || "").trim(),
        category: String(mappedRow.category || mappedRow.customCategory || "").trim(),
        quantity: parseSafeNumber(mappedRow.quantity),
        condition: String(mappedRow.condition || "brand_new").trim().toLowerCase() || "brand_new",
        usageDuration: String(mappedRow.usageDuration || "").trim(),
        description: String(mappedRow.description || "").trim(),
        sourceType: String(mappedRow.sourceType || "external").trim().toLowerCase() || "external",
        sourceName: String(mappedRow.sourceName || "").trim(),
      };
    }

    return {
      name: String(mappedRow.itemName || "").trim(),
      category: String(mappedRow.category || mappedRow.customCategory || "").trim(),
      quantity: parseSafeNumber(mappedRow.quantity),
      unit: String(mappedRow.unit || "").trim(),
      expirationDate: String(mappedRow.expirationDate || "").trim(),
      requiresExpiration: Boolean(String(mappedRow.expirationDate || "").trim()),
      description: String(mappedRow.description || "").trim(),
      sourceType: String(mappedRow.sourceType || "external").trim().toLowerCase() || "external",
      sourceName: String(mappedRow.sourceName || "").trim(),
    };
  };

  const getNumberInputValue = (value) => {
    return value === 0 ? "" : value;
  };

  const validateProofFiles = useCallback(() => {
    const selectedFiles = proofFiles || [];

    if (selectedFiles.length === 0 && existingProofCount > 0) {
      return "";
    }

    if (selectedFiles.length < 2) {
      return "Upload at least 2 proof files: 1 document proof and 1 picture proof.";
    }

    const unsupportedFile = selectedFiles.find(
      (file) => !ALLOWED_PROOF_EXTENSIONS.includes(getFileExtension(file?.name))
    );
    if (unsupportedFile) {
      return "Only PDF, DOC, DOCX, JPG, JPEG, PNG, and WEBP files are allowed for proof uploads.";
    }

    const hasDocumentProof = selectedFiles.some((file) => isDocumentProofFile(file));
    const hasImageProof = selectedFiles.some((file) => isImageProofFile(file));

    if (!hasDocumentProof || !hasImageProof) {
      return "Proof uploads must include at least 1 document proof and 1 picture proof.";
    }

    return "";
  }, [existingProofCount, proofFiles]);

  const getFinalGoodsCategory = useCallback(() => {
    if (form.category === CUSTOM_CATEGORY_VALUE) {
      return normalizeCategoryValue(form.customCategory);
    }
    return normalizeCategoryValue(form.category);
  }, [form.category, form.customCategory, normalizeCategoryValue]);

  const isExpiryRequired = useMemo(() => {
    if (donationType !== "goods") return false;
    return isGoodsCategoryExpiryRequired(
      getFinalGoodsCategory(),
      form.category === CUSTOM_CATEGORY_VALUE ? form.requiresExpiration : undefined
    );
  }, [donationType, getFinalGoodsCategory, isGoodsCategoryExpiryRequired, form.category, form.requiresExpiration]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "quantity" || name === "amount") {
      if (value === "") {
        setForm((prev) => ({ ...prev, [name]: "" }));
      } else {
        const parsedValue = Number(value);
        const maxValue = name === "quantity" ? MAX_QUANTITY : MAX_AMOUNT;
        if (!Number.isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= maxValue) {
          setForm((prev) => ({ ...prev, [name]: value }));
        }
      }
    } else if (name === "name") {
      setForm((prev) => ({
        ...prev,
        name: sanitizeInventoryCompactText(value, MAX_NAME_LENGTH),
      }));
    } else if (name === "sourceName") {
      setForm((prev) => ({
        ...prev,
        sourceName: sanitizeInventoryCompactText(value, MAX_SOURCE_NAME_LENGTH, {
          maxTokenLength: 32,
        }),
      }));
    } else if (name === "description") {
      setForm((prev) => ({
        ...prev,
        description: sanitizeInventoryNoteText(value, MAX_DESCRIPTION_LENGTH),
      }));
    } else if (name === "referenceNumber") {
      setForm((prev) => ({
        ...prev,
        referenceNumber: sanitizeInventoryReferenceText(value),
      }));
    } else if (name === "customCategory") {
      setForm((prev) => ({
        ...prev,
        customCategory: sanitizeInventoryCompactText(
          value,
          MAX_CUSTOM_CATEGORY_LENGTH,
          { maxTokenLength: 20 }
        ).toLowerCase(),
      }));
    } else if (name === "unit") {
      setForm((prev) => ({
        ...prev,
        unit: sanitizeInventoryCompactText(value, MAX_UNIT_LENGTH, {
          maxTokenLength: 16,
        }).toLowerCase(),
      }));
    } else if (name === "unitSelect") {
      setForm((prev) => ({
        ...prev,
        unit: value === CUSTOM_UNIT_VALUE ? "" : value,
      }));
    } else if (name === "category") {
      setForm((prev) => ({
        ...prev,
        category: value,
        customCategory: value === CUSTOM_CATEGORY_VALUE ? prev.customCategory : "",
        unit: donationType === "goods" ? "" : prev.unit,
        requiresExpiration:
          value === CUSTOM_CATEGORY_VALUE ? prev.requiresExpiration : "required",
        expirationDate: value === CUSTOM_CATEGORY_VALUE ? prev.expirationDate : ""
      }));
    } else if (name === "condition") {
      setForm((prev) => ({
        ...prev,
        condition: value,
        usageDuration: value === "used_item" ? prev.usageDuration : ""
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    setFormErrors((prev) => ({
      ...prev,
      [name]: "",
      unitSelect: "",
      category: "",
      customCategory: "",
      expirationDate: "",
      usageDuration: "",
      condition: "",
      proofFiles: "",
    }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setProofFiles(files);
    setFormErrors((prev) => ({
      ...prev,
      proofFiles: "",
    }));
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || editingItemId) return;

    setImportingFile(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames?.[0];

      if (!firstSheetName) {
        throw new Error("The selected file does not contain a worksheet.");
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      });

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        throw new Error("The selected file does not contain any data rows.");
      }

      const config = getInventoryImportModeConfig(donationType);
      const validPayloads = [];
      const issues = [];

      rawRows.forEach((rawRow, index) => {
        const mappedRow = mapSpreadsheetRow(rawRow, INVENTORY_IMPORT_HEADER_ALIASES);
        const validation = validateInventoryImportRow(mappedRow, config);

        if (!validation.isValid) {
          issues.push(`Row ${index + 2}: ${validation.issue}`);
          return;
        }

        validPayloads.push(buildInventoryImportPayload(mappedRow, config.mode));
      });

      if (!validPayloads.length) {
        throw new Error("No valid rows matched the active import tab.");
      }

      for (const payload of validPayloads) {
        const formData = new FormData();
        appendInventoryFormData(formData, config.mode, payload);
        await axios.post(`${BASE_URL}/api/inventory`, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      const nextImportInfo = {
        hasImported: true,
        fileName: file.name,
        importedCount: validPayloads.length,
        skippedCount: issues.length,
        issues,
      };

      setImportInfo(nextImportInfo);
      pushToast(
        `${validPayloads.length} ${config.mode} row${validPayloads.length === 1 ? "" : "s"} imported successfully.`,
        "success"
      );
      fetchInventory();
    } catch (err) {
      console.error("Error importing inventory file:", err);
      setImportInfo({
        hasImported: false,
        fileName: "",
        importedCount: 0,
        skippedCount: 0,
        issues: [],
      });
      pushToast(err?.message || "Failed to import inventory file.", "error");
    } finally {
      setImportingFile(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const keepTextInputKeysLocal = (e) => {
    e.stopPropagation();
  };

  const handleReferenceNumberKeyDown = (e) => {
    keepTextInputKeysLocal(e);

    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      [
        "Backspace",
        "Delete",
        "Tab",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Enter",
      ].includes(e.key)
    ) {
      return;
    }

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name =
        donationType === "goods"
          ? "Item name is required."
          : donationType === "appliance"
          ? "Appliance name is required."
          : "Donor name is required.";
    }

    if (form.name.trim().length > MAX_NAME_LENGTH) {
      errors.name = `Name must be ${MAX_NAME_LENGTH} characters or less.`;
    }

    if (donationType === "goods") {
      const finalCategory = getFinalGoodsCategory();

      if (!finalCategory) {
        errors.category = "Category is required.";
      }

      if (
        form.category === CUSTOM_CATEGORY_VALUE &&
        !normalizeCategoryValue(form.customCategory)
      ) {
        errors.customCategory = "Please enter a custom category.";
      }

      if (form.quantity === "" || Number(form.quantity) <= 0) {
        errors.quantity = "Quantity must be greater than 0.";
      } else if (Number(form.quantity) > MAX_QUANTITY) {
        errors.quantity = `Quantity must not exceed ${MAX_QUANTITY.toLocaleString()}.`;
      }

      if (!form.unit.trim()) {
        errors.unit = "Unit is required for goods donations.";
      } else if (form.unit.trim().length > MAX_UNIT_LENGTH) {
        errors.unit = `Unit must be ${MAX_UNIT_LENGTH} characters or less.`;
      }

      if (form.expirationDate) {
        const expirationDateError = validateFutureOrTodayInventoryDate(
          form.expirationDate
        );
        if (expirationDateError) {
          errors.expirationDate = expirationDateError;
        }
      }

      if (isExpiryRequired && !form.expirationDate) {
        errors.expirationDate =
          "Expiration date is required for this goods category.";
      }
    }

    if (donationType === "appliance") {
      const finalCategory = getFinalGoodsCategory();

      if (!finalCategory) {
        errors.category = "Category is required.";
      }

      if (
        form.category === CUSTOM_CATEGORY_VALUE &&
        !normalizeCategoryValue(form.customCategory)
      ) {
        errors.customCategory = "Please enter a custom category.";
      }

      if (form.quantity === "" || Number(form.quantity) <= 0) {
        errors.quantity = "Quantity must be greater than 0.";
      } else if (Number(form.quantity) > MAX_QUANTITY) {
        errors.quantity = `Quantity must not exceed ${MAX_QUANTITY.toLocaleString()}.`;
      }

      if (!form.condition) {
        errors.condition = "Condition is required.";
      }

      if (form.condition === "used_item" && !form.usageDuration.trim()) {
        errors.usageDuration = "Usage duration is required for used appliances.";
      }
    }

    if (donationType === "monetary") {
      if (form.amount === "" || Number(form.amount) <= 0) {
        errors.amount = "Amount must be greater than 0.";
      } else if (Number(form.amount) > MAX_AMOUNT) {
        errors.amount = "Amount is too large.";
      }

      if (!form.referenceNumber.trim()) {
        errors.referenceNumber = "Reference number is required.";
      }
    }

    if (!form.sourceType.trim()) {
      errors.sourceType = "Source type is required.";
    }

    if (
      (donationType === "goods" || donationType === "appliance") &&
      form.sourceName.trim().length > MAX_SOURCE_NAME_LENGTH
    ) {
      errors.sourceName = `Source name must be ${MAX_SOURCE_NAME_LENGTH} characters or less.`;
    }

    if (form.description.trim().length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`;
    }

    const proofFilesError = validateProofFiles();
    if (proofFilesError) {
      errors.proofFiles = proofFilesError;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openEditForm = (item) => {
    const itemType = resolveInventoryType(item);

    setDonationType(itemType);
    setEditingItemId(item._id);
    setShowForm(true);
    setFormErrors({});
    setProofFiles([]);
    setExistingProofCount(Array.isArray(item.proofFiles) ? item.proofFiles.length : 0);

    setForm({
      type: itemType,
      name: item.name || "",
      category:
        itemType === "goods" || itemType === "appliance"
          ? item.category || ""
          : "",
      customCategory: "",
      requiresExpiration:
        itemType === "goods" && item.requiresExpiration === false
          ? "not_required"
          : "required",
      quantity:
        (itemType === "goods" || itemType === "appliance") &&
        item.quantity !== undefined
          ? String(item.quantity)
          : "",
      unit: itemType === "goods" ? item.unit || "" : "",
      amount:
        itemType === "monetary" && item.amount !== undefined
          ? String(item.amount)
          : "",
      referenceNumber:
        itemType === "monetary"
          ? item.referenceNumber || extractReferenceFromDescription(item.description)
          : "",
      expirationDate:
        itemType === "goods" && item.expirationDate
          ? new Date(item.expirationDate).toISOString().slice(0, 10)
          : "",
      condition: itemType === "appliance" ? item.condition || "brand_new" : "brand_new",
      usageDuration:
        itemType === "appliance" ? item.usageDuration || "" : "",
      description:
        itemType === "monetary"
          ? stripReferenceFromDescription(item.description)
          : item.description || "",
      sourceType: item.sourceType || "external",
      sourceName: item.sourceName || ""
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("type", donationType);
      formData.append("name", form.name.trim());
      formData.append("description", form.description.trim());
      formData.append("sourceType", form.sourceType);
      formData.append(
        "sourceName",
        donationType === "monetary" ? form.name.trim() : form.sourceName.trim()
      );

      if (donationType === "goods") {
        formData.append("category", getFinalGoodsCategory());
        formData.append(
          "requiresExpiration",
          isExpiryRequired ? "true" : "false"
        );
        if (form.quantity !== "") {
          formData.append("quantity", form.quantity);
        }
        formData.append("unit", form.unit.trim());
        formData.append("expirationDate", form.expirationDate || "");
      } else if (donationType === "appliance") {
        formData.append("category", getFinalGoodsCategory());
        if (form.quantity !== "") {
          formData.append("quantity", form.quantity);
        }
        formData.append("condition", form.condition);
        formData.append("usageDuration", form.condition === "used_item" ? form.usageDuration.trim() : "");
      } else {
        if (form.amount !== "") {
          formData.append("amount", form.amount);
        }
        formData.append("referenceNumber", form.referenceNumber.trim());
        formData.set(
          "description",
          [
            stripReferenceFromDescription(form.description),
            form.referenceNumber.trim()
              ? `Reference Number: ${form.referenceNumber.trim()}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        );
      }

      for (let i = 0; i < proofFiles.length; i++) {
        formData.append("proofFiles", proofFiles[i]);
      }

      if (editingItemId) {
        await axios.put(`${BASE_URL}/api/inventory/${editingItemId}`, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" }
        });

        pushToast("Inventory item updated successfully.", "success");
      } else {
        await axios.post(`${BASE_URL}/api/inventory`, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" }
        });

        pushToast(
          donationType === "goods"
            ? "Goods donation added successfully."
            : donationType === "appliance"
            ? "Appliance donation added successfully."
            : "Monetary donation added successfully.",
          "success"
        );
      }

      resetForm();
        setShowForm(false);
        fetchInventory();
    } catch (err) {
      console.error("Error saving inventory:", err);
      pushToast(
        err?.response?.data?.message || "Failed to save inventory item.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (id, name) => {
    openConfirmationDialog({
      title: "Archive inventory record?",
      message: `"${name || "This item"}" will move to archived donations and leave the active inventory list.`,
      confirmLabel: "Archive Record",
      tone: "danger",
      icon: <FaArchive />,
      onConfirm: async () => {
        try {
          await axios.delete(`${BASE_URL}/api/inventory/${id}`, {
            withCredentials: true
          });

            pushToast("Inventory item archived successfully.", "success");
            fetchInventory();
        } catch (err) {
          console.error("Error archiving item:", err);
          pushToast(
            err?.response?.data?.message || "Failed to archive item.",
            "error"
          );
        }
      }
    });
  };

  const handleUnarchive = async (id, name) => {
    openConfirmationDialog({
      title: "Restore archived record?",
      message: `"${name || "This item"}" will return to active inventory and become available again.`,
      confirmLabel: "Restore Record",
      tone: "primary",
      icon: <FaUndo />,
      onConfirm: async () => {
        try {
          await axios.put(
            `${BASE_URL}/api/inventory/archived/${id}/restore`,
            {},
            { withCredentials: true }
          );

          pushToast("Inventory item unarchived successfully.", "success");
            fetchArchivedInventory();
            fetchInventory();
        } catch (err) {
          console.error("Error unarchiving item:", err);
          pushToast(
            err?.response?.data?.message || "Failed to unarchive item.",
            "error"
          );
        }
      }
    });
  };

  const handlePermanentDelete = async (id, name) => {
    openConfirmationDialog({
      title: "Permanently delete record?",
      message: `"${name || "This item"}" will be permanently deleted. This action cannot be undone.`,
      confirmLabel: "Delete Permanently",
      tone: "danger",
      icon: <FaTrash />,
      onConfirm: async () => {
        try {
          await axios.delete(`${BASE_URL}/api/inventory/archived/${id}/permanent`, {
            withCredentials: true
          });

            pushToast("Inventory item deleted permanently.", "success");
            fetchArchivedInventory();
        } catch (err) {
          console.error("Error deleting archived item:", err);
          pushToast(
            err?.response?.data?.message || "Failed to permanently delete item.",
            "error"
          );
        }
      }
    });
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: name === "search" ? sanitizeInventorySearchText(value) : value,
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      category: "",
      expiryStatus: "",
      addedBy: "",
      date: ""
    });
    setCurrentPage(1);
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key,
        direction: "asc"
      };
    });
  };

  const exportInventoryPdf = useCallback(() => {
    try {
      let reportType = "masterlist";

      if (showArchived) {
        reportType = "archived";
      } else if (donationType === "monetary") {
        reportType = "monetary_donations";
      } else if (donationType === "appliance") {
        reportType = "appliance_donations";
      } else {
        reportType = "goods_donations";
      }

      const pdfUrl = `${BASE_URL}/api/inventory/export-pdf?reportType=${reportType}`;
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      pushToast("Opening inventory PDF...", "info");
    } catch (error) {
      console.error("Export inventory PDF error:", error);
      pushToast("Failed to open inventory PDF.", "error");
    }
  }, [showArchived, donationType, pushToast]);

  const goodsItems = useMemo(
    () => items.filter((item) => resolveInventoryType(item) === "goods"),
    [items]
  );

  const monetaryItems = useMemo(
    () => items.filter((item) => resolveInventoryType(item) === "monetary"),
    [items]
  );

  const applianceItems = useMemo(
    () => items.filter((item) => resolveInventoryType(item) === "appliance"),
    [items]
  );

  const currentTypeItems = useMemo(() => {
    const sourceItems = showArchived ? archivedItems : items;
    return sourceItems.filter((item) => resolveInventoryType(item) === donationType);
  }, [items, archivedItems, donationType, showArchived]);

  const allTypeItems = useMemo(() => {
    return [...items, ...archivedItems].filter(
      (item) => resolveInventoryType(item) === donationType
    );
  }, [items, archivedItems, donationType]);

  const categories = useMemo(() => {
    if (donationType === "monetary") return [];
    const unique = [...new Set(allTypeItems.map((item) => item.category).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [allTypeItems, donationType]);

  const selectableCategoryOptions = useMemo(() => {
    const defaults =
      donationType === "appliance"
        ? DEFAULT_APPLIANCE_CATEGORIES
        : DEFAULT_NON_EXPIRING_GOODS_CATEGORIES;
    const merged = [...new Set([...defaults, ...categories].filter(Boolean))];
    return merged.sort((a, b) => a.localeCompare(b));
  }, [categories, donationType]);

  const unitOptions = useMemo(() => {
    if (donationType !== "goods") return [];

    const finalCategory = getFinalGoodsCategory();
    const categoryUnits = allTypeItems
      .filter((item) => normalizeCategoryValue(item.category) === finalCategory)
      .map((item) => String(item.unit || "").trim().toLowerCase())
      .filter(Boolean);

    const hintedUnits = CATEGORY_UNIT_HINTS.flatMap((entry) =>
      entry.keywords.some((keyword) => finalCategory.includes(keyword)) ? entry.units : []
    );

    return [...new Set([...hintedUnits, ...categoryUnits, "piece", "pack", "box"])].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [allTypeItems, donationType, getFinalGoodsCategory, normalizeCategoryValue]);

  const selectedUnitValue = useMemo(() => {
    if (donationType !== "goods") return "";
    if (form.category === CUSTOM_CATEGORY_VALUE) return CUSTOM_UNIT_VALUE;
    return unitOptions.includes(String(form.unit || "").trim().toLowerCase())
      ? String(form.unit || "").trim().toLowerCase()
      : CUSTOM_UNIT_VALUE;
  }, [donationType, form.category, form.unit, unitOptions]);

  const addedByOptions = useMemo(() => {
    const unique = [
      ...new Set(currentTypeItems.map((item) => item.addedBy).filter(Boolean))
    ];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [currentTypeItems]);

    const summary = useMemo(() => {
    const totalItems = isAdmin
      ? monetaryItems.length
      : goodsItems.length + applianceItems.length;
    const totalGoodsEntries = goodsItems.length;
    const totalMonetaryEntries = monetaryItems.length;
    const totalApplianceEntries = applianceItems.length;

    const totalGoodsQuantity = goodsItems.reduce((sum, item) => {
      const qty = Number(item.quantity);
      return sum + (Number.isNaN(qty) ? 0 : qty);
    }, 0);

    const totalMonetaryAmount = monetaryItems.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0);

    const totalApplianceQuantity = applianceItems.reduce((sum, item) => {
      const qty = Number(item.quantity);
      return sum + (Number.isNaN(qty) ? 0 : qty);
    }, 0);

    const recentDonationsCount = items.filter((item) =>
      isRecentDonation(item.createdAt)
    ).length;
    const expiredItemsCount = goodsItems.filter(
      (item) => getExpiryStatus(item) === "expired"
    ).length;

    return {
      totalItems,
      totalGoodsEntries,
      totalMonetaryEntries,
      totalApplianceEntries,
      totalGoodsQuantity,
      totalMonetaryAmount,
      totalApplianceQuantity,
      recentDonationsCount,
      expiredItemsCount
    };
  }, [items, goodsItems, monetaryItems, applianceItems, isAdmin]);

  const filteredItems = useMemo(() => {
    let filtered = [...currentTypeItems];

    if (filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter((item) =>
        [
          item.name,
          item.description,
          item.category,
          item.addedBy,
          item.unit,
          item.sourceType,
          item.sourceName,
          item.expirationDate
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm)
      );
    }

    if ((donationType === "goods" || donationType === "appliance") && filters.category) {
      filtered = filtered.filter(
        (item) =>
          (item.category || "").toLowerCase() === filters.category.toLowerCase()
      );
    }

    if (donationType === "goods" && filters.expiryStatus) {
      filtered = filtered.filter((item) => {
        const status = getExpiryStatus(item);
        return status === filters.expiryStatus;
      });
    }

    if (filters.addedBy) {
      filtered = filtered.filter(
        (item) =>
          (item.addedBy || "").toLowerCase() === filters.addedBy.toLowerCase()
      );
    }

    if (filters.date) {
      filtered = filtered.filter((item) => {
        if (!item.createdAt) return false;
        const itemDate = new Date(item.createdAt).toISOString().slice(0, 10);
        return itemDate === filters.date;
      });
    }

    return filtered;
  }, [currentTypeItems, filters, donationType]);

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];

    sorted.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === "type") {
        aValue = normalizeType(a.type);
        bValue = normalizeType(b.type);
      }

      if (sortConfig.key === "createdAt" || sortConfig.key === "expirationDate") {
        aValue = a[sortConfig.key] ? new Date(a[sortConfig.key]).getTime() : 0;
        bValue = b[sortConfig.key] ? new Date(b[sortConfig.key]).getTime() : 0;
      }

      if (sortConfig.key === "quantity") {
        aValue =
          donationType === "monetary"
            ? Number(a.amount || 0)
            : Number(a.quantity) || 0;

        bValue =
          donationType === "monetary"
            ? Number(b.amount || 0)
            : Number(b.quantity) || 0;
      }

      if (typeof aValue === "string") aValue = aValue.toLowerCase();
      if (typeof bValue === "string") bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredItems, sortConfig, donationType]);

  const totalPages = Math.ceil(sortedItems.length / rowsPerPage) || 1;

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedItems.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedItems, currentPage, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const pageNumbers = useMemo(() => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }, [totalPages]);

  const sortArrow = (key) => {
    if (sortConfig.key !== key) return "Sort";
    return sortConfig.direction === "asc" ? "Asc" : "Desc";
  };

  const tableColSpan =
    donationType === "goods" ? 11 : donationType === "appliance" ? 10 : 9;

  if (!canAccessInventoryAdd) {
    return (
      <DashboardShell>
        <div className="inventory-page">
          <div className="inventory-shell">
            <div className="inventory-card">
              <div className="table-empty">
                <h4>Inventory donation intake is not available for this account.</h4>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="inventory-page">
        <div className="inventory-shell">
          {typeof document !== "undefined"
            ? createPortal(
                <div className="notification-stack">
                  {toasts.map((toast) => (
                    <button
                      key={toast.id}
                      type="button"
                      className={`notification-toast ${toast.type}`}
                      onClick={() => removeToast(toast.id)}
                    >
                      <span className="notification-icon">{getToastIcon(toast.type)}</span>
                      <span className="notification-text">{toast.message}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )
            : null}

          {proofPreview && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="inventory-add-proof-modal"
                  role="presentation"
                  onClick={() => setProofPreview(null)}
                >
                  <div
                    className="inventory-add-proof-modal-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label={proofPreview.label || "Proof preview"}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="inventory-add-proof-modal-close"
                      onClick={() => setProofPreview(null)}
                      aria-label="Close proof preview"
                    >
                      <FaTimes />
                    </button>

                    {!proofPreview.missing && proofPreview.candidates?.[proofPreview.index] ? (
                      proofPreview.isImage ? (
                        <img
                          src={proofPreview.candidates[proofPreview.index]}
                          alt={proofPreview.label || "Proof preview"}
                          onError={() => {
                            setProofPreview((current) => {
                              if (!current) return current;
                              const nextIndex = current.index + 1;
                              if (nextIndex < (current.candidates?.length || 0)) {
                                return { ...current, index: nextIndex };
                              }
                              return { ...current, missing: true };
                            });
                          }}
                        />
                      ) : (
                        <ProofDocumentPreview
                          title={proofPreview.label || "Proof document"}
                          candidates={proofPreview.candidates || []}
                        />
                      )
                    ) : (
                      <div className="inventory-add-proof-modal-empty">
                        <FaFilePdf />
                        <h3>Proof file not available</h3>
                        <p>
                          This proof points to an older local upload that is no longer
                          on this server. Re-upload the proof file to save a durable copy.
                        </p>
                      </div>
                    )}
                  </div>
                </div>,
                document.body
              )
            : null}

          {confirmationDialog && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="inventory-confirm-backdrop"
                  role="presentation"
                  onClick={closeConfirmationDialog}
                >
                  <div
                    className={`inventory-confirm-card ${confirmationDialog.tone || "primary"}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="inventory-add-confirm-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inventory-confirm-head">
                      <span className="inventory-confirm-icon">
                        {confirmationDialog.icon}
                      </span>
                      <div>
                        <h3 id="inventory-add-confirm-title">
                          {confirmationDialog.title}
                        </h3>
                        <p>{confirmationDialog.message}</p>
                      </div>
                    </div>

                    <div className="inventory-confirm-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={closeConfirmationDialog}
                        disabled={loading}
                      >
                        <FaTimes className="btn-icon" />
                        {confirmationDialog.cancelLabel || "Cancel"}
                      </button>
                      <button
                        type="button"
                        className={`btn ${
                          confirmationDialog.tone === "danger"
                            ? "btn-danger"
                            : "btn-primary"
                        }`}
                        onClick={confirmDialogAction}
                        disabled={loading}
                      >
                        {confirmationDialog.tone === "danger" ? (
                          <FaTrash className="btn-icon" />
                        ) : (
                          <FaCheck className="btn-icon" />
                        )}
                        {confirmationDialog.confirmLabel || "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}

          <div
            className={`inventory-header ${
              !showForm && !showArchived ? "inventory-header-with-summary" : ""
            }`}
          >
            <div>
              <h1 className="inventory-title">Add Donations to Inventory</h1>
            </div>

            {!showForm && (
              <div className="inventory-header-actions">
                <button
                  className="btn btn-primary"
                  onClick={exportInventoryPdf}
                >
                  <FaFilePdf className="btn-icon" />
                  Export PDF
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowArchived((prev) => !prev);
                    setCurrentPage(1);
                    clearFilters();
                  }}
                >
                  {showArchived ? (
                    <FaUndo className="btn-icon" />
                  ) : (
                    <FaHistory className="btn-icon" />
                  )}
                  {showArchived ? "Back to Active Donations" : "View Archived Donations"}
                </button>

                <button
                  className="btn btn-primary"
                  disabled={!canEditSelectedType}
                  onClick={() => {
                    if (!canEditSelectedType) return;
                    setEditingItemId("");
                    setShowForm(true);
                  }}
                >
                  <FaPlus className="btn-icon" />
                  {canEditSelectedType
                    ? `Add ${
                        donationType === "goods"
                          ? "Goods"
                          : donationType === "appliance"
                          ? "Appliance"
                          : "Monetary"
                      } Donation`
                    : "View-only inventory"}
                </button>
              </div>
            )}

            {!showForm && !showArchived && (
              <div className="summary-grid inventory-header-summary">
                <div className="summary-card muted">
                  <div className="summary-card-top">
                    <p className="summary-label">Total Inventory Records</p>
                    <span className="summary-icon"><FaArchive /></span>
                  </div>
                  <h3 className="summary-value">{summary.totalItems}</h3>
                </div>

                {allowedDonationTypes.includes("goods") ? (
                  <div className="summary-card success">
                    <div className="summary-card-top">
                      <p className="summary-label">Goods Donations</p>
                      <span className="summary-icon"><FaBoxes /></span>
                    </div>
                    <h3 className="summary-value">{summary.totalGoodsEntries}</h3>
                    <span className="summary-note">
                      Total quantity: {summary.totalGoodsQuantity}
                    </span>
                  </div>
                ) : null}

                {allowedDonationTypes.includes("monetary") ? (
                  <div className="summary-card info">
                    <div className="summary-card-top">
                      <p className="summary-label">Monetary Donations</p>
                      <span className="summary-icon"><FaMoneyBillWave /></span>
                    </div>
                    <h3 className="summary-value">{summary.totalMonetaryEntries}</h3>
                  </div>
                ) : null}

                {allowedDonationTypes.includes("monetary") ? (
                  <div className="summary-card info">
                    <div className="summary-card-top">
                      <p className="summary-label">Total Monetary Amount</p>
                      <span className="summary-icon"><FaMoneyBillWave /></span>
                    </div>
                    <h3 className="summary-value">
                      PHP {summary.totalMonetaryAmount.toLocaleString()}
                    </h3>
                  </div>
                ) : null}

                {allowedDonationTypes.includes("appliance") ? (
                  <div className="summary-card warning">
                    <div className="summary-card-top">
                      <p className="summary-label">Appliance Donations</p>
                      <span className="summary-icon"><FaBlender /></span>
                    </div>
                    <h3 className="summary-value">{summary.totalApplianceEntries}</h3>
                    <span className="summary-note">
                      Total quantity: {summary.totalApplianceQuantity}
                    </span>
                  </div>
                ) : null}

                <div className="summary-card accent">
                  <div className="summary-card-top">
                    <p className="summary-label">Recent Donations</p>
                    <span className="summary-icon"><FaBell /></span>
                  </div>
                  <h3 className="summary-value">{summary.recentDonationsCount}</h3>
                </div>

                <div className="summary-card danger">
                  <div className="summary-card-top">
                    <p className="summary-label">Expired Items</p>
                    <span className="summary-icon"><FaExclamationTriangle /></span>
                  </div>
                  <h3 className="summary-value">{summary.expiredItemsCount}</h3>
                </div>
              </div>
            )}
          </div>

          {showForm ? (
            <div className="donation-modal-shell">
              <div className="donation-modal-card inventory-card">
                <div className="donation-modal-header">
                  <div className="donation-modal-heading">
                    <h2 className="section-title">{getFormTitle()}</h2>
                    <div className="donation-form-meta">
                      <span>
                        {donationType === "goods"
                          ? "Goods intake"
                          : donationType === "appliance"
                          ? "Appliance intake"
                          : "Financial intake"}
                      </span>
                      <span>{editingItemId ? "Editing record" : "New record"}</span>
                    </div>
                  </div>
                  <div className="donation-modal-actions-head">
                    {!editingItemId ? (
                      <>
                        <input
                          ref={importFileInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleImportFile}
                          style={{ display: "none" }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => importFileInputRef.current?.click()}
                          disabled={importingFile}
                        >
                          <FaUpload className="btn-icon" />
                          {importingFile ? "Importing..." : getImportButtonLabel()}
                        </button>
                      </>
                    ) : null}
                    {canReviewMobileDonations ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(donationQueuePath)}
                      >
                        <FaClipboardCheck className="btn-icon" />
                        Review Mobile Donations
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary modal-back-btn"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                    >
                      <FaUndo className="btn-icon" />
                      Back
                    </button>
                  </div>
                </div>

                {importInfo.hasImported ? (
                  <div className="donation-import-strip">
                    <div className="donation-import-strip-main">
                      <strong>{importInfo.fileName || "Imported file"}</strong>
                      <span>{buildInventoryImportSummaryText(importInfo)}</span>
                    </div>
                    {importInfo.issues?.length ? (
                      <small>{importInfo.issues.length} issue(s) skipped</small>
                    ) : null}
                  </div>
                ) : null}

                {!editingItemId && (
                  <div className="donation-type-tabs">
                    {allowedDonationTypes.includes("goods") ? (
                      <button
                        type="button"
                        className={`donation-type-tab ${
                          donationType === "goods" ? "active" : ""
                        }`}
                        onClick={() => setDonationType("goods")}
                      >
                        <FaBoxes className="btn-icon" />
                        Goods
                      </button>
                    ) : null}
                    {allowedDonationTypes.includes("appliance") ? (
                      <button
                        type="button"
                        className={`donation-type-tab ${
                          donationType === "appliance" ? "active" : ""
                        }`}
                        onClick={() => setDonationType("appliance")}
                      >
                        <FaBlender className="btn-icon" />
                        Appliances
                      </button>
                    ) : null}
                    {allowedDonationTypes.includes("monetary") ? (
                      <button
                        type="button"
                        className={`donation-type-tab ${
                          donationType === "monetary" ? "active" : ""
                        }`}
                        onClick={() => setDonationType("monetary")}
                      >
                        <FaMoneyBillWave className="btn-icon" />
                        Monetary
                      </button>
                    ) : null}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="donation-form">
                  <div className="donation-form-section">
                    <div className="donation-section-heading">
                      <span className="donation-section-icon">
                        {donationType === "goods" ? (
                          <FaBoxes />
                        ) : donationType === "appliance" ? (
                          <FaBlender />
                        ) : (
                          <FaMoneyBillWave />
                        )}
                      </span>
                      <h3>Donation Details</h3>
                      <p>Main information for this donation record.</p>
                    </div>

                    <div className="donation-form-grid">
                      <div
                        className={`donation-form-group ${
                          donationType !== "monetary" ? "span-2" : ""
                        }`}
                      >
                        <label htmlFor="name">
                          {getPrimaryFieldLabel()} <span>*</span>
                        </label>
                        <input
                          id="name"
                          type="text"
                          name="name"
                          maxLength={MAX_NAME_LENGTH}
                          placeholder={getPrimaryFieldPlaceholder()}
                          value={form.name}
                          onChange={handleChange}
                          onKeyDown={keepTextInputKeysLocal}
                          className={`input ${formErrors.name ? "input-error" : ""}`}
                        />
                        {formErrors.name && (
                          <span className="error-text">{formErrors.name}</span>
                        )}
                      </div>

                      {(donationType === "goods" || donationType === "appliance") && (
                        <>
                          <div className="donation-form-group">
                            <label htmlFor="category">
                              Category <span>*</span>
                            </label>
                              <select
                                id="category"
                                name="category"
                                value={form.category}
                                onChange={handleChange}
                                className={`input ${
                                  formErrors.category ? "input-error" : ""
                                }`}
                              >
                                <option value="">Select category</option>

                              {selectableCategoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {formatCategory(category)}
                                </option>
                              ))}

                              <option value={CUSTOM_CATEGORY_VALUE}>
                                Other / Custom Category
                              </option>
                            </select>
                            {formErrors.category && (
                              <span className="error-text">{formErrors.category}</span>
                            )}
                          </div>

                          {form.category === CUSTOM_CATEGORY_VALUE && (
                            <div className="donation-form-group">
                              <label htmlFor="customCategory">
                                Custom Category <span>*</span>
                              </label>
                              <input
                                id="customCategory"
                                type="text"
                                name="customCategory"
                                maxLength={MAX_CUSTOM_CATEGORY_LENGTH}
                                placeholder="e.g. medicine, water, shelter kits"
                                value={form.customCategory}
                                onChange={handleChange}
                                onKeyDown={keepTextInputKeysLocal}
                                className={`input ${
                                  formErrors.customCategory ? "input-error" : ""
                                }`}
                              />
                              {formErrors.customCategory && (
                                <span className="error-text">
                                  {formErrors.customCategory}
                                </span>
                              )}
                            </div>
                          )}

                          {donationType === "goods" &&
                          form.category === CUSTOM_CATEGORY_VALUE ? (
                            <div className="donation-form-group">
                              <label htmlFor="requiresExpiration">
                                Expiry Rule <span>*</span>
                              </label>
                              <select
                                id="requiresExpiration"
                                name="requiresExpiration"
                                value={form.requiresExpiration}
                                onChange={handleChange}
                                className="input"
                              >
                                <option value="required">
                                  Requires expiration date
                                </option>
                                <option value="not_required">
                                  Does not require expiration date
                                </option>
                              </select>
                            </div>
                          ) : null}

                          <div className="donation-form-group">
                            <label htmlFor="quantity">
                              Quantity <span>*</span>
                            </label>
                            <input
                              id="quantity"
                              type="number"
                              min="0"
                              step="1"
                              max={MAX_QUANTITY}
                              name="quantity"
                              placeholder="e.g. 50"
                              value={getNumberInputValue(form.quantity)}
                              onChange={handleChange}
                              className={`input ${
                                formErrors.quantity ? "input-error" : ""
                              }`}
                            />
                            {formErrors.quantity && (
                              <span className="error-text">
                                {formErrors.quantity}
                              </span>
                            )}
                          </div>

                          {donationType === "goods" ? (
                            <>
                              <div className="donation-form-group">
                                <label htmlFor="unit">
                                  Unit <span>*</span>
                                </label>
                                <select
                                  id="unit"
                                  name="unitSelect"
                                  value={selectedUnitValue}
                                  onChange={handleChange}
                                  className={`input ${
                                    formErrors.unit ? "input-error" : ""
                                  }`}
                                >
                                  <option value="">Select unit</option>
                                  {unitOptions.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {formatCategory(unit)}
                                    </option>
                                  ))}
                                  <option value={CUSTOM_UNIT_VALUE}>Other / Custom Unit</option>
                                </select>
                                {selectedUnitValue === CUSTOM_UNIT_VALUE ? (
                                  <input
                                    type="text"
                                    name="unit"
                                    maxLength={MAX_UNIT_LENGTH}
                                    placeholder="e.g. tray, bundle, pair"
                                    value={form.unit}
                                    onChange={handleChange}
                                    onKeyDown={keepTextInputKeysLocal}
                                    className={`input donation-inline-input ${
                                      formErrors.unit ? "input-error" : ""
                                    }`}
                                  />
                                ) : null}
                                {formErrors.unit && (
                                  <span className="error-text">{formErrors.unit}</span>
                                )}
                              </div>

                              <div className="donation-form-group">
                                <label htmlFor="expirationDate">
                                  Expiration Date{" "}
                                  {isExpiryRequired ? <span>*</span> : null}
                                </label>
                                <input
                                  id="expirationDate"
                                  type="date"
                                  name="expirationDate"
                                  value={form.expirationDate}
                                  min={minExpirationDate}
                                  onChange={handleChange}
                                  className={`input ${
                                    formErrors.expirationDate ? "input-error" : ""
                                  }`}
                                />
                                {formErrors.expirationDate && (
                                  <span className="error-text">
                                    {formErrors.expirationDate}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="donation-form-group">
                                <label htmlFor="condition">
                                  Condition <span>*</span>
                                </label>
                                <select
                                  id="condition"
                                  name="condition"
                                  value={form.condition}
                                  onChange={handleChange}
                                  className={`input ${
                                    formErrors.condition ? "input-error" : ""
                                  }`}
                                >
                                  <option value="brand_new">Brand New</option>
                                  <option value="used_item">Used Item</option>
                                </select>
                                {formErrors.condition && (
                                  <span className="error-text">
                                    {formErrors.condition}
                                  </span>
                                )}
                              </div>

                              <div
                                className={`donation-form-group ${
                                  form.condition !== "used_item"
                                    ? "donation-form-group-disabled"
                                    : ""
                                }`}
                              >
                                <label htmlFor="usageDuration">
                                  Usage Duration{" "}
                                  {form.condition === "used_item" ? <span>*</span> : null}
                                </label>
                                <input
                                  id="usageDuration"
                                  type="text"
                                  name="usageDuration"
                                  placeholder="e.g. 6 months, 1 year"
                                  value={form.usageDuration}
                                  onChange={handleChange}
                                  onKeyDown={keepTextInputKeysLocal}
                                  disabled={form.condition !== "used_item"}
                                  className={`input ${
                                    formErrors.usageDuration ? "input-error" : ""
                                  }`}
                                />
                                {form.condition !== "used_item" ? (
                                  <small className="input-helper-text">
                                    Enabled only when appliance condition is set to Used Item.
                                  </small>
                                ) : null}
                                {formErrors.usageDuration && (
                                  <span className="error-text">
                                    {formErrors.usageDuration}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {donationType === "monetary" && (
                        <>
                          <div className="donation-form-group">
                            <label htmlFor="amount">
                              Amount <span>*</span>
                            </label>
                            <input
                              id="amount"
                              type="number"
                              min="0"
                              step="0.01"
                              max={MAX_AMOUNT}
                              name="amount"
                              placeholder="e.g. 10000"
                              value={getNumberInputValue(form.amount)}
                              onChange={handleChange}
                              className={`input ${
                                formErrors.amount ? "input-error" : ""
                              }`}
                            />
                            {formErrors.amount && (
                              <span className="error-text">{formErrors.amount}</span>
                            )}
                          </div>

                          <div className="donation-form-group">
                            <label htmlFor="referenceNumber">
                              Reference Number <span>*</span>
                            </label>
                            <input
                              id="referenceNumber"
                              type="text"
                              name="referenceNumber"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="e.g. 1234567890"
                              value={form.referenceNumber}
                              onChange={handleChange}
                              onKeyDown={handleReferenceNumberKeyDown}
                              maxLength={40}
                              className={`input ${
                                formErrors.referenceNumber ? "input-error" : ""
                              }`}
                            />
                            {formErrors.referenceNumber && (
                              <span className="error-text">
                                {formErrors.referenceNumber}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="donation-form-section">
                    <div className="donation-section-heading">
                      <span className="donation-section-icon"><FaFileInvoiceDollar /></span>
                      <h3>Source Information</h3>
                      <p>
                        {donationType === "monetary"
                          ? "Classify the provider for this monetary donation."
                          : "Identify who provided or endorsed this donation."}
                      </p>
                    </div>

                    <div className="donation-form-grid">
                      <div className="donation-form-group">
                        <label htmlFor="sourceType">
                          Provider <span>*</span>
                        </label>
                        <select
                          id="sourceType"
                          name="sourceType"
                          value={form.sourceType}
                          onChange={handleChange}
                          className={`input ${
                            formErrors.sourceType ? "input-error" : ""
                          }`}
                        >
                          <option value="external">Donated</option>
                          <option value="government">NGO</option>
                          <option value="internal">LGU</option>
                        </select>
                        {formErrors.sourceType && (
                          <span className="error-text">{formErrors.sourceType}</span>
                        )}
                      </div>

                      {(donationType === "goods" || donationType === "appliance") && (
                        <div className="donation-form-group">
                          <label htmlFor="sourceName">Provider Name</label>
                          <input
                            id="sourceName"
                            type="text"
                            name="sourceName"
                            maxLength={MAX_SOURCE_NAME_LENGTH}
                            placeholder={getSourceNamePlaceholder()}
                            value={form.sourceName}
                            onChange={handleChange}
                            onKeyDown={keepTextInputKeysLocal}
                            className={`input ${formErrors.sourceName ? "input-error" : ""}`}
                          />
                          {formErrors.sourceName && (
                            <span className="error-text">{formErrors.sourceName}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="donation-form-section">
                    <div className="donation-section-heading">
                      <span className="donation-section-icon"><FaUpload /></span>
                      <h3>Additional Information</h3>
                      <p>Attach files and add supporting notes.</p>
                    </div>

                    <div className="donation-form-grid">
                      <div className="donation-form-group full-width">
                        <label htmlFor="description">Description / Notes</label>
                        <textarea
                          id="description"
                          name="description"
                          maxLength={MAX_DESCRIPTION_LENGTH}
                          placeholder={
                            donationType === "goods"
                              ? "Add notes about packaging, expiry, condition, delivery details, or stock intake remarks..."
                              : donationType === "appliance"
                              ? "Add notes about appliance condition, turnover details, or intake remarks..."
                              : "Add notes about transaction reference, intended use, receipt details, or supporting remarks..."
                          }
                          value={form.description}
                          onChange={handleChange}
                          onKeyDown={keepTextInputKeysLocal}
                          className={`textarea ${formErrors.description ? "input-error" : ""}`}
                          rows="4"
                        />
                        <div className="textarea-meta">
                          <span>{form.description.length}/{MAX_DESCRIPTION_LENGTH}</span>
                        </div>
                        {formErrors.description && (
                          <span className="error-text">{formErrors.description}</span>
                        )}
                      </div>
                                            <div className="donation-form-group full-width">
                        <label htmlFor="proofFiles">Validation</label>

                        <div
                          className="donation-upload-box"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input
                            id="proofFiles"
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={getProofAcceptValue()}
                            onChange={handleFileChange}
                            className="file-input"
                          />

                          <div className="donation-upload-content">
                            <p className="donation-upload-title">
                              Click to upload supporting files
                            </p>
                            <span className="donation-upload-subtext">
                              {getProofLabel()}
                            </span>
                            <span className="donation-upload-count">
                              {proofFiles.length > 0
                                ? `${proofFiles.length} file${
                                    proofFiles.length > 1 ? "s" : ""
                                  } selected`
                                : "No files selected"}
                            </span>
                          </div>
                        </div>

                        {proofFiles.length > 0 && (
                          <div className="donation-selected-files">
                            {proofFiles.map((file, index) => (
                              <div key={`${file.name}-${index}`} className="donation-file-chip">
                                <span className="donation-file-chip-name">{file.name}</span>
                                <span className="donation-file-chip-size">
                                  {isImageProofFile(file) ? "Image proof" : "Document proof"} · {(file.size / 1024).toFixed(1)} KB
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {editingItemId && existingProofCount > 0 && proofFiles.length === 0 ? (
                          <span className="helper-text">
                            This record already has {existingProofCount} saved proof file{existingProofCount > 1 ? "s" : ""}. Upload new files only if you want to replace or add proof.
                          </span>
                        ) : null}
                        {formErrors.proofFiles && (
                          <span className="error-text">{formErrors.proofFiles}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="donation-form-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={resetForm}
                      disabled={loading}
                    >
                      <FaRedo className="btn-icon" />
                      Reset
                    </button>

                    <button type="submit" disabled={loading} className="btn btn-primary">
                      <FaSave className="btn-icon" />
                      {loading
                        ? "Saving..."
                        : editingItemId
                        ? "Update Record"
                        : donationType === "goods"
                        ? "Save Goods"
                        : donationType === "appliance"
                        ? "Save Appliance"
                        : "Save Monetary"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <>
              {allowedDonationTypes.length > 1 ? (
                <div className="inventory-card">
                  <div className="type-switch">
                    {allowedDonationTypes.includes("goods") ? (
                      <button
                        className={`type-tab ${donationType === "goods" ? "active" : ""}`}
                        onClick={() => {
                          setDonationType("goods");
                          setCurrentPage(1);
                          clearFilters();
                        }}
                      >
                        <FaBoxes className="btn-icon" />
                        Goods Donations
                      </button>
                    ) : null}
                    {allowedDonationTypes.includes("monetary") ? (
                      <button
                        className={`type-tab ${
                          donationType === "monetary" ? "active" : ""
                        }`}
                        onClick={() => {
                          setDonationType("monetary");
                          setCurrentPage(1);
                          clearFilters();
                        }}
                      >
                        <FaMoneyBillWave className="btn-icon" />
                        Monetary Donations
                      </button>
                    ) : null}
                    {allowedDonationTypes.includes("appliance") ? (
                      <button
                        className={`type-tab ${
                          donationType === "appliance" ? "active" : ""
                        }`}
                        onClick={() => {
                          setDonationType("appliance");
                          setCurrentPage(1);
                          clearFilters();
                        }}
                      >
                        <FaBlender className="btn-icon" />
                        Appliance Donations
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="inventory-card">
                <div className="section-header compact">
                  <div>
                    <h2 className="section-title">
                      {showArchived
                        ? donationType === "goods"
                          ? "Archived Goods Donations"
                          : donationType === "appliance"
                          ? "Archived Appliance Donations"
                          : "Archived Monetary Donations"
                        : donationType === "goods"
                        ? "Goods Donations"
                        : donationType === "appliance"
                        ? "Appliance Donations"
                        : "Monetary Donations"}
                    </h2>
                  </div>
                </div>

                <div className="filter-toolbar inventory-filter-toolbar-5 inventory-filter-toolbar-inventory">
                  <div className="filter-group search-group">
                    <label>Search</label>
                    <input
                      type="text"
                      name="search"
                      placeholder={
                        donationType === "goods"
                          ? "Search item name, category, notes, source..."
                          : donationType === "appliance"
                          ? "Search appliance name, category, notes, source..."
                          : "Search donor, notes, source..."
                      }
                      value={filters.search}
                      onChange={handleFilterChange}
                      maxLength={MAX_SEARCH_LENGTH}
                      className="input"
                    />
                  </div>

                  {(donationType === "goods" || donationType === "appliance") && (
                    <div className="filter-group">
                      <label>Category</label>
                      <select
                        name="category"
                        value={filters.category}
                        onChange={handleFilterChange}
                        className="input"
                      >
                        <option value="">All Categories</option>
                        {categories.map((category, index) => (
                          <option key={index} value={category}>
                            {formatCategory(category)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {donationType === "goods" && (
                    <div className="filter-group">
                      <label>Expiry Status</label>
                      <select
                        name="expiryStatus"
                        value={filters.expiryStatus}
                        onChange={handleFilterChange}
                        className="input"
                      >
                        <option value="">All</option>
                        <option value="expired">Expired</option>
                        <option value="soon">Expiring Soon</option>
                        <option value="ok">Not expiring</option>
                        <option value="none">No Expiry</option>
                      </select>
                    </div>
                  )}

                  <div className="filter-group">
                    <label>Added By</label>
                    <select
                      name="addedBy"
                      value={filters.addedBy}
                      onChange={handleFilterChange}
                      className="input"
                    >
                      <option value="">All Users</option>
                      {addedByOptions.map((user, index) => (
                        <option key={index} value={user}>
                          {user}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Date</label>
                    <input
                      type="date"
                      name="date"
                      value={filters.date}
                      onChange={handleFilterChange}
                      className="input"
                    />
                  </div>

                  <div className="filter-actions">
                    <button className="btn btn-secondary" onClick={clearFilters}>
                      <FaTimes className="btn-icon" />
                      Clear Filters
                    </button>
                  </div>
                </div>

                <div className="table-topbar inventory-table-topbar">
                  <div className="table-meta">
                    <span>
                      Showing <strong>{paginatedItems.length}</strong> of{" "}
                      <strong>{sortedItems.length}</strong> filtered record(s)
                    </span>
                  </div>

                  <div className="rows-control">
                    <label>Rows per page</label>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rows-select"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort("name")} className="sortable">
                          {donationType === "goods"
                            ? "Item Name"
                            : donationType === "appliance"
                            ? "Appliance Name"
                            : "Name / Donor"}{" "}
                          <span>{sortArrow("name")}</span>
                        </th>

                        {(donationType === "goods" || donationType === "appliance") && (
                          <th
                            onClick={() => handleSort("category")}
                            className="sortable"
                          >
                            Category <span>{sortArrow("category")}</span>
                          </th>
                        )}

                        <th onClick={() => handleSort("quantity")} className="sortable">
                          {donationType === "monetary" ? "Amount" : "Quantity"}{" "}
                          <span>{sortArrow("quantity")}</span>
                        </th>

                        {donationType === "monetary" && <th>Reference No.</th>}

                        {donationType === "goods" && <th>Unit</th>}
                        {donationType === "appliance" && <th>Condition</th>}
                        {donationType === "appliance" && <th>Usage Duration</th>}

                        {donationType === "goods" && (
                          <th
                            onClick={() => handleSort("expirationDate")}
                            className="sortable"
                          >
                            Expiration <span>{sortArrow("expirationDate")}</span>
                          </th>
                        )}

                        <th>Source</th>
                        <th>Description</th>
                        <th>Proof</th>

                        <th onClick={() => handleSort("addedBy")} className="sortable">
                          Added By <span>{sortArrow("addedBy")}</span>
                        </th>

                        <th
                          onClick={() => handleSort("createdAt")}
                          className="sortable"
                        >
                          Created <span>{sortArrow("createdAt")}</span>
                        </th>

                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {fetching && !showArchived ? (
                        <tr>
                          <td colSpan={tableColSpan}>
                            <div className="table-empty">
                              <div className="spinner"></div>
                              <p>Loading inventory records...</p>
                            </div>
                          </td>
                        </tr>
                      ) : paginatedItems.length === 0 ? (
                        <tr>
                          <td colSpan={tableColSpan}>
                            <div className="table-empty">
                              <h4>No items found</h4>
                              <p>
                                {sortedItems.length === 0
                                  ? showArchived
                                    ? "There are no archived donation records for this section yet."
                                    : "There are no donation records available for this section yet."
                                  : "No records matched your current filters. Try adjusting your search or filters."}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedItems.map((item) => (
                          <tr key={item._id}>
                            <td>
                              <div className="cell-main">{item.name || "-"}</div>
                            </td>

                            {(donationType === "goods" || donationType === "appliance") && (
                              <td>
                                <span className="badge badge-category">
                                  {formatCategory(item.category)}
                                </span>
                              </td>
                            )}

                            <td className="quantity-cell">
                              {donationType === "monetary"
                                ? `PHP ${Number(item.amount || 0).toLocaleString()}`
                                : Number(item.quantity || 0).toLocaleString()}
                            </td>

                            {donationType === "monetary" && (
                              <td>
                                <div className="cell-main">
                                  {item.referenceNumber ||
                                    extractReferenceFromDescription(item.description) ||
                                    "-"}
                                </div>
                              </td>
                            )}

                            {donationType === "goods" && <td>{item.unit || "-"}</td>}
                            {donationType === "appliance" && (
                              <td>{formatCategory(String(item.condition || "").replace(/_/g, " "))}</td>
                            )}
                            {donationType === "appliance" && (
                              <td>{item.usageDuration || "-"}</td>
                            )}

                            {donationType === "goods" && (
                              <td>
                                <div className="expiry-cell-stack">
                                  <span>{formatExpiryDate(item.expirationDate)}</span>
                                  {getExpiryBadgeLabel(item) ? (
                                    <span className={`badge ${getExpiryBadgeClass(item)}`}>
                                      {getExpiryBadgeLabel(item)}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            )}

                            <td>
                              <div className="source-cell">
                                <strong>{getSourceTypeLabel(item.sourceType)}</strong>
                                {donationType !== "monetary" ? (
                                  <small>{item.sourceName || "No provider name"}</small>
                                ) : null}
                              </div>
                            </td>

                            <td>
                              <div
                                className="description-cell"
                                title={
                                  donationType === "monetary"
                                    ? stripReferenceFromDescription(item.description)
                                    : item.description || ""
                                }
                              >
                                {donationType === "monetary"
                                  ? stripReferenceFromDescription(item.description) || "-"
                                  : item.description || "-"}
                              </div>
                            </td>

                            <td>
                              {item.proofFiles && item.proofFiles.length > 0 ? (
                                <div className="proof-list">
                                  {item.proofFiles.map((file, idx) => {
                                    const candidates = buildProofFileHrefCandidates(file, BASE_URL);
                                    const href = candidates[0] || buildProofFileHref(file, BASE_URL);
                                    const isImage = isImageProofFile(file);
                                    const previewLabel = isImage
                                      ? `Image Proof ${idx + 1}`
                                      : `Document Proof ${idx + 1}`;

                                    return (
                                      <button
                                        key={idx}
                                        type="button"
                                        className={`proof-card ${isImage ? "proof-card-image" : "proof-card-document"}`}
                                        onClick={() =>
                                          setProofPreview({
                                            candidates: candidates.length ? candidates : [href].filter(Boolean),
                                            index: 0,
                                            isImage,
                                            label: previewLabel,
                                            missing: !href,
                                          })
                                        }
                                      >
                                        {isImage ? (
                                          <img
                                            src={href}
                                            alt={`Proof ${idx + 1}`}
                                            className="proof-thumb"
                                          />
                                        ) : (
                                          <div className="proof-doc-icon">
                                            <FaFilePdf />
                                          </div>
                                        )}
                                        <span className="proof-card-label">
                                          {isImage ? `View Image ${idx + 1}` : `View File ${idx + 1}`}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="muted-text">No files</span>
                              )}
                            </td>

                            <td>{item.addedBy || "-"}</td>

                            <td>
                              <div className="date-cell">
                                <span>{formatShortDate(item.createdAt)}</span>
                                <small>{formatDate(item.createdAt)}</small>
                              </div>
                            </td>

                            <td>
                              {showArchived ? (
                                <div className="row-action-stack">
                                  {canEditInventoryType(role, item.type) ? (
                                    <>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleUnarchive(item._id, item.name)}
                                      >
                                        <FaUndo className="btn-icon" />
                                        Unarchive
                                      </button>
                                      <button
                                        className="btn btn-delete btn-sm"
                                        onClick={() => handlePermanentDelete(item._id, item.name)}
                                      >
                                        <FaTrash className="btn-icon" />
                                        Delete
                                      </button>
                                    </>
                                  ) : (
                                    <span className="inventory-muted-note">View only</span>
                                  )}
                                </div>
                              ) : (
                                <div className="row-action-stack">
                                  {canEditInventoryType(role, item.type) ? (
                                    <>
                                      <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => openEditForm(item)}
                                      >
                                        <FaPen className="btn-icon" />
                                        Edit
                                      </button>
                                      <button
                                        className="btn btn-archive btn-sm"
                                        onClick={() => handleArchive(item._id, item.name)}
                                      >
                                        <FaArchive className="btn-icon" />
                                        Archive
                                      </button>
                                    </>
                                  ) : (
                                    <span className="inventory-muted-note">View only</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {!fetching && sortedItems.length > 0 && (
                  <div className="pagination-bar">
                    <button
                      className="pagination-btn"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => prev - 1)}
                    >
                      Previous
                    </button>

                    <div className="page-numbers">
                      {pageNumbers.map((page) => (
                        <button
                          key={page}
                          className={`page-number ${currentPage === page ? "active" : ""}`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      className="pagination-btn"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
};

export default InventoryAdd;
                  
                  
