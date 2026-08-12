const Donation = require("../models/Donation");
const DonationNeed = require("../models/DonationNeed");
const InventoryItem = require("../models/InventoryItem");
const User = require("../models/User");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");
const { sendExpoPushNotifications } = require("../utils/sendExpoPushNotifications");
const {
  hasNormalizedDonationReference,
  normalizeDonationReferenceNumber,
} = require("../utils/donationReferenceUtils");
const {
  getDonationAccessError,
  normalizeRole,
} = require("../utils/roleAccessUtils");

const VALID_STATUSES = [
  "pending",
  "received",
  "not_received",
  "resubmitted",
  "accepted",
  "in_transit",
  "delivered",
  "rejected",
];
const VALID_INVENTORY_TYPES = ["goods", "monetary", "appliance"];
const VALID_SOURCE_TYPES = ["external", "government", "internal"];
const VALID_APPLIANCE_CONDITIONS = ["brand_new", "used_item"];
const URGENCY_SCORE = { critical: 4, high: 3, medium: 2, low: 1 };

function sanitizeText(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeLower(value, max = 120) {
  return sanitizeText(value, max).toLowerCase();
}

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getRequestUserId(req) {
  return req.user?._id || req.session?.userId || req.body?.donorUserId || req.query?.userId || null;
}

function toObjectIdOrNull(value) {
  return mongoose.Types.ObjectId.isValid(String(value || "")) ? value : null;
}

function normalizeDonationStatus(value) {
  return sanitizeText(value, 40).toLowerCase();
}

function getSessionRole(req) {
  return normalizeRole(req?.session?.role);
}

function normalizeSourceType(value) {
  const normalized = normalizeLower(value, 40);
  return VALID_SOURCE_TYPES.includes(normalized) ? normalized : "external";
}

function hasMonetarySignals(source = {}) {
  const category = normalizeLower(source?.category, 80);
  const donationType = normalizeLower(source?.donationType, 40);
  const paymentMethod = normalizeLower(source?.paymentMethod, 60);
  const referenceNumber = sanitizeText(
    source?.referenceNumber ||
      source?.gcashReferenceNumber ||
      source?.transferReferenceNumber,
    120
  );
  const amount = Number(source?.amount || 0);
  const quantity = Number(source?.quantity || 0);
  const itemName = sanitizeText(source?.itemName, 120);

  if (donationType === "monetary") return true;
  if (category === "money") return true;
  if (amount > 0 && quantity <= 0) return true;
  if (referenceNumber) return true;
  if (["gcash", "bank_transfer", "bank", "cash"].includes(paymentMethod)) {
    return true;
  }
  if (!itemName && amount > 0) return true;

  return false;
}

function hasApplianceSignals(source = {}) {
  const category = normalizeLower(source?.category, 80);
  const condition = normalizeLower(source?.condition, 40);
  const usageDuration = sanitizeText(source?.usageDuration, 120);
  const explicitType = normalizeLower(
    source?.inventoryType || source?.type || source?.donationType,
    40
  );

  if (explicitType === "appliance") return true;
  if (condition && VALID_APPLIANCE_CONDITIONS.includes(condition)) return true;
  if (usageDuration) return true;
  if (category.includes("appliance")) return true;

  return false;
}

function inferInventoryType(rawType, rawCategory = "", existingDonation = null) {
  const explicit = normalizeLower(rawType, 40);
  const source = {
    ...(existingDonation || {}),
    inventoryType: rawType || existingDonation?.inventoryType,
    donationType: existingDonation?.donationType,
    category: rawCategory || existingDonation?.category,
  };

  if (hasMonetarySignals(source)) return "monetary";
  if (hasApplianceSignals(source) && !hasMonetarySignals(source)) return "appliance";

  if (VALID_INVENTORY_TYPES.includes(explicit)) return explicit;
  if (explicit === "non_monetary") {
    const category = normalizeLower(rawCategory, 80);
    if (category.includes("appliance")) return "appliance";
    return "goods";
  }
  if (explicit === "monetary") return "monetary";

  if (existingDonation?.inventoryType && VALID_INVENTORY_TYPES.includes(existingDonation.inventoryType)) {
    return existingDonation.inventoryType;
  }

  const category = normalizeLower(rawCategory, 80);
  if (category === "money") return "monetary";
  if (category.includes("appliance")) return "appliance";
  return "goods";
}

function normalizeDonationForResponse(donationDoc) {
  const donation = donationDoc?.toObject
    ? donationDoc.toObject({ virtuals: true })
    : { ...(donationDoc || {}) };

  const inventoryType = inferInventoryType(
    donation?.inventoryType || donation?.donationType,
    donation?.category,
    donation
  );

  donation.inventoryType = inventoryType;
  donation.donationType = inventoryType === "monetary" ? "monetary" : "non_monetary";

  if (inventoryType === "monetary") {
    donation.category = "money";
    donation.quantity = 0;
    donation.unit = "";
    donation.condition = "";
    donation.usageDuration = "";
    donation.expirationDate = null;
    donation.requiresExpiration = false;
  } else if (inventoryType === "appliance") {
    donation.amount = 0;
    donation.unit = "";
    donation.expirationDate = null;
    donation.requiresExpiration = false;
  } else {
    donation.amount = 0;
  }

  return donation;
}

function buildMonetaryDonationFilter() {
  return {
    $or: [
      { inventoryType: "monetary" },
      { donationType: "monetary" },
      { category: /^money$/i },
      { paymentMethod: { $in: ["gcash", "bank_transfer", "bank", "cash"] } },
      {
        $and: [
          { amount: { $gt: 0 } },
          {
            $or: [
              { referenceNumber: { $exists: true, $ne: "" } },
              { gcashReferenceNumber: { $exists: true, $ne: "" } },
              { transferReferenceNumber: { $exists: true, $ne: "" } },
            ],
          },
        ],
      },
    ],
  };
}

function buildReferenceNumberFilter(referenceNumber) {
  const normalizedReferenceNumber =
    normalizeDonationReferenceNumber(referenceNumber);

  if (!normalizedReferenceNumber) {
    return null;
  }

  return {
    $or: [
      { normalizedReferenceNumber },
      { referenceNumber: new RegExp(`^${normalizedReferenceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      { gcashReferenceNumber: new RegExp(`^${normalizedReferenceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      { transferReferenceNumber: new RegExp(`^${normalizedReferenceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    ],
  };
}

async function findDuplicateReferenceDonations(referenceNumber, excludeId = null) {
  const filter = buildReferenceNumberFilter(referenceNumber);
  if (!filter) return [];

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return Donation.find(filter).sort({ createdAt: -1 });
}

async function attachDuplicateReferenceMetadata(donationDoc) {
  const normalizedDonation = normalizeDonationForResponse(donationDoc);
  const referenceNumber =
    normalizedDonation?.referenceNumber ||
    normalizedDonation?.gcashReferenceNumber ||
    normalizedDonation?.transferReferenceNumber ||
    "";

  if (!hasNormalizedDonationReference(referenceNumber)) {
    return {
      ...normalizedDonation,
      duplicateCount: 1,
      groupedDonationIds: normalizedDonation?._id ? [normalizedDonation._id] : [],
    };
  }

  const duplicates = await findDuplicateReferenceDonations(referenceNumber);

  return {
    ...normalizedDonation,
    duplicateCount: Math.max(1, duplicates.length),
    groupedDonationIds: duplicates.map((item) => item._id),
  };
}

async function uploadPhoto(file) {
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "evacuation_app/donations" },
      (err, uploadResult) => {
        if (err) return reject(err);
        resolve(uploadResult);
      }
    ).end(file.buffer);
  });

  return {
    fileName: file.originalname,
    fileUrl: result.secure_url,
    public_id: result.public_id,
  };
}

function collectUploadedFiles(req) {
  return Array.isArray(req.files) ? req.files : req.files ? Object.values(req.files).flat() : [];
}

function buildDonationPayload(body = {}, existingDonation = null) {
  const inventoryType = inferInventoryType(
    body.inventoryType || body.type || body.donationType,
    body.category,
    existingDonation
  );
  const donationType = inventoryType === "monetary" ? "monetary" : "non_monetary";
  const category =
    inventoryType === "monetary"
      ? "money"
      : normalizeLower(body.category, 80) || normalizeLower(existingDonation?.category, 80);
  const donorName = sanitizeText(
    body.donorName || body.sourceName || body.name || existingDonation?.donorName,
    120
  );
  const itemName = sanitizeText(body.itemName || body.name || existingDonation?.itemName, 120);
  const quantity =
    body.quantity !== undefined ? toNumber(body.quantity, NaN) : Number(existingDonation?.quantity || 0);
  const amount =
    body.amount !== undefined ? toNumber(body.amount, NaN) : Number(existingDonation?.amount || 0);
  const condition =
    inventoryType === "appliance"
      ? normalizeLower(body.condition || existingDonation?.condition, 40)
      : "";
  const usageDuration =
    inventoryType === "appliance"
      ? sanitizeText(body.usageDuration || existingDonation?.usageDuration, 120)
      : "";

  const payload = {
    inventoryType,
    donationType,
    category,
    itemName,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit:
      inventoryType === "goods"
        ? sanitizeText(body.unit || existingDonation?.unit, 30) || "pcs"
        : "",
    description: sanitizeText(body.description || existingDonation?.description, 1000),
    amount: Number.isFinite(amount) ? amount : 0,
    sourceType: normalizeSourceType(body.sourceType || existingDonation?.sourceType),
    condition,
    usageDuration,
    referenceNumber: sanitizeText(
      body.referenceNumber || body.reference || existingDonation?.referenceNumber,
      120
    ),
    donorName,
    donorPhone: sanitizeText(body.donorPhone || body.phone || existingDonation?.donorPhone, 40),
    donorEmail: sanitizeText(body.donorEmail || body.email || existingDonation?.donorEmail, 120).toLowerCase(),
    contactInfo: sanitizeText(body.contactInfo || existingDonation?.contactInfo, 240),
    fulfillmentMethod:
      sanitizeText(body.fulfillmentMethod || existingDonation?.fulfillmentMethod, 40) === "pickup"
        ? "pickup"
        : "drop_off",
    location: sanitizeText(body.location || existingDonation?.location, 240),
    barangay: sanitizeText(body.barangay || existingDonation?.barangay, 100),
    latitude:
      body.latitude !== undefined
        ? toNumber(body.latitude, null)
        : existingDonation?.latitude ?? null,
    longitude:
      body.longitude !== undefined
        ? toNumber(body.longitude, null)
        : existingDonation?.longitude ?? null,
  };

  const errors = [];

  if (!payload.donorName) {
    errors.push("Donor name is required.");
  }

  if (!payload.sourceType) {
    errors.push("Source type is required.");
  }

  if (inventoryType === "monetary") {
    if (!(payload.amount > 0)) {
      errors.push("Amount is required for monetary donations.");
    }
    if (!payload.referenceNumber) {
      errors.push("Reference number is required for monetary donations.");
    } else if (!/^\d+$/.test(payload.referenceNumber)) {
      errors.push("Reference number must contain numbers only.");
    }
  }

  if (inventoryType === "goods") {
    if (!payload.itemName) errors.push("Item name is required for goods donations.");
    if (!payload.category) errors.push("Category is required for goods donations.");
    if (!(payload.quantity > 0)) errors.push("Quantity is required for goods donations.");
  }

  if (inventoryType === "appliance") {
    if (!payload.itemName) errors.push("Appliance name is required.");
    if (!payload.category) errors.push("Category is required for appliance donations.");
    if (!(payload.quantity > 0)) errors.push("Quantity is required for appliance donations.");
    if (!VALID_APPLIANCE_CONDITIONS.includes(payload.condition)) {
      errors.push("Condition is required for appliance donations.");
    }
    if (payload.condition === "used_item" && !payload.usageDuration) {
      errors.push("Usage duration is required for used appliance donations.");
    }
  }

  return { payload, errors };
}

function buildInventoryPayloadFromDonation(donation, username = "") {
  const inventoryType = inferInventoryType(
    donation?.inventoryType || donation?.donationType,
    donation?.category,
    donation
  );

  const proofFiles = Array.isArray(donation?.photos)
    ? donation.photos.map((photo) => sanitizeText(photo?.fileUrl, 500)).filter(Boolean)
    : [];

  const base = {
    type: inventoryType,
    name:
      inventoryType === "monetary"
        ? sanitizeText(donation?.donorName, 120) || "Monetary Donation"
        : sanitizeText(donation?.itemName, 120),
    description: sanitizeText(donation?.description, 1000),
    sourceType: normalizeSourceType(donation?.sourceType),
    sourceName: sanitizeText(donation?.donorName, 120),
    proofFiles,
    addedBy: sanitizeText(username, 120) || "drrmo",
    isArchive: false,
  };

  if (inventoryType === "monetary") {
    return {
      ...base,
      amount: Number(donation?.amount || 0),
      referenceNumber: sanitizeText(donation?.referenceNumber, 120),
      description: sanitizeText(donation?.description, 1000),
    };
  }

  if (inventoryType === "appliance") {
    return {
      ...base,
      category: normalizeLower(donation?.category, 80),
      quantity: Number(donation?.quantity || 0),
      condition: normalizeLower(donation?.condition, 40) || "brand_new",
      usageDuration:
        normalizeLower(donation?.condition, 40) === "used_item"
          ? sanitizeText(donation?.usageDuration, 120)
          : undefined,
    };
  }

  return {
    ...base,
    category: normalizeLower(donation?.category, 80),
    quantity: Number(donation?.quantity || 0),
    unit: sanitizeText(donation?.unit, 30) || "pcs",
    requiresExpiration: Boolean(donation?.requiresExpiration),
    expirationDate: donation?.expirationDate || undefined,
  };
}

async function createInventoryFromDonationIfNeeded(donation, username = "") {
  if (donation?.inventoryItemId) {
    const existingItem = await InventoryItem.findById(donation.inventoryItemId);
    if (existingItem) return existingItem;
  }

  const payload = buildInventoryPayloadFromDonation(donation, username);

  try {
    const item = await InventoryItem.create(payload);
    donation.inventoryItemId = item._id;
    return item;
  } catch (err) {
    const reason = err?.message || "Inventory creation failed.";
    throw new Error(`Failed to move donation into inventory: ${reason}`);
  }
}

async function findMatchesForDonation(donation) {
  if (inferInventoryType(donation?.inventoryType || donation?.donationType, donation?.category, donation) !== "goods") {
    return [];
  }

  const filter = {
    isActive: true,
    category: donation.category,
  };

  const needs = await DonationNeed.find(filter);
  return needs
    .map((need) => {
      const sameBarangay =
        donation.barangay &&
        need.barangay &&
        donation.barangay.toLowerCase() === need.barangay.toLowerCase();
      const nameHit =
        donation.itemName &&
        need.itemName &&
        need.itemName.toLowerCase().includes(donation.itemName.toLowerCase());
      const score =
        (URGENCY_SCORE[need.urgency] || 0) * 10 +
        (sameBarangay ? 8 : 0) +
        (nameHit ? 4 : 0) +
        Math.min(5, need.remainingQuantity || 0);

      return { need, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ need, score }) => ({ ...need.toObject({ virtuals: true }), matchScore: score }));
}

async function notifyDonationSubmitted(donation, req, isResubmission = false) {
  try {
    const donorLabel =
      sanitizeText(donation?.donorName, 120) ||
      sanitizeText(req.session?.username, 120) ||
      "A donor";

    await createNotification({
      recipientRole: "drrmo",
      senderUser: req.session?.userId || null,
      senderRole: req.session?.role || "barangay",
      senderName: donorLabel,
      module: "donation",
      type: isResubmission ? "donation_resubmitted" : "donation_submission",
      priority: donation?.inventoryType === "monetary" ? "high" : "normal",
      title: isResubmission ? "Donation resubmitted" : "New Donation Submission",
      message: isResubmission
        ? `${donorLabel} resubmitted a ${donation?.inventoryType || donation?.donationType} donation for review.`
        : `${donorLabel} submitted a ${donation?.inventoryType || donation?.donationType} donation for review.`,
      link: "/drrmo/donations/queue",
      referenceId: donation?._id || null,
      referenceModel: "Donation",
      metadata: {
        donationType: donation?.inventoryType || donation?.donationType || "",
        amount: Number(donation?.amount || 0),
        quantity: Number(donation?.quantity || 0),
        donorName: donorLabel,
        resubmissionCount: Number(donation?.resubmissionCount || 0),
      },
    });
  } catch (err) {
    console.error("Notify Donation Submitted Error:", err);
  }
}

async function notifyDonationReceiptDecision(donation, req, status) {
  try {
    const donorLabel = sanitizeText(donation?.donorName, 120) || "Donation";
    const decision = status === "received" ? "received" : "marked as not received";
    const donorUserId = toObjectIdOrNull(donation?.donorUserId);

    if (!donorUserId) {
      return;
    }

    const title = status === "received" ? "Donation received" : "Donation not received";
    const message = `${donorLabel} donation was ${decision}.`;

    await createNotification({
      recipientRole: "all",
      recipientUser: donorUserId,
      recipientUserModel: "User",
      senderUser: req.session?.userId || null,
      senderRole: req.session?.role || "drrmo",
      senderName: sanitizeText(req.session?.username, 120) || "DRRMO",
      module: "donation",
      type: status === "received" ? "donation_received" : "donation_not_received",
      priority: "normal",
      title,
      message,
      link: "/donations",
      referenceId: donation?._id || null,
      referenceModel: "Donation",
      metadata: {
        donationType: donation?.inventoryType || donation?.donationType || "",
        amount: Number(donation?.amount || 0),
        quantity: Number(donation?.quantity || 0),
        donationId: donation?._id || null,
        decision: status,
      },
    });

    const donorUser = await User.findById(donorUserId).select("_id notificationTokens").lean();
    await sendExpoPushNotifications([donorUser], {
      title,
      body: message,
      soundType: "notification",
      data: {
        type: status === "received" ? "donation_received" : "donation_not_received",
        soundType: "notification",
        donationId: String(donation?._id || ""),
      },
    });
  } catch (err) {
    console.error("Notify Donation Receipt Decision Error:", err);
  }
}

async function createDonation(req, res) {
  try {
    const { payload, errors } = buildDonationPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (hasNormalizedDonationReference(payload.referenceNumber)) {
      const duplicates = await findDuplicateReferenceDonations(
        payload.referenceNumber
      );

      if (duplicates.length > 0) {
        return res.status(409).json({
          message:
            "A donation with this reference number already exists. Duplicate reference numbers are not allowed.",
          duplicateDonationId: duplicates[0]?._id || null,
        });
      }
    }

    const files = collectUploadedFiles(req);
    const photos = await Promise.all(files.slice(0, 4).map(uploadPhoto));

    const donation = await Donation.create({
      ...payload,
      donorUserId: toObjectIdOrNull(getRequestUserId(req)),
      photos,
      status: "pending",
      history: [
        {
          status: "pending",
          message: "Donation submitted for DRRMO review.",
          createdAt: new Date(),
          actorId: toObjectIdOrNull(getRequestUserId(req)),
        },
      ],
    });

    const matches = await findMatchesForDonation(donation);
    if (matches.length) {
      donation.matchedNeedIds = matches.map((need) => need._id);
      await donation.save();
    }

    await notifyDonationSubmitted(donation, req, false);

    res.status(201).json({ donation, matches });
  } catch (err) {
    console.error("Create donation error:", err);
    res.status(500).json({ message: "Failed to submit donation.", error: err.message });
  }
}

async function getDonations(req, res) {
  try {
    const filter = {};
    const sessionRole = getSessionRole(req);
    const typeFilter = normalizeLower(req.query.type, 40);
    const isValidationQueueScope =
      normalizeLower(req.query.scope, 60) === "validation_queue";
    const roleScopedType =
      isValidationQueueScope && sessionRole === "admin"
        ? "monetary"
        : isValidationQueueScope && sessionRole === "drrmo"
        ? "non_monetary"
        : "";

    const effectiveTypeFilter = roleScopedType || typeFilter;
    if (VALID_INVENTORY_TYPES.includes(effectiveTypeFilter)) {
      if (effectiveTypeFilter === "monetary") {
        Object.assign(filter, buildMonetaryDonationFilter());
      } else {
        filter.inventoryType = effectiveTypeFilter;
      }
    } else if (effectiveTypeFilter === "non_monetary") {
      filter.inventoryType = { $in: ["goods", "appliance"] };
    } else if (effectiveTypeFilter === "monetary") {
      Object.assign(filter, buildMonetaryDonationFilter());
    }

    if (req.query.category) filter.category = normalizeLower(req.query.category, 80);
    if (req.query.status) filter.status = normalizeDonationStatus(req.query.status);
    if (req.query.location) filter.location = new RegExp(sanitizeText(req.query.location, 120), "i");
    if (req.query.barangay) filter.barangay = new RegExp(`^${sanitizeText(req.query.barangay, 100)}$`, "i");
    if (req.query.userId && toObjectIdOrNull(req.query.userId)) {
      filter.donorUserId = req.query.userId;
    }

    const donations = await Donation.find(filter)
      .populate("matchedNeedIds")
      .sort({ createdAt: -1 })
      .limit(Math.min(300, toNumber(req.query.limit, 100)));

    res.json(donations.map(normalizeDonationForResponse));
  } catch (err) {
    console.error("Get donations error:", err);
    res.status(500).json({ message: "Failed to fetch donations." });
  }
}

async function getMyDonations(req, res) {
  try {
    const userId = toObjectIdOrNull(req.params.userId);
    if (!userId) {
      return res.status(400).json({ message: "Valid userId is required." });
    }

    const donations = await Donation.find({ donorUserId: userId })
      .populate("matchedNeedIds")
      .sort({ createdAt: -1 })
      .limit(Math.min(300, toNumber(req.query.limit, 100)));

    res.json(donations.map(normalizeDonationForResponse));
  } catch (err) {
    console.error("Get my donations error:", err);
    res.status(500).json({ message: "Failed to fetch donation history." });
  }
}

async function getDonationById(req, res) {
  try {
    const donation = await Donation.findById(req.params.id).populate("matchedNeedIds");
    if (!donation) return res.status(404).json({ message: "Donation not found." });
    const normalizedDonation = normalizeDonationForResponse(donation);
    const roleAccessError = getDonationAccessError(
      getSessionRole(req),
      normalizedDonation.inventoryType
    );
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }
    res.json(await attachDuplicateReferenceMetadata(donation));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch donation." });
  }
}

async function updateDonationStatus(req, res) {
  try {
    const status = normalizeDonationStatus(req.body.status);
    if (!["received", "not_received"].includes(status)) {
      return res.status(400).json({ message: "Invalid donation status." });
    }

    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });
    const normalizedDonation = normalizeDonationForResponse(donation);
    const roleAccessError = getDonationAccessError(
      getSessionRole(req),
      normalizedDonation.inventoryType
    );
    if (roleAccessError) {
      return res.status(403).json({ message: roleAccessError });
    }

    const groupedDonations = hasNormalizedDonationReference(donation.referenceNumber)
      ? await findDuplicateReferenceDonations(donation.referenceNumber)
      : [];
    const donationGroup = groupedDonations.length
      ? [
          donation,
          ...groupedDonations.filter(
            (item) => String(item._id) !== String(donation._id)
          ),
        ]
      : [donation];

    if (status === "received") {
      const alreadyReceived = donationGroup.find(
        (item) =>
          String(item.status || "").toLowerCase() === "received" &&
          item.inventoryItemId
      );

      if (alreadyReceived && donationGroup.every((item) => String(item.status || "").toLowerCase() === "received")) {
        return res.json(await attachDuplicateReferenceMetadata(alreadyReceived));
      }

      const username = sanitizeText(req.session?.username, 120) || "drrmo";
      const inventoryItemId =
        alreadyReceived?.inventoryItemId ||
        (await createInventoryFromDonationIfNeeded(donation, username))._id;

      const historyMessage =
        sanitizeText(req.body.message, 240) ||
        "Donation marked as received and added to inventory.";
      const now = new Date();
      for (const groupedDonation of donationGroup) {
        groupedDonation.status = "received";
        groupedDonation.inventoryItemId =
          inventoryItemId || groupedDonation.inventoryItemId || null;
        groupedDonation.receivedBy = username;
        groupedDonation.receivedAt = now;
        groupedDonation.notReceivedBy = "";
        groupedDonation.notReceivedAt = null;
        groupedDonation.adminNotes = sanitizeText(
          req.body.adminNotes ?? groupedDonation.adminNotes,
          1000
        );
        groupedDonation.history.push({
          status: "received",
          message: historyMessage,
          createdAt: now,
          actorId: toObjectIdOrNull(getRequestUserId(req)),
        });
        await groupedDonation.save();
      }
    }

    if (status === "not_received") {
      const username = sanitizeText(req.session?.username, 120) || "drrmo";
      const historyMessage =
        sanitizeText(req.body.message, 240) || "Donation marked as not received.";
      const now = new Date();
      for (const groupedDonation of donationGroup) {
        groupedDonation.status = "not_received";
        groupedDonation.notReceivedBy = username;
        groupedDonation.notReceivedAt = now;
        groupedDonation.receivedBy = "";
        groupedDonation.receivedAt = null;
        groupedDonation.inventoryItemId = null;
        groupedDonation.adminNotes = sanitizeText(
          req.body.adminNotes ?? groupedDonation.adminNotes,
          1000
        );
        groupedDonation.history.push({
          status: "not_received",
          message: historyMessage,
          createdAt: now,
          actorId: toObjectIdOrNull(getRequestUserId(req)),
        });
        await groupedDonation.save();
      }
    }
    await notifyDonationReceiptDecision(donation, req, status);

    res.json({
      ...(await attachDuplicateReferenceMetadata(donation)),
      groupedDonationIds: donationGroup.map((item) => item._id),
      duplicateCount: donationGroup.length,
    });
  } catch (err) {
    console.error("Update donation status error:", err);
    res.status(500).json({ message: err.message || "Failed to update donation status." });
  }
}

async function resubmitDonation(req, res) {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });

    if (normalizeDonationStatus(donation.status) !== "not_received") {
      return res.status(400).json({ message: "Only not received donations can be resubmitted." });
    }

    const { payload, errors } = buildDonationPayload(req.body, donation);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (hasNormalizedDonationReference(payload.referenceNumber)) {
      const duplicates = await findDuplicateReferenceDonations(
        payload.referenceNumber,
        donation._id
      );

      if (duplicates.length > 0) {
        return res.status(409).json({
          message:
            "A donation with this reference number already exists. Duplicate reference numbers are not allowed.",
          duplicateDonationId: duplicates[0]?._id || null,
        });
      }
    }

    const files = collectUploadedFiles(req);
    const photos = files.length > 0 ? await Promise.all(files.slice(0, 4).map(uploadPhoto)) : donation.photos;

    Object.assign(donation, payload, {
      donorUserId: toObjectIdOrNull(getRequestUserId(req)) || donation.donorUserId || null,
      photos,
      status: "resubmitted",
      wasResubmitted: true,
      resubmissionCount: Number(donation.resubmissionCount || 0) + 1,
      lastResubmittedAt: new Date(),
      notReceivedBy: "",
      notReceivedAt: null,
      receivedBy: "",
      receivedAt: null,
      inventoryItemId: null,
    });

    donation.history.push({
      status: "resubmitted",
      message:
        sanitizeText(req.body.message, 240) || "Donation resubmitted for DRRMO review.",
      createdAt: new Date(),
      actorId: toObjectIdOrNull(getRequestUserId(req)),
    });

    const matches = await findMatchesForDonation(donation);
    donation.matchedNeedIds = matches.map((need) => need._id);
    await donation.save();
    await notifyDonationSubmitted(donation, req, true);

    res.json({ donation, matches });
  } catch (err) {
    console.error("Resubmit donation error:", err);
    res.status(500).json({ message: "Failed to resubmit donation." });
  }
}

async function assignDonation(req, res) {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });

    donation.assignment = {
      targetType: sanitizeText(req.body.targetType, 40) || "general",
      targetId: toObjectIdOrNull(req.body.targetId),
      targetName: sanitizeText(req.body.targetName, 160),
      assignedBy: toObjectIdOrNull(getRequestUserId(req)),
      assignedAt: new Date(),
      notes: sanitizeText(req.body.notes, 500),
    };

    donation.history.push({
      status: donation.status,
      message: `Assigned to ${donation.assignment.targetName || donation.assignment.targetType}.`,
      createdAt: new Date(),
      actorId: toObjectIdOrNull(getRequestUserId(req)),
    });

    await donation.save();
    res.json(donation);
  } catch (err) {
    console.error("Assign donation error:", err);
    res.status(500).json({ message: "Failed to assign donation." });
  }
}

async function getMatches(req, res) {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });
    res.json(await findMatchesForDonation(donation));
  } catch (err) {
    res.status(500).json({ message: "Failed to match donation." });
  }
}

async function createNeed(req, res) {
  try {
    const need = await DonationNeed.create({
      category: sanitizeText(req.body.category, 40),
      itemName: sanitizeText(req.body.itemName, 120),
      quantityNeeded: toNumber(req.body.quantityNeeded, 0),
      quantityFulfilled: toNumber(req.body.quantityFulfilled, 0),
      urgency: sanitizeText(req.body.urgency, 40) || "medium",
      targetType: sanitizeText(req.body.targetType, 40),
      targetId: toObjectIdOrNull(req.body.targetId),
      targetName: sanitizeText(req.body.targetName, 160),
      barangay: sanitizeText(req.body.barangay, 100),
      description: sanitizeText(req.body.description, 1000),
      isActive: req.body.isActive !== false,
    });

    res.status(201).json(need);
  } catch (err) {
    res.status(400).json({ message: "Failed to create donation need.", error: err.message });
  }
}

async function getNeeds(req, res) {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.barangay) filter.barangay = new RegExp(`^${sanitizeText(req.query.barangay, 100)}$`, "i");
    if (req.query.active !== "false") filter.isActive = true;

    const needs = await DonationNeed.find(filter).sort({ urgency: -1, createdAt: -1 });
    res.json(needs);
  } catch (err) {
    console.error("Get donation needs error:", err);
    res.status(500).json({ message: "Failed to fetch donation needs." });
  }
}

module.exports = {
  createDonation,
  getDonations,
  getMyDonations,
  getDonationById,
  updateDonationStatus,
  resubmitDonation,
  assignDonation,
  getMatches,
  createNeed,
  getNeeds,
};
