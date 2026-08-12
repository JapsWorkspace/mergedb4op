const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const Donation = require("../models/Donation");
const InventoryItem = require("../models/InventoryItem");
const InventoryProofFile = require("../models/InventoryProofFile");
const InventoryLog = require("../models/InventoryLog");
const Notification = require("../models/Notification");
const ReliefRelease = require("../models/ReliefRelease");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");
const { callAiAnalyticsProvider } = require("../utils/aiAnalyticsProvider");
const {
  validateInventoryExpirationDate,
} = require("../utils/inventoryExpiryValidation");
const {
  getInventoryAccessError,
  normalizeRole,
} = require("../utils/roleAccessUtils");

const VALID_TYPES = ["goods", "monetary", "appliance"];
const VALID_SOURCE_TYPES = ["external", "government", "internal"];
const LOW_STOCK_THRESHOLD = 20;
const NON_EXPIRING_GOODS_CATEGORIES = new Set([
  "clothes",
  "clothing",
  "shoes",
  "shoe",
  "footwear",
  "blankets",
  "blanket",
  "mats",
  "mat",
  "towels",
  "towel",
  "bedding",
  "mosquito nets",
  "mosquito net",
]);
const VALID_APPLIANCE_CONDITIONS = ["brand_new", "used_item"];

let aiCache = null;
let aiCacheTime = 0;
let donationAiCache = null;
let donationAiCacheTime = 0;
const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || 2 * 60 * 60 * 1000);

const VALID_REPORT_TYPES = [
  "masterlist",
  "low_stock",
  "expired",
  "expiring_soon",
  "archived",
  "inventory_analytics",
  "donation_analytics",
  "donations",
  "goods_donations",
  "monetary_donations",
  "appliance_donations",
];

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const getProofContentType = (fileUrl = "", fallback = "") => {
  const normalized = String(fileUrl || "").split("?")[0].toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".doc")) return "application/msword";
  if (normalized.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return fallback || "application/octet-stream";
};

const isDocumentProofUpload = (file = {}) => {
  const extension = path.extname(file.originalname || file.filename || "").toLowerCase();
  const mimetype = String(file.mimetype || "").toLowerCase();

  return (
    [".pdf", ".doc", ".docx"].includes(extension) ||
    mimetype.includes("pdf") ||
    mimetype.includes("msword") ||
    mimetype.includes("wordprocessingml")
  );
};

const getProofPreviewFileName = (fileUrl = "") => {
  const normalized = String(fileUrl || "").split("?")[0].replace(/\\/g, "/");
  return decodeURIComponent(normalized.split("/").pop() || "proof-file");
};

const getInventoryProofFileId = (rawUrl = "") => {
  const normalized = String(rawUrl || "").trim();
  const match = normalized.match(/\/api\/inventory\/proof-file\/([a-f0-9]{24})(?:\/|$)/i);

  return match ? match[1] : "";
};

const sendProofPreviewMessage = (res, status, message) =>
  res.status(status).type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fbf7;
        color: #0b3d24;
        font-family: "Montserrat", "Poppins", sans-serif;
      }
      .message {
        max-width: 520px;
        padding: 32px;
        text-align: center;
        border: 1px solid #cfe5d7;
        border-radius: 20px;
        background: #ffffff;
      }
      strong {
        display: block;
        margin-bottom: 10px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #5f7568;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="message">
      <strong>Document preview unavailable</strong>
      <p>${message}</p>
    </div>
  </body>
</html>`);

const getLocalProofPath = (rawUrl = "") => {
  const normalized = String(rawUrl || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";

  const uploadsIndex = normalized.indexOf("/uploads/");
  const localPath =
    normalized.startsWith("uploads/")
      ? normalized
      : normalized.startsWith("/uploads/")
      ? normalized.slice(1)
      : uploadsIndex >= 0
      ? normalized.slice(uploadsIndex + 1)
      : "";

  if (!localPath) return "";

  const decodedLocalPath = decodeURIComponent(localPath);
  const resolved = path.resolve(__dirname, "..", decodedLocalPath);
  const uploadsRoot = path.resolve(__dirname, "..", "uploads");

  return resolved.startsWith(uploadsRoot) ? resolved : "";
};

const buildProofFetchCandidates = (rawUrl = "") => {
  const candidates = [rawUrl];

  if (/res\.cloudinary\.com/i.test(rawUrl) && /\/image\/upload\//i.test(rawUrl)) {
    candidates.push(rawUrl.replace(/\/image\/upload\//i, "/raw/upload/"));
  }

  return candidates.filter(
    (candidate, index, all) => candidate && all.indexOf(candidate) === index
  );
};

const streamInventoryProofFile = async (req, res) => {
  const proofFile = await InventoryProofFile.findById(req.params.id);

  if (!proofFile?.data) {
    return sendProofPreviewMessage(res, 404, "Proof file not found.");
  }

  const proofBuffer = Buffer.isBuffer(proofFile.data)
    ? proofFile.data
    : Buffer.from(proofFile.data?.buffer || proofFile.data || []);
  const safeFilename = String(proofFile.filename || "proof-file").replace(/"/g, "");

  res.setHeader("Content-Type", proofFile.contentType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${safeFilename}"`
  );
  res.setHeader("Content-Length", proofBuffer.length);

  return res.send(proofBuffer);
};

const previewInventoryProof = async (req, res) => {
  try {
    const rawUrl = normalizeString(req.query.url);

    if (!rawUrl) {
      return sendProofPreviewMessage(res, 400, "Proof URL is required.");
    }

    const proofFileId = getInventoryProofFileId(rawUrl);
    if (proofFileId) {
      req.params.id = proofFileId;
      return streamInventoryProofFile(req, res);
    }

    const localPath = getLocalProofPath(rawUrl);
    if (localPath && fs.existsSync(localPath)) {
      res.setHeader("Content-Type", getProofContentType(localPath));
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${getProofPreviewFileName(localPath)}"`
      );
      return fs.createReadStream(localPath).pipe(res);
    }

    if (!/^https?:\/\//i.test(rawUrl)) {
      return sendProofPreviewMessage(res, 404, "Proof file not found.");
    }

    const parsedUrl = new URL(rawUrl);
    const allowedHosts = [
      "res.cloudinary.com",
      "localhost",
      "127.0.0.1",
    ];
    const isAllowedHost = allowedHosts.some((host) =>
      parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      return sendProofPreviewMessage(res, 400, "Unsupported proof file host.");
    }

    let response = null;
    let previewUrl = rawUrl;

    for (const candidate of buildProofFetchCandidates(rawUrl)) {
      response = await fetch(candidate);
      if (response.ok && response.body) {
        previewUrl = candidate;
        break;
      }
    }

    if (!response.ok || !response.body) {
      return sendProofPreviewMessage(
        res,
        404,
        "This proof file cannot be previewed from its current storage URL. Re-upload it so the system can save a durable preview copy."
      );
    }

    res.setHeader(
      "Content-Type",
      getProofContentType(previewUrl, response.headers.get("content-type") || "")
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${getProofPreviewFileName(previewUrl)}"`
    );

    return Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error("Preview inventory proof error:", err);
    return sendProofPreviewMessage(res, 500, "Failed to preview proof file.");
  }
};

const uploadInventoryProofFile = async (file) => {
  if (!file) return "";

  const isDocument = isDocumentProofUpload(file);
  if (isDocument) {
    const data =
      file.buffer ||
      (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);

    if (data) {
      const savedProof = await InventoryProofFile.create({
        filename: file.originalname || file.filename || "proof-file",
        contentType: file.mimetype || getProofContentType(file.originalname || file.filename),
        size: file.size || data.length,
        data,
      });

      return `/api/inventory/proof-file/${savedProof._id}/${encodeURIComponent(
        savedProof.filename
      )}`;
    }
  }

  const uploadOptions = {
    folder: "evacuation_app/inventory_proofs",
    resource_type: "image",
    use_filename: true,
    unique_filename: true,
  };

  if (file.buffer) {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          uploadOptions,
          (err, uploadResult) => {
            if (err) return reject(err);
            return resolve(uploadResult);
          }
        )
        .end(file.buffer);
    });

    return result.secure_url || "";
  }

  const localFilePath =
    file.path ||
    (file.filename
      ? path.join(__dirname, "..", "uploads", "proofs", file.filename)
      : "");

  if (localFilePath && fs.existsSync(localFilePath)) {
    const result = await cloudinary.uploader.upload(localFilePath, uploadOptions);

    return result.secure_url || "";
  }

  if (file.filename) {
    return `uploads/proofs/${file.filename}`;
  }

  return "";
};

const uploadInventoryProofFiles = async (files = []) => {
  const uploaded = await Promise.all(
    (Array.isArray(files) ? files : [])
      .filter(Boolean)
      .map((file) => uploadInventoryProofFile(file))
  );

  return uploaded.filter(Boolean);
};

const normalizeLower = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase();
};

const getSessionRole = (req) => normalizeRole(req?.session?.role);

const getInventoryRoleAccessError = (req, type) => {
  const role = getSessionRole(req);
  if (!role) return "Not authenticated.";
  return getInventoryAccessError(role, type);
};

const resolveInventoryType = (item = {}) => {
  const explicitType = normalizeLower(item.type, "");

  if (VALID_TYPES.includes(explicitType)) {
    return explicitType;
  }

  if (
    item.amount !== undefined &&
    item.amount !== null &&
    item.amount !== "" &&
    !Number.isNaN(Number(item.amount))
  ) {
    return "monetary";
  }

  if (normalizeString(item.referenceNumber)) {
    return "monetary";
  }

  if (normalizeLower(item.condition, "") || normalizeString(item.usageDuration)) {
    return "appliance";
  }

  return "goods";
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toBoolean = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "required", "requires", "require"].includes(normalized)) {
    return true;
  }

  if (
    ["false", "0", "no", "optional", "not_required", "does_not_require"].includes(
      normalized
    )
  ) {
    return false;
  }

  return undefined;
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "INVALID_DATE";
  }

  return parsed;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
};

const startOfMonth = (date) => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const startOfYear = (date) => {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
};

const getExpiryMeta = (expirationDate) => {
  if (!expirationDate) {
    return {
      expiryStatus: "no_expiry",
      daysUntilExpiration: null,
    };
  }

  const today = startOfDay(new Date());
  const expiry = startOfDay(expirationDate);

  const diffMs = expiry.getTime() - today.getTime();
  const daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) {
    return {
      expiryStatus: "expired",
      daysUntilExpiration,
    };
  }

  if (daysUntilExpiration <= 30) {
    return {
      expiryStatus: "expiring_soon",
      daysUntilExpiration,
    };
  }

  return {
    expiryStatus: "ok",
    daysUntilExpiration,
  };
};

const attachExpiryMeta = (item) => {
  const plain = item.toObject ? item.toObject() : { ...item };
  plain.type = resolveInventoryType(plain);

  if (plain.type !== "goods") {
    return {
      ...plain,
      expiryStatus: null,
      daysUntilExpiration: null,
    };
  }

  const meta = getExpiryMeta(plain.expirationDate);

  return {
    ...plain,
    ...meta,
  };
};

const PROTECTED_INVENTORY_EDIT_FIELDS = ["type", "category", "unit", "sourceType"];

const buildInventoryEditLockMeta = (isClassificationLocked = false) => ({
  classificationLocked: Boolean(isClassificationLocked),
  lockedFields: isClassificationLocked ? [...PROTECTED_INVENTORY_EDIT_FIELDS] : [],
});

const attachInventoryEditLockMeta = (item, lockedItemIds = new Set()) => {
  const plain = attachExpiryMeta(item);
  const itemId = normalizeString(plain?._id);
  const classificationLocked = itemId ? lockedItemIds.has(itemId) : false;

  return {
    ...plain,
    editLocks: buildInventoryEditLockMeta(classificationLocked),
  };
};

const getReleasedInventoryItemIdSet = async (itemIds = []) => {
  const normalizedIds = [...new Set(itemIds.map((id) => normalizeString(id)).filter(Boolean))];

  if (!normalizedIds.length) {
    return new Set();
  }

  const releases = await ReliefRelease.find(
    {
      isArchived: false,
      "items.inventoryItemId": { $in: normalizedIds },
    },
    { items: 1 }
  ).lean();

  const lockedIds = new Set();

  for (const release of releases) {
    for (const releaseItem of Array.isArray(release?.items) ? release.items : []) {
      const inventoryItemId = normalizeString(releaseItem?.inventoryItemId);
      if (inventoryItemId && normalizedIds.includes(inventoryItemId)) {
        lockedIds.add(inventoryItemId);
      }
    }
  }

  return lockedIds;
};

const requiresExpirationForGoods = (category, explicitRule) => {
  const normalizedCategory = normalizeString(category).toLowerCase();

  if (explicitRule !== undefined) {
    return Boolean(explicitRule);
  }

  if (!normalizedCategory) return false;
  return !NON_EXPIRING_GOODS_CATEGORIES.has(normalizedCategory);
};

const isLowStockItem = (item) => {
  const qty = Number(item.quantity || 0);
  return (
    (item.type === "goods" || item.type === "appliance") &&
    qty > 0 &&
    qty < LOW_STOCK_THRESHOLD
  );
};

const isOutOfStockItem = (item) => {
  const qty = Number(item.quantity || 0);
  return (item.type === "goods" || item.type === "appliance") && qty <= 0;
};

const getSourceFallbackLabel = (sourceType) => {
  const normalized = normalizeString(sourceType).toLowerCase();

  if (normalized === "government") return "Government Source";
  if (normalized === "internal") return "Internal Source";
  return "External Donor";
};

const getPublicSourceName = (item) => {
  const sourceName = normalizeString(item.sourceName);
  if (sourceName) return sourceName;

  return getSourceFallbackLabel(item.sourceType);
};

const getDonorKey = (item) => {
  const sourceName = normalizeString(item.sourceName).toLowerCase();
  const sourceType = normalizeString(item.sourceType).toLowerCase() || "external";

  if (sourceName) {
    return `${sourceType}:${sourceName}`;
  }

  return `${sourceType}:__confidential__`;
};

const validateInventoryData = (body, isUpdate = false, currentItem = null) => {
  const errors = [];

  const currentType = currentItem?.type || null;
  const type = normalizeLower(body.type, currentType || "goods");
  const name = body.name !== undefined ? normalizeString(body.name) : undefined;
  const category =
    body.category !== undefined ? normalizeLower(body.category) : undefined;
  const quantity = body.quantity !== undefined ? toNumber(body.quantity) : undefined;
  const unit = body.unit !== undefined ? normalizeString(body.unit) : undefined;
  const amount = body.amount !== undefined ? toNumber(body.amount) : undefined;
  const referenceNumber =
    body.referenceNumber !== undefined ? normalizeString(body.referenceNumber) : undefined;
  const expirationDate =
    body.expirationDate !== undefined ? parseDate(body.expirationDate) : undefined;
  const requiresExpiration =
    body.requiresExpiration !== undefined
      ? toBoolean(body.requiresExpiration)
      : body.expiryRequired !== undefined
      ? toBoolean(body.expiryRequired)
      : undefined;
  const condition =
    body.condition !== undefined ? normalizeLower(body.condition) : undefined;
  const usageDuration =
    body.usageDuration !== undefined ? normalizeString(body.usageDuration) : undefined;
  const description =
    body.description !== undefined ? normalizeString(body.description) : undefined;
  const sourceType =
    body.sourceType !== undefined ? normalizeLower(body.sourceType) : undefined;
  const sourceName =
    body.sourceName !== undefined ? normalizeString(body.sourceName) : undefined;

  if (!VALID_TYPES.includes(type)) {
    errors.push("Invalid type. Must be goods, monetary, or appliance.");
  }

  if (!isUpdate || body.name !== undefined) {
    if (!name) errors.push("Name is required.");
  }

  if (sourceType !== undefined && !VALID_SOURCE_TYPES.includes(sourceType)) {
    errors.push("Invalid sourceType. Must be external, government, or internal.");
  }

  if (body.expirationDate !== undefined && expirationDate === "INVALID_DATE") {
    errors.push("Invalid expiration date.");
  }

  if (expirationDate && expirationDate !== "INVALID_DATE") {
    const expirationDateError = validateInventoryExpirationDate(expirationDate);
    if (expirationDateError) {
      errors.push(expirationDateError);
    }
  }

  if (type === "goods") {
    if (!category) errors.push("Category is required for goods.");

    if (quantity === undefined || quantity < 0) {
      errors.push("Quantity is required for goods and must be 0 or higher.");
    }

    if (!unit) errors.push("Unit is required for goods.");

    const needsExpiry = requiresExpirationForGoods(category, requiresExpiration);
    if (needsExpiry && !expirationDate) {
      errors.push("Expiration date is required for this goods category.");
    }
  }

  if (type === "appliance") {
    if (!category) errors.push("Category is required for appliances.");

    if (quantity === undefined || quantity <= 0) {
      errors.push("Quantity is required for appliances and must be greater than 0.");
    }

    if (!condition || !VALID_APPLIANCE_CONDITIONS.includes(condition)) {
      errors.push("Condition is required for appliances.");
    }

    if (condition === "used_item" && !usageDuration) {
      errors.push("Usage duration is required for used appliances.");
    }

    if (body.expirationDate !== undefined && body.expirationDate !== "") {
      errors.push("Expiration date is not allowed for appliances.");
    }
  }

  if (type === "monetary") {
    if (amount === undefined || amount < 0) {
      errors.push("Amount is required for monetary and must be 0 or higher.");
    }

    if (!referenceNumber) {
      errors.push("Reference number is required for monetary donations.");
    } else if (!/^\d+$/.test(referenceNumber)) {
      errors.push("Reference number must contain numbers only.");
    }

    if (body.expirationDate !== undefined && body.expirationDate !== "") {
      errors.push("Expiration date is only allowed for goods.");
    }
  }

  if (type !== "goods" && unit) {
    if (type === "appliance") {
      errors.push("Unit is not allowed for appliances.");
    }
  }

  if (type !== "monetary" && amount !== undefined) {
    if (type === "goods" || type === "appliance") {
      errors.push("Amount is only allowed for monetary donations.");
    }
  }

  if (type !== "appliance") {
    if (condition) {
      errors.push("Condition is only allowed for appliances.");
    }

    if (usageDuration) {
      errors.push("Usage duration is only allowed for appliances.");
    }
  }

  const normalizedUsageDuration =
    type === "appliance" && condition === "used_item" ? usageDuration : undefined;

  return {
    errors,
    data: {
      type,
      name,
      category,
      quantity,
      unit,
      amount,
      referenceNumber,
      expirationDate,
      requiresExpiration:
        type === "goods"
          ? requiresExpirationForGoods(category, requiresExpiration)
          : undefined,
      condition: type === "appliance" ? condition : undefined,
      usageDuration: normalizedUsageDuration,
      description,
      sourceType,
      sourceName,
    },
  };
};

const createLog = async (item, action, username, remarks = "") => {
  await InventoryLog.create({
    inventoryItem: item._id,
    itemName: item.name,
    itemType: item.type,
    action,
    quantity:
      item.type === "goods" || item.type === "appliance"
        ? item.quantity
        : undefined,
    amount: item.type === "monetary" ? item.amount : undefined,
    referenceNumber: item.type === "monetary" ? item.referenceNumber : undefined,
    performedBy: username || "",
    remarks,
  });
};

const getNotificationDayKey = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const createInventoryNotificationOnce = async ({
  type,
  priority = "normal",
  title,
  message,
  item,
  senderName = "",
  module = "inventory",
  metadata = {},
}) => {
  try {
    if (!item?._id || !type || !title || !message) return null;

    const dayKey = getNotificationDayKey();

    const existing = await Notification.findOne({
      recipientRole: "drrmo",
      module,
      type,
      referenceId: item._id,
      "metadata.dayKey": dayKey,
    }).lean();

    if (existing) return existing;

    return await createNotification({
      recipientRole: "drrmo",
      senderUser: null,
      senderRole: "drrmo",
      senderName,
      module,
      type,
      priority,
      title,
      message,
      link: module === "donation" ? "/drrmo/inventory/add" : "/drrmo/inventory",
      referenceId: item._id,
      referenceModel: "InventoryItem",
      metadata: {
        dayKey,
        itemId: item._id,
        itemName: item.name,
        itemType: item.type,
        category: item.category || "",
        quantity: item.quantity || 0,
        unit: item.unit || "",
        amount: item.amount || 0,
        referenceNumber: item.referenceNumber || "",
        sourceType: item.sourceType || "",
        sourceName: item.sourceName || "",
        expirationDate: item.expirationDate || null,
        ...metadata,
      },
    });
  } catch (err) {
    console.error("Create Inventory Notification Once Error:", err);
    return null;
  }
};

const notifyDonationCreated = async (item, username = "") => {
  try {
    if (!item?._id) return;

    if (item.type === "goods") {
      await createInventoryNotificationOnce({
        type: "goods_donation_added",
        module: "donation",
        priority: "normal",
        title: "Goods donation added",
        message: `${item.name} was added to inventory with ${Number(
          item.quantity || 0
        ).toLocaleString()} ${item.unit || "unit(s)"}.`,
        item,
        senderName: username,
        metadata: {
          donationType: "goods",
        },
      });

      return;
    }

    if (item.type === "monetary") {
      await createInventoryNotificationOnce({
        type: "monetary_donation_added",
        module: "donation",
        priority: "normal",
        title: "Monetary donation recorded",
        message: `A monetary donation worth PHP ${Number(
          item.amount || 0
        ).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} was recorded.`,
        item,
        senderName: username,
        metadata: {
          donationType: "monetary",
        },
      });
      return;
    }

    if (item.type === "appliance") {
      await createInventoryNotificationOnce({
        type: "appliance_donation_added",
        module: "donation",
        priority: "normal",
        title: "Appliance donation added",
        message: `${item.name} was added to appliance inventory with ${Number(
          item.quantity || 0
        ).toLocaleString()} item(s).`,
        item,
        senderName: username,
        metadata: {
          donationType: "appliance",
          condition: item.condition || "",
          usageDuration: item.usageDuration || "",
        },
      });
    }
  } catch (err) {
    console.error("Notify Donation Created Error:", err);
  }
};

const notifyInventoryRiskState = async (item, username = "") => {
  try {
    if (!item?._id || item.isArchive) return;

    const quantity = Number(item.quantity || 0);
    const expiryMeta =
      item.type === "goods" ? getExpiryMeta(item.expirationDate) : null;

    if (quantity <= 0) {
      await createInventoryNotificationOnce({
        type: "inventory_out_of_stock",
        module: "inventory",
        priority: "critical",
        title: "Inventory item is out of stock",
        message: `${item.name} is now out of stock.`,
        item,
        senderName: username,
        metadata: {
          alertReason: "out_of_stock",
          lowStockThreshold: LOW_STOCK_THRESHOLD,
        },
      });
    } else if (quantity < LOW_STOCK_THRESHOLD) {
      await createInventoryNotificationOnce({
        type: "inventory_low_stock",
        module: "inventory",
        priority: "high",
        title: "Inventory item is low on stock",
        message: `${item.name} is low on stock with only ${quantity} ${
          item.type === "goods" ? item.unit || "unit(s)" : "item(s)"
        } remaining.`,
        item,
        senderName: username,
        metadata: {
          alertReason: "low_stock",
          lowStockThreshold: LOW_STOCK_THRESHOLD,
        },
      });
    }

    if (item.type === "goods" && expiryMeta?.expiryStatus === "expired") {
      await createInventoryNotificationOnce({
        type: "inventory_expired",
        module: "inventory",
        priority: "critical",
        title: "Inventory item has expired",
        message: `${item.name} has expired and should not be released.`,
        item,
        senderName: username,
        metadata: {
          alertReason: "expired",
          expiryStatus: expiryMeta.expiryStatus,
          daysUntilExpiration: expiryMeta.daysUntilExpiration,
        },
      });
    }

    if (item.type === "goods" && expiryMeta?.expiryStatus === "expiring_soon") {
      await createInventoryNotificationOnce({
        type: "inventory_expiring_soon",
        module: "inventory",
        priority: "high",
        title: "Inventory item is expiring soon",
        message: `${item.name} will expire in ${expiryMeta.daysUntilExpiration} day(s).`,
        item,
        senderName: username,
        metadata: {
          alertReason: "expiring_soon",
          expiryStatus: expiryMeta.expiryStatus,
          daysUntilExpiration: expiryMeta.daysUntilExpiration,
        },
      });
    }
  } catch (err) {
    console.error("Notify Inventory Risk State Error:", err);
  }
};

// =========================
// PDF HELPERS
// =========================
const formatDateValue = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
};

const formatTypeLabel = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return "-";

  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const getAiSourceLabel = (ai) => {
  const source = normalizeLower(ai?.source);
  if (!ai?.aiAvailable || source === "rule_based_fallback") return "Rule-based Fallback";
  if (source === "bedrock") return "AWS Bedrock";
  if (source === "gemini") return "Gemini AI";
  return `${formatTypeLabel(source || "AI")} AI`;
};

const formatExpiryStatusLabel = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return "-";

  if (normalized === "expiring_soon") return "Expiring Soon";
  if (normalized === "no_expiry") return "No Expiry";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatPeso = (value) => {
  return `PHP ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const drawPdfLabelValue = (doc, label, value) => {
  doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
  doc.font("Helvetica").text(value ?? "-");
};

const ensurePdfPageSpace = (doc, neededSpace = 80) => {
  if (doc.y + neededSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const drawPdfSectionTitle = (doc, title) => {
  ensurePdfPageSpace(doc, 40);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).text(title);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);
};

const SIMPLE_TABLE_COLUMN_GAP = 8;

const getSimpleTableColumns = (doc, columns) => {
  const printableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalGap = Math.max(0, columns.length - 1) * SIMPLE_TABLE_COLUMN_GAP;
  const availableColumnWidth = printableWidth - totalGap;
  const requestedColumnWidth = columns.reduce(
    (sum, col) => sum + Number(col.width || 0),
    0
  );

  if (!requestedColumnWidth || requestedColumnWidth <= availableColumnWidth) {
    return columns;
  }

  const scale = availableColumnWidth / requestedColumnWidth;
  let usedWidth = 0;

  return columns.map((col, index) => {
    const width =
      index === columns.length - 1
        ? Math.max(24, availableColumnWidth - usedWidth)
        : Math.max(24, Math.floor(Number(col.width || 0) * scale));

    usedWidth += width;
    return { ...col, width };
  });
};

const drawSimpleTableHeader = (doc, columns) => {
  ensurePdfPageSpace(doc, 30);
  const fittedColumns = getSimpleTableColumns(doc, columns);
  const startX = doc.page.margins.left;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(8);
  let x = startX;

  fittedColumns.forEach((col) => {
    doc.text(col.label, x, startY, {
      width: col.width,
      align: col.align || "left",
      height: 14,
      ellipsis: true,
      lineBreak: false,
    });
    x += col.width + SIMPLE_TABLE_COLUMN_GAP;
  });

  doc
    .moveTo(startX, startY + 14)
    .lineTo(doc.page.width - doc.page.margins.right, startY + 14)
    .stroke();

  doc.y = startY + 18;
  doc.font("Helvetica").fontSize(8);

  return fittedColumns;
};

const drawSimpleTableRow = (doc, columns, row, rowHeight = 24) => {
  ensurePdfPageSpace(doc, rowHeight + 12);

  const startX = doc.page.margins.left;
  const startY = doc.y;
  let x = startX;

  columns.forEach((col) => {
    const value = row[col.key] ?? "-";
    doc.text(String(value), x, startY, {
      width: col.width,
      align: col.align || "left",
      height: rowHeight - 6,
      ellipsis: true,
    });
    x += col.width + SIMPLE_TABLE_COLUMN_GAP;
  });

  doc
    .moveTo(startX, startY + rowHeight - 4)
    .lineTo(doc.page.width - doc.page.margins.right, startY + rowHeight - 4)
    .strokeColor("#dddddd")
    .stroke()
    .strokeColor("#000000");

  doc.y = startY + rowHeight;
};

const getInventoryReportMeta = (reportType) => {
  switch (reportType) {
    case "low_stock":
      return {
        title: "Low Stock Inventory Report",
        filename: "inventory-low-stock",
      };

    case "expired":
      return {
        title: "Expired Inventory Report",
        filename: "inventory-expired",
      };

    case "expiring_soon":
      return {
        title: "Expiring Soon Inventory Report",
        filename: "inventory-expiring-soon",
      };

    case "archived":
      return {
        title: "Archived Inventory Report",
        filename: "inventory-archived",
      };

    case "inventory_analytics":
      return {
        title: "Inventory AI Analytics Report",
        filename: "inventory-ai-analytics",
      };

    case "donation_analytics":
      return {
        title: "Donation AI Analytics Report",
        filename: "donation-ai-analytics",
      };

    case "donations":
      return {
        title: "Donation Records Report",
        filename: "donation-records",
      };

    case "goods_donations":
      return {
        title: "Goods Donations Report",
        filename: "goods-donations",
      };

    case "monetary_donations":
      return {
        title: "Monetary Donations Report",
        filename: "monetary-donations",
      };

    case "appliance_donations":
      return {
        title: "Appliance Donations Report",
        filename: "appliance-donations",
      };

    case "masterlist":
    default:
      return {
        title: "Inventory Masterlist Report",
        filename: "inventory-masterlist",
      };
  }
};

const getInventoryItemsForReport = async (reportType) => {
  const isArchivedReport = reportType === "archived";

  const items = await InventoryItem.find({
    isArchive: isArchivedReport,
  }).sort({ createdAt: -1 });

  const enrichedItems = items.map((item) => attachExpiryMeta(item));

  switch (reportType) {
    case "low_stock":
      return enrichedItems.filter((item) => isLowStockItem(item));

    case "expired":
      return enrichedItems.filter(
        (item) => item.type === "goods" && item.expiryStatus === "expired"
      );

    case "expiring_soon":
      return enrichedItems.filter(
        (item) => item.type === "goods" && item.expiryStatus === "expiring_soon"
      );

    case "donations":
      return enrichedItems.filter(
        item =>
          item.type === "goods" ||
          item.type === "monetary" ||
          item.type === "appliance"
      );

    case "goods_donations":
      return enrichedItems.filter((item) => item.type === "goods");

    case "monetary_donations":
      return enrichedItems.filter((item) => item.type === "monetary");

    case "appliance_donations":
      return enrichedItems.filter((item) => item.type === "appliance");

    case "archived":
      return enrichedItems;

    case "masterlist":
    default:
      return enrichedItems;
  }
};

const buildInventorySummary = (items = []) => {
  return items.reduce(
    (acc, item) => {
      acc.totalEntries += 1;

      if (item.type === "goods") {
        acc.goodsEntries += 1;
        acc.totalGoodsQuantity += Number(item.quantity || 0);

        if (item.expiryStatus === "expired") acc.expiredGoods += 1;
        if (item.expiryStatus === "expiring_soon") acc.expiringSoonGoods += 1;
        if (isLowStockItem(item)) acc.lowStockGoods += 1;
      }

      if (item.type === "appliance") {
        acc.applianceEntries += 1;
        acc.totalApplianceQuantity += Number(item.quantity || 0);

        if (isLowStockItem(item)) acc.lowStockAppliances += 1;
      }

      if (item.type === "monetary") {
        acc.monetaryEntries += 1;
        acc.totalMonetaryAmount += Number(item.amount || 0);
      }

      return acc;
    },
    {
      totalEntries: 0,
      goodsEntries: 0,
      applianceEntries: 0,
      monetaryEntries: 0,
      totalGoodsQuantity: 0,
      totalApplianceQuantity: 0,
      totalMonetaryAmount: 0,
      expiredGoods: 0,
      expiringSoonGoods: 0,
      lowStockGoods: 0,
      lowStockAppliances: 0,
    }
  );
};

// =========================
// ANALYTICS HELPERS
// =========================
const getDateKey = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const summarizeDonationPeriod = (items = [], startDate, endDate) => {
  return items.reduce(
    (acc, item) => {
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return acc;
      if (createdAt < startDate || createdAt > endDate) return acc;

      acc.totalDonations += 1;

      if (item.type === "goods") {
        acc.goodsDonations += 1;
        acc.goodsQuantity += Number(item.quantity || 0);
      }

      if (item.type === "monetary") {
        acc.monetaryDonations += 1;
        acc.monetaryAmount += Number(item.amount || 0);
      }

      return acc;
    },
    {
      totalDonations: 0,
      goodsDonations: 0,
      goodsQuantity: 0,
      monetaryDonations: 0,
      monetaryAmount: 0,
    }
  );
};

const summarizeDonationQueuePeriod = (donations = [], startDate, endDate) => {
  return donations.reduce(
    (acc, donation) => {
      const createdAt = donation.createdAt ? new Date(donation.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return acc;
      if (createdAt < startDate || createdAt > endDate) return acc;

      acc.totalRecords += 1;

      const inventoryType = normalizeLower(donation.inventoryType, "goods");
      if (inventoryType === "monetary") {
        acc.monetaryRecords += 1;
        acc.monetaryAmount += Number(donation.amount || 0);
      } else if (inventoryType === "appliance") {
        acc.applianceRecords += 1;
        acc.applianceQuantity += Number(donation.quantity || 0);
      } else {
        acc.goodsRecords += 1;
        acc.goodsQuantity += Number(donation.quantity || 0);
      }

      const status = normalizeLower(donation.status, "pending");
      acc.statusBreakdown[status] = Number(acc.statusBreakdown[status] || 0) + 1;

      return acc;
    },
    {
      totalRecords: 0,
      goodsRecords: 0,
      goodsQuantity: 0,
      monetaryRecords: 0,
      monetaryAmount: 0,
      applianceRecords: 0,
      applianceQuantity: 0,
      statusBreakdown: {},
    }
  );
};

const sortByNumberDesc = (list, field) => {
  return [...list].sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0));
};

const buildAnalyticsSnapshot = async () => {
  const activeItems = await InventoryItem.find({ isArchive: false }).lean();
  const archivedItems = await InventoryItem.countDocuments({ isArchive: true });

  const goodsItems = activeItems.filter((item) => item.type === "goods");
  const applianceItems = activeItems.filter((item) => item.type === "appliance");
  const monetaryItems = activeItems.filter((item) => item.type === "monetary");

  const categoryStats = {};
  [...goodsItems, ...applianceItems].forEach((item) => {
    const category = normalizeString(item.category).toLowerCase() || "uncategorized";
    categoryStats[category] =
      Number(categoryStats[category] || 0) + Number(item.quantity || 0);
  });

  const sourceStats = {
    external: 0,
    government: 0,
    internal: 0,
  };

  activeItems.forEach((item) => {
    const sourceType = normalizeString(item.sourceType).toLowerCase() || "external";
    if (sourceStats[sourceType] !== undefined) {
      sourceStats[sourceType] += 1;
    }
  });

  const summary = activeItems.reduce(
    (acc, item) => {
      acc.totalEntries += 1;

      if (item.type === "goods") {
        acc.goodsEntries += 1;
        acc.activeGoods += 1;
        acc.totalGoodsQuantity += Number(item.quantity || 0);

        const expiryMeta = getExpiryMeta(item.expirationDate);

        if (isLowStockItem(item)) acc.lowStockGoods += 1;
        if (isOutOfStockItem(item)) acc.outOfStockGoods += 1;
        if (expiryMeta.expiryStatus === "expired") acc.expiredGoods += 1;
        if (expiryMeta.expiryStatus === "expiring_soon") acc.expiringSoonGoods += 1;
        if (expiryMeta.expiryStatus === "no_expiry") acc.noExpiryGoods += 1;
        if (expiryMeta.expiryStatus === "ok") acc.safeExpiryGoods += 1;
      }

      if (item.type === "appliance") {
        acc.applianceEntries += 1;
        acc.activeAppliances += 1;
        acc.totalApplianceQuantity += Number(item.quantity || 0);

        if (isLowStockItem(item)) acc.lowStockAppliances += 1;
        if (isOutOfStockItem(item)) acc.outOfStockAppliances += 1;
      }

      if (item.type === "monetary") {
        acc.monetaryEntries += 1;
        acc.activeMonetary += 1;
        acc.totalMonetaryAmount += Number(item.amount || 0);
      }

      return acc;
    },
    {
      totalEntries: 0,
      goodsEntries: 0,
      applianceEntries: 0,
      monetaryEntries: 0,
      activeGoods: 0,
      activeAppliances: 0,
      activeMonetary: 0,
      totalGoodsQuantity: 0,
      totalApplianceQuantity: 0,
      totalMonetaryAmount: 0,
      lowStockGoods: 0,
      lowStockAppliances: 0,
      outOfStockGoods: 0,
      outOfStockAppliances: 0,
      expiredGoods: 0,
      expiringSoonGoods: 0,
      noExpiryGoods: 0,
      safeExpiryGoods: 0,
      archivedItems,
    }
  );

  summary.needsAttention =
    summary.lowStockGoods +
    summary.lowStockAppliances +
    summary.outOfStockGoods +
    summary.outOfStockAppliances +
    summary.expiredGoods +
    summary.expiringSoonGoods;

  const now = new Date();
  const todayEnd = endOfDay(now);

  const donationActivity = {
    today: summarizeDonationPeriod(activeItems, startOfDay(now), todayEnd),
    thisWeek: summarizeDonationPeriod(activeItems, startOfWeek(now), todayEnd),
    thisMonth: summarizeDonationPeriod(activeItems, startOfMonth(now), todayEnd),
  };

  return {
    generatedAt: new Date(),
    summary,
    categoryStats,
    sourceStats,
    donationActivity,
    ai: aiCache || null,
    goodsItems,
    applianceItems,
    monetaryItems,
  };
};

const drawAnalyticsSnapshotPdf = (doc, snapshot, reportType) => {
  const { summary, categoryStats, sourceStats, donationActivity, ai } = snapshot;

  drawPdfSectionTitle(doc, "AI Analytics Summary");
  drawPdfLabelValue(doc, "Generated At", formatDateValue(snapshot.generatedAt));

  if (ai) {
    drawPdfLabelValue(doc, "AI Source", getAiSourceLabel(ai));
    drawPdfLabelValue(doc, "Overall Severity", formatTypeLabel(ai.overallSeverity));
    drawPdfLabelValue(doc, "Executive Summary", ai.executiveSummary || "-");
  } else {
    drawPdfLabelValue(doc, "AI Source", "Not yet generated");
    drawPdfLabelValue(
      doc,
      "Executive Summary",
      "Open the analytics dashboard first to generate cached AI insights."
    );
  }

  drawPdfSectionTitle(doc, "Key Metrics");

  if (reportType === "donation_analytics") {
    drawPdfLabelValue(doc, "Monetary Entries", String(summary.monetaryEntries));
    drawPdfLabelValue(doc, "Total Monetary Amount", formatPeso(summary.totalMonetaryAmount));
    drawPdfLabelValue(doc, "Goods Donation Entries", String(summary.goodsEntries));
    drawPdfLabelValue(doc, "Total Goods Quantity", String(summary.totalGoodsQuantity));
    drawPdfLabelValue(doc, "Appliance Entries", String(summary.applianceEntries));
    drawPdfLabelValue(
      doc,
      "Total Appliance Quantity",
      String(summary.totalApplianceQuantity)
    );
    drawPdfLabelValue(doc, "Donations Today", String(donationActivity.today.totalDonations));
    drawPdfLabelValue(
      doc,
      "Donations This Week",
      String(donationActivity.thisWeek.totalDonations)
    );
    drawPdfLabelValue(
      doc,
      "Donations This Month",
      String(donationActivity.thisMonth.totalDonations)
    );
    drawPdfLabelValue(
      doc,
      "Goods Quantity This Week",
      String(donationActivity.thisWeek.goodsQuantity)
    );
    drawPdfLabelValue(
      doc,
      "Monetary Amount This Week",
      formatPeso(donationActivity.thisWeek.monetaryAmount)
    );
  } else {
    drawPdfLabelValue(doc, "Active Goods", String(summary.activeGoods));
    drawPdfLabelValue(doc, "Active Appliances", String(summary.activeAppliances));
    drawPdfLabelValue(doc, "Total Goods Quantity", String(summary.totalGoodsQuantity));
    drawPdfLabelValue(
      doc,
      "Total Appliance Quantity",
      String(summary.totalApplianceQuantity)
    );
    drawPdfLabelValue(doc, "Needs Attention", String(summary.needsAttention));
    drawPdfLabelValue(doc, "Low Stock Goods", String(summary.lowStockGoods));
    drawPdfLabelValue(
      doc,
      "Low Stock Appliances",
      String(summary.lowStockAppliances)
    );
    drawPdfLabelValue(doc, "Out of Stock Goods", String(summary.outOfStockGoods));
    drawPdfLabelValue(
      doc,
      "Out of Stock Appliances",
      String(summary.outOfStockAppliances)
    );
    drawPdfLabelValue(doc, "Expired Goods", String(summary.expiredGoods));
    drawPdfLabelValue(doc, "Expiring Soon Goods", String(summary.expiringSoonGoods));
    drawPdfLabelValue(doc, "No Expiry Goods", String(summary.noExpiryGoods));
    drawPdfLabelValue(doc, "Archived Items", String(summary.archivedItems));
  }

  drawPdfSectionTitle(doc, "Category Distribution");

  const categoryRows = Object.entries(categoryStats)
    .map(([category, quantity]) => ({
      category: formatTypeLabel(category),
      quantity,
    }))
    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));

  if (!categoryRows.length) {
    doc.font("Helvetica").fontSize(10).text("No category distribution available.");
  } else {
    const columns = [
      { label: "Category", key: "category", width: 250 },
      { label: "Quantity", key: "quantity", width: 100, align: "right" },
    ];

    const tableColumns = drawSimpleTableHeader(doc, columns);

    categoryRows.forEach((row) => {
      drawSimpleTableRow(doc, tableColumns, row, 24);
    });
  }

  drawPdfSectionTitle(doc, "Source Distribution");
  drawPdfLabelValue(doc, "External", String(sourceStats.external));
  drawPdfLabelValue(doc, "Government", String(sourceStats.government));
  drawPdfLabelValue(doc, "Internal", String(sourceStats.internal));

  if (ai?.priorityActions?.length) {
    drawPdfSectionTitle(doc, "AI Priority Actions");

    ai.priorityActions.slice(0, 5).forEach((action, index) => {
      ensurePdfPageSpace(doc, 28);
      doc.font("Helvetica").fontSize(10).text(`${index + 1}. ${action}`);
    });
  }

  if (ai?.insights?.length) {
    drawPdfSectionTitle(doc, "AI Insights");

    ai.insights.slice(0, 6).forEach((insight, index) => {
      ensurePdfPageSpace(doc, 72);
      doc.font("Helvetica-Bold").fontSize(10).text(`${index + 1}. ${insight.title || "Insight"}`);
      doc.font("Helvetica").fontSize(9).text(`Severity: ${formatTypeLabel(insight.severity)}`);
      doc.font("Helvetica").fontSize(9).text(`Message: ${insight.message || "-"}`);
      doc.font("Helvetica").fontSize(9).text(`Action: ${insight.action || "-"}`);
      doc.moveDown(0.4);
    });
  }
};

// =========================
// ANALYTICS CONTROLLERS
// =========================
const getInventorySummary = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false }).lean();

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const summary = items.reduce(
      (acc, item) => {
        acc.totalEntries += 1;

        if (item.type === "goods") {
          acc.goodsEntries += 1;
          acc.totalGoodsQuantity += Number(item.quantity || 0);

          const expiryMeta = getExpiryMeta(item.expirationDate);
          if (expiryMeta.expiryStatus === "expired") acc.expiredGoods += 1;
          if (expiryMeta.expiryStatus === "expiring_soon") acc.expiringSoonGoods += 1;
          if (isLowStockItem(item)) acc.lowStockGoods += 1;
          if (isOutOfStockItem(item)) acc.outOfStockGoods += 1;
        }

        if (item.type === "appliance") {
          acc.applianceEntries += 1;
          acc.totalApplianceQuantity += Number(item.quantity || 0);
          if (isLowStockItem(item)) acc.lowStockAppliances += 1;
          if (isOutOfStockItem(item)) acc.outOfStockAppliances += 1;
        }

        if (item.type === "monetary") {
          acc.monetaryEntries += 1;
          acc.totalMonetaryAmount += Number(item.amount || 0);
        }

        if (item.createdAt && new Date(item.createdAt) >= sevenDaysAgo) {
          acc.recentDonations += 1;
        }

        return acc;
      },
      {
        totalEntries: 0,
        goodsEntries: 0,
        applianceEntries: 0,
        monetaryEntries: 0,
        totalGoodsQuantity: 0,
        totalApplianceQuantity: 0,
        totalMonetaryAmount: 0,
        recentDonations: 0,
        expiredGoods: 0,
        expiringSoonGoods: 0,
        lowStockGoods: 0,
        outOfStockGoods: 0,
        lowStockAppliances: 0,
        outOfStockAppliances: 0,
      }
    );

    res.json(summary);
  } catch (err) {
    console.error("Get Inventory Summary Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventoryCategoryStats = async (req, res) => {
  try {
    const items = await InventoryItem.find({
      isArchive: false,
      type: "goods",
    }).lean();

    const result = {};

    items.forEach((item) => {
      const category = String(item.category || "").toLowerCase();

      if (!result[category]) {
        result[category] = 0;
      }

      result[category] += Number(item.quantity || 0);
    });

    res.json(result);
  } catch (err) {
    console.error("Get Inventory Category Stats Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventorySourceStats = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false }).lean();

    const result = {
      external: 0,
      government: 0,
      internal: 0,
    };

    items.forEach((item) => {
      const sourceType = String(item.sourceType || "").toLowerCase();
      if (result[sourceType] !== undefined) {
        result[sourceType] += 1;
      }
    });

    res.json(result);
  } catch (err) {
    console.error("Get Inventory Source Stats Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventoryRecentTrend = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false })
      .sort({ createdAt: 1 })
      .lean();

    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 6);

    const dateMap = {};

    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      dateMap[getDateKey(day)] = 0;
    }

    items.forEach((item) => {
      if (!item.createdAt) return;

      const key = getDateKey(item.createdAt);
      if (dateMap[key] !== undefined) {
        dateMap[key] += 1;
      }
    });

    const trend = Object.entries(dateMap).map(([date, count]) => ({
      _id: date,
      count,
    }));

    res.json(trend);
  } catch (err) {
    console.error("Get Inventory Recent Trend Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventoryHealth = async (req, res) => {
  try {
    const activeItems = await InventoryItem.find({ isArchive: false }).lean();
    const archivedItems = await InventoryItem.countDocuments({ isArchive: true });

    const result = activeItems.reduce(
      (acc, item) => {
        acc.activeItems += 1;

        if (item.type === "goods") {
          acc.activeGoods += 1;

          const expiryMeta = getExpiryMeta(item.expirationDate);

          if (isLowStockItem(item)) acc.lowStockGoods += 1;
          if (isOutOfStockItem(item)) acc.outOfStockGoods += 1;
          if (expiryMeta.expiryStatus === "expired") acc.expiredGoods += 1;
          if (expiryMeta.expiryStatus === "expiring_soon") acc.expiringSoonGoods += 1;
          if (expiryMeta.expiryStatus === "no_expiry") acc.noExpiryGoods += 1;
          if (expiryMeta.expiryStatus === "ok") acc.safeExpiryGoods += 1;
        }

        if (item.type === "appliance") {
          acc.activeAppliances += 1;
          if (isLowStockItem(item)) acc.lowStockAppliances += 1;
          if (isOutOfStockItem(item)) acc.outOfStockAppliances += 1;
        }

        if (item.type === "monetary") {
          acc.activeMonetary += 1;
        }

        return acc;
      },
      {
        activeItems: 0,
        activeGoods: 0,
        activeAppliances: 0,
        activeMonetary: 0,
        lowStockGoods: 0,
        lowStockAppliances: 0,
        outOfStockGoods: 0,
        outOfStockAppliances: 0,
        expiredGoods: 0,
        expiringSoonGoods: 0,
        noExpiryGoods: 0,
        safeExpiryGoods: 0,
        archivedItems: 0,
      }
    );

    result.archivedItems = archivedItems;
    result.needsAttention =
      result.lowStockGoods +
      result.lowStockAppliances +
      result.outOfStockGoods +
      result.outOfStockAppliances +
      result.expiredGoods +
      result.expiringSoonGoods;

    res.json(result);
  } catch (err) {
    console.error("Get Inventory Health Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getTopDonors = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false })
      .sort({ createdAt: -1 })
      .lean();

    const donorMap = {};

    items.forEach((item) => {
      const key = getDonorKey(item);
      const sourceType = normalizeString(item.sourceType).toLowerCase() || "external";
      const displayName = getPublicSourceName(item);

      if (!donorMap[key]) {
        donorMap[key] = {
          name: displayName,
          sourceType,
          isConfidential: !normalizeString(item.sourceName),
          donationCount: 0,
          goodsDonationCount: 0,
          monetaryDonationCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
          categories: {},
          lastDonationDate: null,
        };
      }

      donorMap[key].donationCount += 1;

      if (item.type === "goods") {
        donorMap[key].goodsDonationCount += 1;
        donorMap[key].totalQuantity += Number(item.quantity || 0);

        const category = normalizeString(item.category).toLowerCase() || "uncategorized";
        donorMap[key].categories[category] =
          Number(donorMap[key].categories[category] || 0) + Number(item.quantity || 0);
      }

      if (item.type === "monetary") {
        donorMap[key].monetaryDonationCount += 1;
        donorMap[key].totalAmount += Number(item.amount || 0);
      }

      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        if (
          !donorMap[key].lastDonationDate ||
          createdAt > new Date(donorMap[key].lastDonationDate)
        ) {
          donorMap[key].lastDonationDate = createdAt;
        }
      }
    });

    const donors = Object.values(donorMap).map((donor) => {
      const topCategoryEntry = Object.entries(donor.categories || {}).sort(
        (a, b) => Number(b[1] || 0) - Number(a[1] || 0)
      )[0];

      return {
        ...donor,
        topCategory: topCategoryEntry ? topCategoryEntry[0] : "",
        topCategoryQuantity: topCategoryEntry ? topCategoryEntry[1] : 0,
      };
    });

    const topMonetaryDonors = sortByNumberDesc(
      donors.filter((donor) => Number(donor.totalAmount || 0) > 0),
      "totalAmount"
    ).slice(0, 5);

    const topGoodsDonors = sortByNumberDesc(
      donors.filter((donor) => Number(donor.totalQuantity || 0) > 0),
      "totalQuantity"
    ).slice(0, 5);

    const frequentDonors = sortByNumberDesc(
      donors.filter((donor) => Number(donor.donationCount || 0) > 0),
      "donationCount"
    ).slice(0, 5);

    res.json({
      totalDonorGroups: donors.length,
      topMonetaryDonors,
      topGoodsDonors,
      frequentDonors,
    });
  } catch (err) {
    console.error("Get Top Donors Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getDonationActivity = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false }).lean();
    const queueDonations = await Donation.find({}).lean();

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const today = summarizeDonationPeriod(items, todayStart, todayEnd);
    const thisWeek = summarizeDonationPeriod(items, weekStart, todayEnd);
    const thisMonth = summarizeDonationPeriod(items, monthStart, todayEnd);
    const thisYear = summarizeDonationPeriod(items, yearStart, todayEnd);

    const queueToday = summarizeDonationQueuePeriod(queueDonations, todayStart, todayEnd);
    const queueThisWeek = summarizeDonationQueuePeriod(queueDonations, weekStart, todayEnd);
    const queueThisMonth = summarizeDonationQueuePeriod(queueDonations, monthStart, todayEnd);
    const queueThisYear = summarizeDonationQueuePeriod(queueDonations, yearStart, todayEnd);

    const sourceBreakdown = {
      external: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
      government: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
      internal: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
    };

    const categoryBreakdown = {};

    items.forEach((item) => {
      const sourceType = normalizeString(item.sourceType).toLowerCase() || "external";

      if (sourceBreakdown[sourceType]) {
        sourceBreakdown[sourceType].totalDonations += 1;

        if (item.type === "goods") {
          sourceBreakdown[sourceType].goodsQuantity += Number(item.quantity || 0);
        }

        if (item.type === "monetary") {
          sourceBreakdown[sourceType].monetaryAmount += Number(item.amount || 0);
        }
      }

      if (item.type === "goods") {
        const category = normalizeString(item.category).toLowerCase() || "uncategorized";

        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = {
            category,
            donationCount: 0,
            totalQuantity: 0,
          };
        }

        categoryBreakdown[category].donationCount += 1;
        categoryBreakdown[category].totalQuantity += Number(item.quantity || 0);
      }
    });

    const topDonatedCategories = Object.values(categoryBreakdown)
      .sort((a, b) => Number(b.totalQuantity || 0) - Number(a.totalQuantity || 0))
      .slice(0, 5);

    res.json({
      today,
      thisWeek,
      thisMonth,
      thisYear,

      donationsToday: today.totalDonations,
      donationsThisWeek: thisWeek.totalDonations,
      donationsThisMonth: thisMonth.totalDonations,
      donationsThisYear: thisYear.totalDonations,

      monetaryToday: today.monetaryAmount,
      monetaryThisWeek: thisWeek.monetaryAmount,
      monetaryThisMonth: thisMonth.monetaryAmount,
      monetaryThisYear: thisYear.monetaryAmount,

      goodsQuantityToday: today.goodsQuantity,
      goodsQuantityThisWeek: thisWeek.goodsQuantity,
      goodsQuantityThisMonth: thisMonth.goodsQuantity,
      goodsQuantityThisYear: thisYear.goodsQuantity,

      queueToday,
      queueThisWeek,
      queueThisMonth,
      queueThisYear,

      queueRecordsToday: queueToday.totalRecords,
      queueRecordsThisWeek: queueThisWeek.totalRecords,
      queueRecordsThisMonth: queueThisMonth.totalRecords,
      queueRecordsThisYear: queueThisYear.totalRecords,

      sourceBreakdown,
      topDonatedCategories,
    });
  } catch (err) {
    console.error("Get Donation Activity Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventoryAiInsights = async (req, res) => {
  if (aiCache && Date.now() - aiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...aiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - aiCacheTime,
    });
  }

  const buildRuleBasedFallback = ({
    items,
    goodsItems,
    monetaryItems,
    thisWeek,
    thisMonth,
    lowStockItems,
    outOfStockItems,
    expiredItems,
        expiringSoonItems,
    noExpiryItems,
    lowestCategories,
    highestCategories,
    totalMonetaryAmount,
    fallbackReason = "",
  }) => {
    const insights = [];

    if (outOfStockItems.length > 0) {
      insights.push({
        type: "out_of_stock",
        severity: "critical",
        title: "Some goods are already out of stock",
        message: `${outOfStockItems.length} goods item${
          outOfStockItems.length === 1 ? " is" : "s are"
        } at zero quantity.`,
        action: "Review these items immediately before approving new release plans.",
      });
    }

    if (lowStockItems.length > 0) {
      insights.push({
        type: "low_stock",
        severity: "warning",
        title: "Low stock needs attention",
        message: `${lowStockItems.length} goods item${
          lowStockItems.length === 1 ? " is" : "s are"
        } below the ${LOW_STOCK_THRESHOLD}-unit stock threshold.`,
        action: "Prioritize replenishment or reserve these items for high-priority requests.",
      });
    }

    if (expiredItems.length > 0) {
      insights.push({
        type: "expired",
        severity: "critical",
        title: "Expired goods found",
        message: `${expiredItems.length} goods item${
          expiredItems.length === 1 ? " has" : "s have"
        } expired and should not be released.`,
        action: "Separate expired items from release planning and update inventory records.",
      });
    }

    if (expiringSoonItems.length > 0) {
      insights.push({
        type: "expiring_soon",
        severity: "warning",
        title: "Goods are expiring soon",
        message: `${expiringSoonItems.length} goods item${
          expiringSoonItems.length === 1 ? " is" : "s are"
        } expiring within 30 days.`,
        action: "Use valid soon-to-expire goods first if they are still safe and appropriate.",
      });
    }

    if (noExpiryItems.length > 0) {
      insights.push({
        type: "missing_expiry",
        severity: "notice",
        title: "Some goods have no expiry date",
        message: `${noExpiryItems.length} goods item${
          noExpiryItems.length === 1 ? " has" : "s have"
        } no recorded expiration date.`,
        action: "Verify expiry dates for food and medicine-related inventory items.",
      });
    }

    if (thisWeek.totalDonations === 0) {
      insights.push({
        type: "no_recent_donations",
        severity: "notice",
        title: "No donations recorded this week",
        message: "There are no active inventory donation entries recorded for the current week.",
        action: "Check if recent donations were encoded or encourage additional donation intake.",
      });
    }

    if (thisMonth.monetaryAmount > 0 && thisWeek.monetaryAmount === 0) {
      insights.push({
        type: "monetary_slowdown",
        severity: "notice",
        title: "Monetary donations slowed this week",
        message: "Monetary donations exist this month, but none were recorded this week.",
        action: "Review recent donation activity and update pending monetary entries if needed.",
      });
    }

    if (lowestCategories.length > 0) {
      const lowest = lowestCategories[0];

      insights.push({
        type: "lowest_category",
        severity: Number(lowest.quantity || 0) < LOW_STOCK_THRESHOLD ? "warning" : "info",
        title: "Lowest stocked category identified",
        message: `${formatTypeLabel(lowest.category)} currently has ${
          lowest.quantity
        } total unit${Number(lowest.quantity || 0) === 1 ? "" : "s"} recorded.`,
        action: "Compare this with expected relief demand before approving large releases.",
      });
    }

    if (highestCategories.length > 0) {
      const highest = highestCategories[0];

      insights.push({
        type: "highest_category",
        severity: "info",
        title: "Most available goods category",
        message: `${formatTypeLabel(highest.category)} has the highest recorded stock at ${
          highest.quantity
        } total units.`,
        action: "Consider this category first when preparing general relief assistance.",
      });
    }

    if (!insights.length) {
      insights.push({
        type: "stable_inventory",
        severity: "success",
        title: "Inventory status looks stable",
        message: "No urgent inventory warnings were detected from current records.",
        action: "Continue monitoring new donations, expiry dates, and release demand.",
      });
    }

    const severityRank = {
      critical: 4,
      warning: 3,
      notice: 2,
      info: 1,
      success: 0,
    };

    const overallSeverity = insights.reduce((highest, insight) => {
      return severityRank[insight.severity] > severityRank[highest]
        ? insight.severity
        : highest;
    }, "success");

    return {
      generatedAt: new Date(),
      source: "rule_based_fallback",
      model: "local_rules",
      aiAvailable: false,
      overallSeverity,
      executiveSummary:
        fallbackReason ||
        (overallSeverity === "critical"
          ? "Inventory needs immediate review because critical stock or expiry issues were detected."
          : overallSeverity === "warning"
          ? "Inventory is usable, but some stock and donation indicators need attention."
          : "Inventory status appears generally stable based on current records."),
      priorityActions: insights.slice(0, 4).map((item) => item.action),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      summary: {
        totalActiveItems: items.length,
        totalGoodsItems: goodsItems.length,
        totalMonetaryItems: monetaryItems.length,
        totalMonetaryAmount,
        donationsThisWeek: thisWeek.totalDonations,
        donationsThisMonth: thisMonth.totalDonations,
        lowStockGoods: lowStockItems.length,
        outOfStockGoods: outOfStockItems.length,
        expiredGoods: expiredItems.length,
        expiringSoonGoods: expiringSoonItems.length,
        noExpiryGoods: noExpiryItems.length,
      },
      lowestCategories,
      highestCategories,
      insights,
      fallbackReason,
      cacheHit: false,
    };
  };

  try {
    const items = await InventoryItem.find({ isArchive: false }).lean();

    const now = new Date();
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const thisWeek = summarizeDonationPeriod(items, weekStart, todayEnd);
    const thisMonth = summarizeDonationPeriod(items, monthStart, todayEnd);

    const goodsItems = items.filter((item) => item.type === "goods");
    const monetaryItems = items.filter((item) => item.type === "monetary");

    const lowStockItems = goodsItems.filter((item) => isLowStockItem(item));
    const outOfStockItems = goodsItems.filter((item) => isOutOfStockItem(item));
    const expiredItems = goodsItems.filter(
      (item) => getExpiryMeta(item.expirationDate).expiryStatus === "expired"
    );
    const expiringSoonItems = goodsItems.filter(
      (item) => getExpiryMeta(item.expirationDate).expiryStatus === "expiring_soon"
    );
    const noExpiryItems = goodsItems.filter(
      (item) => getExpiryMeta(item.expirationDate).expiryStatus === "no_expiry"
    );

    const categoryTotals = {};
    goodsItems.forEach((item) => {
      const category = normalizeString(item.category).toLowerCase() || "uncategorized";
      categoryTotals[category] =
        Number(categoryTotals[category] || 0) + Number(item.quantity || 0);
    });

    const lowestCategories = Object.entries(categoryTotals)
      .map(([category, quantity]) => ({ category, quantity }))
      .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
      .slice(0, 5);

    const highestCategories = Object.entries(categoryTotals)
      .map(([category, quantity]) => ({ category, quantity }))
      .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
      .slice(0, 5);

    const totalMonetaryAmount = monetaryItems.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const facts = {
      generatedAt: new Date(),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      totalActiveItems: items.length,
      totalGoodsItems: goodsItems.length,
      totalMonetaryItems: monetaryItems.length,
      totalMonetaryAmount,
      donationsThisWeek: thisWeek.totalDonations,
      donationGoodsQuantityThisWeek: thisWeek.goodsQuantity,
      donationMonetaryAmountThisWeek: thisWeek.monetaryAmount,
      donationsThisMonth: thisMonth.totalDonations,
      donationGoodsQuantityThisMonth: thisMonth.goodsQuantity,
      donationMonetaryAmountThisMonth: thisMonth.monetaryAmount,
      lowStockGoods: lowStockItems.length,
      outOfStockGoods: outOfStockItems.length,
      expiredGoods: expiredItems.length,
      expiringSoonGoods: expiringSoonItems.length,
      noExpiryGoods: noExpiryItems.length,
      lowestCategories,
      highestCategories,
      examples: {
        lowStockItems: lowStockItems.slice(0, 5).map((item) => ({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
        })),
        expiredItems: expiredItems.slice(0, 5).map((item) => ({
          name: item.name,
          category: item.category,
          expirationDate: item.expirationDate,
        })),
        expiringSoonItems: expiringSoonItems.slice(0, 5).map((item) => ({
          name: item.name,
          category: item.category,
          expirationDate: item.expirationDate,
          daysUntilExpiration: getExpiryMeta(item.expirationDate).daysUntilExpiration,
        })),
      },
    };

    const fallback = buildRuleBasedFallback({
      items,
      goodsItems,
      monetaryItems,
      thisWeek,
      thisMonth,
      lowStockItems,
      outOfStockItems,
      expiredItems,
      expiringSoonItems,
      noExpiryItems,
      lowestCategories,
      highestCategories,
      totalMonetaryAmount,
    });

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO disaster relief management system.
Analyze only the provided inventory facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and dashboard-friendly.
- Use facts such as total goods, total monetary donations, low stock, expired or expiring goods, category distribution, source type distribution, recent intake trend, archived items if included, and proof completeness only when supported by data.
- Focus recommendations on stock readiness, expiry risk, donation source balance, category gaps, and items needing attention.
- Do not invent stock needs, barangays, or relief requests not present in the facts.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Inventory Analytics",
      prompt,
      fallback,
    });

    aiCache = finalPayload;
    aiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Inventory AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// =========================
// EXPORT PDF
// =========================
const exportInventoryPdf = async (req, res) => {
  try {
    const reportType = normalizeLower(req.query.reportType, "masterlist");

    if (!VALID_REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({
        message:
          "Invalid reportType. Use masterlist, low_stock, expired, expiring_soon, archived, inventory_analytics, donation_analytics, donations, goods_donations, monetary_donations, or appliance_donations.",
      });
    }

    const reportMeta = getInventoryReportMeta(reportType);

    if (reportType === "inventory_analytics" || reportType === "donation_analytics") {
      const snapshot = await buildAnalyticsSnapshot();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${reportMeta.filename}-${new Date()
          .toISOString()
          .slice(0, 10)}.pdf"`
      );

      const doc = new PDFDocument({
                size: "A4",
        layout: "portrait",
        margin: 36,
        bufferPages: true,
      });

      doc.pipe(res);

      doc.font("Helvetica-Bold").fontSize(18).text(reportMeta.title, {
        align: "center",
      });

      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).text(
        "Generated from Disaster Relief Management System",
        { align: "center" }
      );

      drawAnalyticsSnapshotPdf(doc, snapshot, reportType);

      ensurePdfPageSpace(doc, 60);
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(9).text(
        `Document generated on ${formatDateValue(new Date())}`,
        { align: "right" }
      );

      doc.end();
      return;
    }

    const items = await getInventoryItemsForReport(reportType);
    const summary = buildInventorySummary(items);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${reportMeta.filename}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 24,
      bufferPages: true,
    });

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).text(reportMeta.title, {
      align: "center",
    });

    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).text(
      "Generated from Disaster Relief Management System",
      { align: "center" }
    );

    drawPdfSectionTitle(doc, "Summary");
    drawPdfLabelValue(doc, "Report Type", formatTypeLabel(reportType));
    drawPdfLabelValue(doc, "Total Entries", String(summary.totalEntries));
    drawPdfLabelValue(doc, "Goods Entries", String(summary.goodsEntries));
    drawPdfLabelValue(doc, "Appliance Entries", String(summary.applianceEntries));
    drawPdfLabelValue(doc, "Monetary Entries", String(summary.monetaryEntries));
    drawPdfLabelValue(doc, "Total Goods Quantity", String(summary.totalGoodsQuantity));
    drawPdfLabelValue(
      doc,
      "Total Appliance Quantity",
      String(summary.totalApplianceQuantity)
    );
    drawPdfLabelValue(doc, "Total Monetary Amount", formatPeso(summary.totalMonetaryAmount));
    drawPdfLabelValue(doc, "Low Stock Goods", String(summary.lowStockGoods));
    drawPdfLabelValue(
      doc,
      "Low Stock Appliances",
      String(summary.lowStockAppliances)
    );
    drawPdfLabelValue(doc, "Expired Goods", String(summary.expiredGoods));
    drawPdfLabelValue(doc, "Expiring Soon Goods", String(summary.expiringSoonGoods));

    drawPdfSectionTitle(doc, "Inventory Items");

    const columns = [
      { label: "Name", key: "name", width: 85 },
      { label: "Type", key: "type", width: 44 },
      { label: "Category", key: "category", width: 55 },
      { label: "Qty", key: "quantity", width: 28, align: "right" },
      { label: "Unit", key: "unit", width: 32 },
      { label: "Condition", key: "condition", width: 42 },
      { label: "Usage", key: "usageDuration", width: 45 },
      { label: "Amount", key: "amount", width: 75, align: "right" },
      { label: "Reference No.", key: "referenceNumber", width: 80 },
      { label: "Expiry", key: "expirationDate", width: 60 },
      { label: "Expiry Status", key: "expiryStatus", width: 50 },
      { label: "Source", key: "sourceType", width: 44 },
      { label: "Source Name", key: "sourceName", width: 58 },
      { label: "Added By", key: "addedBy", width: 40 },
    ];

    if (!items.length) {
      doc.font("Helvetica").fontSize(10).text("No inventory items available for this report.");
    } else {
      let tableColumns = drawSimpleTableHeader(doc, columns);

      items.forEach((item) => {
        const amountText = item.type === "monetary" ? formatPeso(item.amount) : "-";

        if (doc.y + 38 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          tableColumns = drawSimpleTableHeader(doc, columns);
        }

        drawSimpleTableRow(
          doc,
          tableColumns,
          {
            name: normalizeString(item.name) || "-",
            type: formatTypeLabel(item.type),
            category:
              item.type === "goods" || item.type === "appliance"
                ? normalizeString(item.category) || "-"
                : "-",
            quantity:
              item.type === "goods" || item.type === "appliance"
                ? Number(item.quantity || 0)
                : "-",
            unit: item.type === "goods" ? normalizeString(item.unit) || "-" : "-",
            condition:
              item.type === "appliance" ? formatTypeLabel(item.condition) : "-",
            usageDuration:
              item.type === "appliance"
                ? normalizeString(item.usageDuration) || "-"
                : "-",
            amount: amountText,
            referenceNumber:
              item.type === "monetary"
                ? normalizeString(item.referenceNumber) || "-"
                : "-",
            expirationDate: item.type === "goods" ? formatDateOnly(item.expirationDate) : "-",
            expiryStatus:
              item.type === "goods" ? formatExpiryStatusLabel(item.expiryStatus) : "-",
            sourceType: formatTypeLabel(item.sourceType),
            sourceName: normalizeString(item.sourceName) || "-",
            addedBy: normalizeString(item.addedBy) || "-",
          },
          26
        );
      });
    }

    const itemsWithDescription = items.filter((item) => normalizeString(item.description));

    if (itemsWithDescription.length) {
      drawPdfSectionTitle(doc, "Descriptions");

      itemsWithDescription.forEach((item, index) => {
        ensurePdfPageSpace(doc, 50);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`${index + 1}. ${normalizeString(item.name) || "Unnamed Item"}`);
        doc.font("Helvetica").fontSize(10).text(normalizeString(item.description));
        doc.moveDown(0.35);
      });
    }

    ensurePdfPageSpace(doc, 60);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).text(
      `Document generated on ${formatDateValue(new Date())}`,
      { align: "right" }
    );

    doc.end();
  } catch (err) {
    console.error("Export Inventory PDF Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

// Add new inventory item
const addInventory = async (req, res) => {
  console.log("BODY:", req.body);
  console.log("FILES:", req.files);
  console.log("FILE:", req.file);

  try {
    const username = req.session?.username || "";

    const { errors, data } = validateInventoryData(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const roleAccessError = getInventoryRoleAccessError(req, data.type);
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    const proofFiles = await uploadInventoryProofFiles(
      Array.isArray(req.files) ? req.files : req.file ? [req.file] : []
    );

    const itemData = {
      type: data.type,
      name: data.name,
      description: data.description || "",
      sourceType: data.sourceType || "external",
      sourceName: data.sourceName || "",
      proofFiles,
      addedBy: username,
      isArchive: false,
    };

    if (data.type === "goods") {
      if (data.quantity === undefined || data.quantity <= 0) {
        return res.status(400).json({
          message: "Quantity must be greater than 0",
        });
      }

      if (!data.unit) {
        return res.status(400).json({
          message: "Unit is required",
        });
      }

      if (!data.category) {
        return res.status(400).json({
          message: "Category is required",
        });
      }

      itemData.category = data.category;
      itemData.quantity = data.quantity;
      itemData.unit = data.unit;
      itemData.expirationDate = data.expirationDate;
      itemData.requiresExpiration = data.requiresExpiration;
    }

    if (data.type === "appliance") {
      itemData.category = data.category;
      itemData.quantity = data.quantity;
      itemData.condition = data.condition;
      itemData.usageDuration = data.usageDuration;
    }

    if (data.type === "monetary") {
      if (data.amount === undefined || data.amount <= 0) {
        return res.status(400).json({
          message: "Amount must be greater than 0",
        });
      }

      itemData.amount = data.amount;
      itemData.referenceNumber = data.referenceNumber;
    }

    console.log("FINAL ITEM DATA:", itemData);

    const item = await InventoryItem.create(itemData);

    try {
      await createLog(item, "create", username, "Inventory item created");
    } catch (logErr) {
      console.error("LOG ERROR:", logErr);
    }

    await notifyDonationCreated(item, username);
    await notifyInventoryRiskState(item, username);

    res.status(201).json(attachExpiryMeta(item));
  } catch (err) {
    console.error("Add Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get all active inventory items
const getInventory = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: false }).sort({ createdAt: -1 });
    const lockedItemIds = await getReleasedInventoryItemIdSet(items.map((item) => item._id));
    res.json(items.map((item) => attachInventoryEditLockMeta(item, lockedItemIds)));
  } catch (err) {
    console.error("Get Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Update inventory item
const updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.session?.username || "";

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const finalType = req.body.type ? normalizeLower(req.body.type, item.type) : item.type;
    const roleAccessError = getInventoryRoleAccessError(req, finalType);
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    const mergedBody = {
      name: item.name,
      type: finalType,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      amount: item.amount,
      referenceNumber: item.referenceNumber,
      expirationDate: item.expirationDate
        ? new Date(item.expirationDate).toISOString().slice(0, 10)
        : "",
      requiresExpiration: item.requiresExpiration,
      condition: item.condition,
      usageDuration: item.usageDuration,
      description: item.description,
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      ...req.body,
      type: finalType,
    };

    if (finalType === "goods") {
      mergedBody.amount = undefined;
      mergedBody.referenceNumber = undefined;
      mergedBody.condition = undefined;
      mergedBody.usageDuration = undefined;
    }

    if (finalType === "monetary") {
      mergedBody.category = undefined;
      mergedBody.quantity = undefined;
      mergedBody.unit = undefined;
      mergedBody.expirationDate = undefined;
      mergedBody.requiresExpiration = undefined;
      mergedBody.condition = undefined;
      mergedBody.usageDuration = undefined;
    }

    if (finalType === "appliance") {
      mergedBody.amount = undefined;
      mergedBody.referenceNumber = undefined;
      mergedBody.unit = undefined;
      mergedBody.expirationDate = undefined;
      mergedBody.requiresExpiration = undefined;
    }

    const { errors, data } = validateInventoryData(mergedBody, true, item);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const isClassificationLocked = await ReliefRelease.exists({
      isArchived: false,
      "items.inventoryItemId": item._id,
    });

    if (isClassificationLocked) {
      const attemptedProtectedChanges = [];

      if (data.type !== item.type) {
        attemptedProtectedChanges.push("type");
      }

      if (
        (data.type === "goods" || data.type === "appliance") &&
        normalizeString(data.category).toLowerCase() !==
          normalizeString(item.category).toLowerCase()
      ) {
        attemptedProtectedChanges.push("category");
      }

      if (
        data.type === "goods" &&
        normalizeString(data.unit).toLowerCase() !== normalizeString(item.unit).toLowerCase()
      ) {
        attemptedProtectedChanges.push("unit");
      }

      if (
        normalizeString(data.sourceType).toLowerCase() !==
        normalizeString(item.sourceType).toLowerCase()
      ) {
        attemptedProtectedChanges.push("sourceType");
      }

      if (attemptedProtectedChanges.length > 0) {
        return res.status(400).json({
          message:
            "Type, category, unit, and provider cannot be changed after this item has been used in a relief release.",
          lockedFields: PROTECTED_INVENTORY_EDIT_FIELDS,
        });
      }
    }

    if (req.body.name !== undefined) item.name = data.name;
    if (req.body.type !== undefined) item.type = data.type;
    if (req.body.description !== undefined) item.description = data.description;
    if (req.body.sourceType !== undefined) item.sourceType = data.sourceType;
    if (req.body.sourceName !== undefined) item.sourceName = data.sourceName;
    if (req.body.referenceNumber !== undefined) item.referenceNumber = data.referenceNumber;

    if (item.type === "goods") {
      item.category = data.category;
      item.quantity = data.quantity;
      item.unit = data.unit;
      item.expirationDate = data.expirationDate;
      item.requiresExpiration = data.requiresExpiration;

      item.amount = undefined;
      item.referenceNumber = undefined;
      item.condition = undefined;
      item.usageDuration = undefined;
    }

    if (item.type === "appliance") {
      item.category = data.category;
      item.quantity = data.quantity;
      item.condition = data.condition;
      item.usageDuration = data.usageDuration;

      item.unit = undefined;
      item.amount = undefined;
      item.referenceNumber = undefined;
      item.expirationDate = undefined;
      item.requiresExpiration = undefined;
    }

    if (item.type === "monetary") {
      item.amount = data.amount;
      item.referenceNumber = data.referenceNumber;

      item.category = undefined;
      item.quantity = undefined;
      item.unit = undefined;
      item.expirationDate = undefined;
      item.requiresExpiration = undefined;
      item.condition = undefined;
      item.usageDuration = undefined;
    }

    if (req.files && req.files.length > 0) {
      const newFiles = await uploadInventoryProofFiles(req.files);
      item.proofFiles = [...(item.proofFiles || []), ...newFiles];
    }

    await item.save();

    await createLog(item, "update", username, "Inventory item updated");

    await notifyInventoryRiskState(item, username);

    res.json(
      attachInventoryEditLockMeta(
        item,
        new Set(isClassificationLocked ? [normalizeString(item._id)] : [])
      )
    );
  } catch (err) {
    console.error("Update Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Soft delete / archive
const deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.session?.username || "";

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const roleAccessError = getInventoryRoleAccessError(req, item.type);
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    item.isArchive = true;
    await item.save();

    await createLog(item, "archive", username, "Inventory item archived");

    res.json({
      message: "Inventory archived successfully",
      item: attachInventoryEditLockMeta(item),
    });
  } catch (err) {
    console.error("Delete Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get archived inventory
const getArchivedInventory = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isArchive: true }).sort({ updatedAt: -1 });
    const lockedItemIds = await getReleasedInventoryItemIdSet(items.map((item) => item._id));
    res.json(items.map((item) => attachInventoryEditLockMeta(item, lockedItemIds)));
  } catch (err) {
    console.error("Get Archived Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const unarchiveInventory = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const roleAccessError = getInventoryRoleAccessError(req, item.type);
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    item.isArchive = false;
    await item.save();

    res.json({
      message: "Inventory unarchived successfully",
      item: attachInventoryEditLockMeta(item),
    });
  } catch (err) {
    console.error("Unarchive Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const permanentDeleteInventory = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const roleAccessError = getInventoryRoleAccessError(req, item.type);
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    await InventoryItem.findByIdAndDelete(id);

    res.json({
      message: "Inventory permanently deleted successfully",
    });
  } catch (err) {
    console.error("Permanent Delete Inventory Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getInventoryCategories = async (req, res) => {
  try {
    const categories = await InventoryItem.distinct("category", {
      isArchive: false,
      type: "goods",
    });

    res.json(categories.sort());
  } catch (err) {
    console.error("Get Categories Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getDonationAiInsights = async (req, res) => {
  if (donationAiCache && Date.now() - donationAiCacheTime < AI_CACHE_MS) {
    return res.json({
      ...donationAiCache,
      cacheHit: true,
      cacheAgeMs: Date.now() - donationAiCacheTime,
    });
  }

  try {
    const items = await InventoryItem.find({ isArchive: false }).lean();
    const queueDonations = await Donation.find({}).lean();

    const now = new Date();
    const todayEnd = endOfDay(now);
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const inventoryToday = summarizeDonationPeriod(items, todayStart, todayEnd);
    const inventoryWeek = summarizeDonationPeriod(items, weekStart, todayEnd);
    const inventoryMonth = summarizeDonationPeriod(items, monthStart, todayEnd);
    const inventoryYear = summarizeDonationPeriod(items, yearStart, todayEnd);

    const queueToday = summarizeDonationQueuePeriod(queueDonations, todayStart, todayEnd);
    const queueWeek = summarizeDonationQueuePeriod(queueDonations, weekStart, todayEnd);
    const queueMonth = summarizeDonationQueuePeriod(queueDonations, monthStart, todayEnd);
    const queueYear = summarizeDonationQueuePeriod(queueDonations, yearStart, todayEnd);

    const namedDonors = items.reduce((acc, item) => {
      const sourceName =
        normalizeString(item?.sourceName) ||
        (normalizeLower(item?.type) === "monetary" ? normalizeString(item?.name) : "");
      if (!sourceName) return acc;
      if (!acc.has(sourceName.toLowerCase())) {
        acc.set(sourceName.toLowerCase(), sourceName);
      }
      return acc;
    }, new Map());

    const statusCounts = queueDonations.reduce((acc, donation) => {
      const status = normalizeLower(donation?.status, "pending");
      acc[status] = Number(acc[status] || 0) + 1;
      return acc;
    }, {});

    const fallbackInsights = [];

    if (queueWeek.totalRecords > inventoryWeek.totalDonations) {
      fallbackInsights.push({
        type: "queue_pending_conversion",
        severity: "warning",
        title: "Queue intake is ahead of validated entries",
        message: `${queueWeek.totalRecords} donation queue record(s) were created this week versus ${inventoryWeek.totalDonations} validated inventory donation entries.`,
        action: "Review donation queue validation speed so intake is not stuck before encoding.",
      });
    }

    if (Number(statusCounts.pending || 0) > 0) {
      fallbackInsights.push({
        type: "pending_queue",
        severity: Number(statusCounts.pending || 0) >= 5 ? "warning" : "notice",
        title: "Pending donation queue records need review",
        message: `${Number(statusCounts.pending || 0)} donation queue record(s) are still pending.`,
        action: "Check the donation queue and process pending submissions before the backlog grows.",
      });
    }

    if (queueToday.totalRecords === 0) {
      fallbackInsights.push({
        type: "no_queue_today",
        severity: "info",
        title: "No donation queue intake today",
        message: "No new donation queue submissions were recorded today.",
        action: "Keep monitoring donor channels and verify whether submissions are being encoded.",
      });
    }

    if (!fallbackInsights.length) {
      fallbackInsights.push({
        type: "stable_donation_queue",
        severity: "success",
        title: "Donation queue activity looks stable",
        message: "Donation queue intake and validated entries are both present in current records.",
        action: "Continue monitoring queue validation speed, repeat donors, and source balance.",
      });
    }

    const fallback = {
      generatedAt: new Date(),
      source: "rule_based_fallback",
      model: "local_rules",
      aiAvailable: false,
      overallSeverity: fallbackInsights.some((item) => item.severity === "warning")
        ? "warning"
        : fallbackInsights.some((item) => item.severity === "notice")
        ? "notice"
        : "success",
      executiveSummary: fallbackInsights.some((item) => item.severity === "warning")
        ? "Donation queue activity is visible, but some submissions still need review or conversion into validated inventory records."
        : "Donation queue intake and validated donation records are available for monitoring.",
      priorityActions: fallbackInsights.slice(0, 4).map((item) => item.action),
      insights: fallbackInsights.slice(0, 5),
      summary: {
        namedDonors: namedDonors.size,
        inventoryDonationsThisWeek: inventoryWeek.totalDonations,
        inventoryDonationsThisMonth: inventoryMonth.totalDonations,
        inventoryDonationsThisYear: inventoryYear.totalDonations,
        queueRecordsToday: queueToday.totalRecords,
        queueRecordsThisWeek: queueWeek.totalRecords,
        queueRecordsThisMonth: queueMonth.totalRecords,
        queueRecordsThisYear: queueYear.totalRecords,
        pendingQueueRecords: Number(statusCounts.pending || 0),
      },
      fallbackReason: "",
      cacheHit: false,
    };

    const facts = {
      generatedAt: new Date(),
      namedDonors: namedDonors.size,
      inventoryValidated: {
        today: inventoryToday.totalDonations,
        thisWeek: inventoryWeek.totalDonations,
        thisMonth: inventoryMonth.totalDonations,
        thisYear: inventoryYear.totalDonations,
        goodsQuantityThisWeek: inventoryWeek.goodsQuantity,
        monetaryAmountThisWeek: inventoryWeek.monetaryAmount,
      },
      donationQueue: {
        today: queueToday,
        thisWeek: queueWeek,
        thisMonth: queueMonth,
        thisYear: queueYear,
      },
      queueStatusBreakdown: statusCounts,
    };

    const prompt = `
Return ONLY valid minified JSON. No markdown. No explanation. No code fences.

You are an AI analytics assistant for a DRRMO donation monitoring dashboard.
Analyze only the provided compact donation facts. Do not invent records.

JSON shape:
{"overallSeverity":"success|info|notice|warning|critical","executiveSummary":"1 to 3 short sentences","priorityActions":["action 1","action 2","action 3"],"insights":[{"type":"short_snake_case","severity":"success|info|notice|warning|critical","title":"short title","message":"short data-based explanation","action":"specific recommended action"}]}

Rules:
- Make 3 to 5 insights only.
- Keep messages short and dashboard-friendly.
- Use only the provided facts about donation queue intake, validated donation records, named donor visibility, and queue status distribution.
- Mention backlog, intake pace, or validation gaps only when the facts support it.
- Do not invent donors, amounts, barangays, or queue statuses.

Facts:
${JSON.stringify(facts)}
`;

    const finalPayload = await callAiAnalyticsProvider({
      controllerLabel: "Donation Analytics",
      prompt,
      fallback,
    });

    donationAiCache = finalPayload;
    donationAiCacheTime = Date.now();

    return res.json(finalPayload);
  } catch (err) {
    console.error("Get Donation AI Insights Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  addInventory,
  getInventory,
  updateInventory,
  deleteInventory,
  getArchivedInventory,
  unarchiveInventory,
  permanentDeleteInventory,

  getInventorySummary,
  getInventoryCategoryStats,
  getInventorySourceStats,
  getInventoryRecentTrend,
  getInventoryHealth,
  getTopDonors,
  getDonationActivity,
  getInventoryAiInsights,
  getDonationAiInsights,

  getInventoryCategories,
  streamInventoryProofFile,
  previewInventoryProof,
  exportInventoryPdf,
};
