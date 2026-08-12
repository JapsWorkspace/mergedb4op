const mongoose = require("mongoose");
const Place = require("../models/EvacPlace.js");
const EHistory = require("../models/EvacHistory.js");
const Barangay = require("../models/Barangay");
const Notification = require("../models/Notification");
const createNotification = require("../utils/createNotification");
const {
  createPdfDocument,
  drawPdfEmptyState,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfLabelValue,
  drawPdfParagraphBlock,
  drawPdfSectionTitle,
  drawPdfTable,
  ensurePdfPageSpace,
  formatPdfDateValue,
} = require("../utils/pdfTheme");

// -----------------------------
// HELPERS
// -----------------------------
const sanitizeText = (value) => {
  return String(value || "").replace(/<[^>]*>?/gm, "").trim();
};

const escapeRegex = (value) => {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const toNumber = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const clampNumber = (value, min = 0, max = null) => {
  let num = toNumber(value, min);

  if (num < min) num = min;
  if (max !== null && max !== undefined && num > max) num = max;

  return num;
};

const safeLower = (value) => String(value || "").toLowerCase().trim();

const LIMITED_OCCUPANCY_PERCENT = 75;

const toObjectIdOrNull = (value) => {
  if (!value) return null;

  const raw = typeof value === "object" && value !== null && value._id ? value._id : value;
  return mongoose.Types.ObjectId.isValid(String(raw)) ? raw : null;
};

const deriveCapacityStatus = (currentOccupants, capacityIndividual) => {
  const current = Number(currentOccupants || 0);
  const capacity = Number(capacityIndividual || 0);
  const occupancyPercent =
    capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  if (capacity > 0 && current >= capacity) return "full";
  if (capacity > 0 && occupancyPercent >= LIMITED_OCCUPANCY_PERCENT) {
    return "limited";
  }
  return "available";
};
const buildOccupancySummary = (place) => {
  const current = Number(place.currentOccupants || 0);
  const capacity = Number(place.capacityIndividual || 0);
  const remaining = Math.max(0, capacity - current);
  const percent = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  return {
    currentOccupants: current,
    capacityIndividual: capacity,
    remainingIndividualCapacity: remaining,
    occupancyPercent: percent,
    capacityStatus: place.capacityStatus || deriveCapacityStatus(current, capacity),
  };
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return Boolean(value);
};

const normalizeBarangayKey = (value) => {
  return safeLower(value).replace(/[\s_-]+/g, "");
};

const buildBarangayLooseRegex = (value) => {
  const cleaned = normalizeBarangayKey(value);
  if (!cleaned) return null;

  const chars = cleaned.split("").map((char) => escapeRegex(char));
  return new RegExp(chars.join("[\\s_-]*"), "i");
};

const getSessionBarangayCandidates = (req) => {
  const candidates = [
    req.session?.barangayName,
    req.session?.username,
    req.session?.name,
  ]
    .map((item) => sanitizeText(item))
    .filter(Boolean);

  return [...new Set(candidates)];
};

const buildHistoryMeta = (
  req,
  place = null,
  fallbackBarangayId = null,
  fallbackBarangayName = ""
) => {
  return {
    barangayId:
      toObjectIdOrNull(place?.barangayId) ||
      toObjectIdOrNull(fallbackBarangayId) ||
      toObjectIdOrNull(req.session?.userId),
    barangayName:
      sanitizeText(place?.barangayName) ||
      sanitizeText(fallbackBarangayName) ||
      sanitizeText(req.session?.barangayName || req.session?.username || req.session?.name),
    performedBy: sanitizeText(req.session?.username || req.session?.name || "unknown"),
    performedByRole: sanitizeText(req.session?.role || ""),
  };
};

const buildBarangayLookupMaps = async () => {
  const rows = await Barangay.find({}, "barangayName username").lean();
  const byId = new Map();
  const byNormalizedName = new Map();

  rows.forEach((row) => {
    const id = row?._id ? String(row._id) : "";
    const barangayName = sanitizeText(row?.barangayName);
    const username = sanitizeText(row?.username);

    if (id && barangayName) {
      byId.set(id, barangayName);
    }

    if (barangayName) {
      byNormalizedName.set(normalizeBarangayKey(barangayName), barangayName);
    }

    if (username && barangayName) {
      byNormalizedName.set(normalizeBarangayKey(username), barangayName);
    }
  });

  return { byId, byNormalizedName };
};

const resolvePlaceBarangayName = (place, barangayMaps) => {
  const rawName = sanitizeText(place?.barangayName);
  if (rawName) return rawName;

  const placeBarangayId = place?.barangayId ? String(place.barangayId) : "";
  if (placeBarangayId && barangayMaps?.byId?.has(placeBarangayId)) {
    return barangayMaps.byId.get(placeBarangayId) || "";
  }

  const fallbackName = sanitizeText(place?.barangay || place?.username);
  if (
    fallbackName &&
    barangayMaps?.byNormalizedName?.has(normalizeBarangayKey(fallbackName))
  ) {
    return (
      barangayMaps.byNormalizedName.get(normalizeBarangayKey(fallbackName)) || ""
    );
  }

  return rawName;
};

const attachResolvedBarangayMeta = (place, barangayMaps) => {
  const resolvedBarangayName = resolvePlaceBarangayName(place, barangayMaps);
  return {
    ...place,
    barangayName: resolvedBarangayName || "",
  };
};

const ensurePlaceBarangayMeta = async (place, req) => {
  if (!place) return place;

  const existingBarangayName = sanitizeText(place.barangayName);
  if (existingBarangayName) {
    return place;
  }

  const barangayMaps = await buildBarangayLookupMaps();
  const resolvedBarangayName =
    resolvePlaceBarangayName(place, barangayMaps) ||
    sanitizeText(req.session?.barangayName || req.session?.username || req.session?.name);

  if (resolvedBarangayName) {
    place.barangayName = resolvedBarangayName;
  }

  if (!place.barangayId) {
    const fallbackBarangayId = toObjectIdOrNull(req.session?.userId);
    if (fallbackBarangayId) {
      place.barangayId = fallbackBarangayId;
    }
  }

  return place;
};

const getBarangayBoundsData = (entry) => {
  if (!entry) return null;

  if (entry.type === "FeatureCollection") return entry;
  if (entry.type === "Feature") return entry;

  if (Array.isArray(entry.features)) {
    return {
      type: "FeatureCollection",
      features: entry.features,
    };
  }

  if (entry.geometry) {
    return {
      type: "Feature",
      properties: entry.properties || {},
      geometry: entry.geometry,
    };
  }

  return null;
};

const getBarangayBoundsLabel = (entry) => {
  return sanitizeText(
    entry?.barangayName ||
      entry?.name ||
      entry?.properties?.barangayName ||
      entry?.properties?.name ||
      entry?.properties?.NAME ||
      entry?.properties?.adm4_en ||
      entry?.properties?.barangay ||
      entry?.features?.[0]?.properties?.barangayName ||
      entry?.features?.[0]?.properties?.name ||
      entry?.features?.[0]?.properties?.NAME ||
      entry?.features?.[0]?.properties?.adm4_en ||
      entry?.features?.[0]?.properties?.barangay
  );
};

const extractPolygonRings = (geometry) => {
  if (!geometry) return [];

  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates) ? [geometry.coordinates] : [];
  }

  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  return [];
};

const isPointOnSegment = (point, start, end) => {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);

  if (Math.abs(cross) > 1e-10) return false;

  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-10;
};

const isPointInRing = (point, ring = []) => {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];

    if (!Array.isArray(current) || !Array.isArray(previous)) continue;
    if (isPointOnSegment(point, current, previous)) return true;

    const xi = Number(current[0]);
    const yi = Number(current[1]);
    const xj = Number(previous[0]);
    const yj = Number(previous[1]);

    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] <
        ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
};

const isPointInsideBarangayGeometry = (lng, lat, geometry) => {
  const polygons = extractPolygonRings(geometry);
  const point = [lng, lat];

  return polygons.some((polygon) => {
    const outerRing = polygon?.[0];
    if (!Array.isArray(outerRing) || !outerRing.length) return false;
    if (!isPointInRing(point, outerRing)) return false;

    const holes = polygon.slice(1);
    return !holes.some((hole) => isPointInRing(point, hole));
  });
};

const findMatchingBarangayBounds = async (barangayName) => {
  const normalizedTarget = normalizeBarangayKey(barangayName);
  if (!normalizedTarget) return null;

  const db = mongoose.connection.db;
  if (!db) return null;

  const rows = await db.collection("barangaycollections").find({}).limit(100).toArray();

  return (
    rows.find((entry) => {
      const label = getBarangayBoundsLabel(entry);
      return normalizeBarangayKey(label) === normalizedTarget;
    }) || null
  );
};

const ensureBarangayPlacementWithinBounds = async (
  req,
  latitude,
  longitude,
  fallbackBarangayName = ""
) => {
  if (safeLower(req.session?.role) !== "barangay") {
    return null;
  }

  const barangayName =
    sanitizeText(fallbackBarangayName) ||
    getSessionBarangayCandidates(req)[0] ||
    "";

  if (!barangayName) {
    return "Unable to determine your barangay boundary for this evacuation area.";
  }

  const boundsEntry = await findMatchingBarangayBounds(barangayName);
  if (!boundsEntry) {
    return `No saved map boundary was found for ${barangayName}.`;
  }

  const geoData = getBarangayBoundsData(boundsEntry);
  const geometry =
    geoData?.type === "FeatureCollection"
      ? geoData.features?.[0]?.geometry || null
      : geoData?.type === "Feature"
      ? geoData.geometry
      : geoData;

  if (!geometry) {
    return `The saved map boundary for ${barangayName} is incomplete.`;
  }

  if (!isPointInsideBarangayGeometry(Number(longitude), Number(latitude), geometry)) {
    return `Barangay accounts can only place evacuation areas inside the ${barangayName} boundary.`;
  }

  return null;
};

// -----------------------------
// NOTIFICATION HELPERS
// -----------------------------
const getNotificationDayKey = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const getActorMeta = (req) => {
  return {
    actorRole: safeLower(req.session?.role),
    actorUser: req.session?.userId || null,
    actorName: sanitizeText(req.session?.username || req.session?.name || "System"),
  };
};

const getEvacRecipientLink = (recipientRole) => {
  if (recipientRole === "barangay") return "/barangay/evacuation-centers";
  if (recipientRole === "admin") return "/evacuation";
  return "/drrmo/evacuation-centers";
};

const getEvacRecipientsForActor = (req, place) => {
  const actorRole = safeLower(req.session?.role);
  const recipients = [];

  if (actorRole === "barangay") {
    recipients.push({ role: "drrmo" });
    recipients.push({ role: "admin" });
    return recipients;
  }

  if (actorRole === "drrmo") {
    recipients.push({ role: "admin" });

    if (place?.barangayId || place?.barangayName) {
      recipients.push({ role: "barangay" });
    }

    return recipients;
  }

  if (actorRole === "admin") {
    recipients.push({ role: "drrmo" });

    if (place?.barangayId || place?.barangayName) {
      recipients.push({ role: "barangay" });
    }

    return recipients;
  }

  recipients.push({ role: "drrmo" });
  recipients.push({ role: "admin" });

  return recipients;
};

const buildEvacNotificationPayload = ({
  eventType,
  place,
  previousStatus = "",
  customMessage = "",
}) => {
  const summary = buildOccupancySummary(place);
  const barangayName = place?.barangayName || "a barangay";
  const placeName = place?.name || "an evacuation place";
  const status = place?.capacityStatus || summary.capacityStatus || "available";
  const oldStatus = previousStatus || "";

  if (eventType === "created") {
    return {
      type: "evac_place_created",
      priority: "normal",
      title: "New evacuation place added",
      message: `${placeName} was added as an evacuation place for ${barangayName}.`,
      alertReason: "created",
    };
  }

  if (eventType === "updated") {
    return {
      type: "evac_place_updated",
      priority: "normal",
      title: "Evacuation place updated",
      message:
        customMessage ||
        `${placeName} in ${barangayName} was updated. Current occupancy is ${summary.currentOccupants}/${summary.capacityIndividual}.`,
      alertReason: "updated",
    };
  }

  if (eventType === "status") {
    return {
      type: "evac_place_status_updated",
      priority: status === "full" ? "critical" : status === "limited" ? "high" : "normal",
      title: "Evacuation status updated",
      message: `${placeName} in ${barangayName} changed status from ${
        oldStatus || "unknown"
      } to ${status}.`,
      alertReason: "status_updated",
    };
  }

  if (eventType === "occupancy") {
    return {
      type: "evac_occupancy_updated",
      priority:
        status === "full"
          ? "critical"
          : summary.occupancyPercent >= LIMITED_OCCUPANCY_PERCENT
            ? "high"
            : "normal",
      title: "Evacuation occupancy updated",
      message: `${placeName} in ${barangayName} is now at ${summary.currentOccupants}/${summary.capacityIndividual} occupants (${summary.occupancyPercent}%).`,
      alertReason: "occupancy_updated",
    };
  }

  if (eventType === "visibility") {
    return {
      type: "evac_landing_visibility_updated",
      priority: "normal",
      title: "Evacuation landing visibility updated",
      message: `${placeName} in ${barangayName} is now ${
        place?.showOnLanding ? "shown" : "hidden"
      } on the landing page.`,
      alertReason: "visibility_updated",
    };
  }

  if (eventType === "archived") {
    return {
      type: "evac_place_archived",
      priority: "high",
      title: "Evacuation place archived",
      message: `${placeName} in ${barangayName} was archived.`,
      alertReason: "archived",
    };
  }

  if (eventType === "full") {
    return {
      type: "evac_place_full",
      priority: "critical",
      title: "Evacuation place is full",
      message: `${placeName} in ${barangayName} is now full at ${summary.currentOccupants}/${summary.capacityIndividual} occupants.`,
      alertReason: "full",
    };
  }

  if (eventType === "limited") {
    return {
      type: "evac_place_limited",
      priority: "high",
      title: "Evacuation place is limited",
      message: `${placeName} in ${barangayName} reached limited capacity at ${summary.currentOccupants}/${summary.capacityIndividual} occupants (${summary.occupancyPercent}%).`,
      alertReason: "limited",
    };
  }

  if (eventType === "high_occupancy") {
    return {
      type: "evac_place_high_occupancy",
      priority: "high",
      title: "Evacuation place reached limited threshold",
      message: `${placeName} in ${barangayName} is at ${summary.occupancyPercent}% occupancy and needs close monitoring.`,
      alertReason: "high_occupancy",
    };
  }

  return {
    type: "evac_place_activity",
    priority: "normal",
    title: "Evacuation place activity",
    message: `${placeName} in ${barangayName} had an evacuation management update.`,
    alertReason: "activity",
  };
};

const createEvacNotificationForRecipientOnce = async ({
  req,
  place,
  recipientRole,
  eventType,
  previousStatus = "",
  customMessage = "",
  metadata = {},
}) => {
  try {
    if (!place?._id || !recipientRole) return null;

    const { actorRole, actorUser, actorName } = getActorMeta(req);
    const dayKey = getNotificationDayKey();

    const payload = buildEvacNotificationPayload({
      eventType,
      place,
      previousStatus,
      customMessage,
    });

    const existing = await Notification.findOne({
      recipientRole,
      module: "evacuation",
      type: payload.type,
      referenceId: place._id,
      "metadata.dayKey": dayKey,
    }).lean();

    if (existing) return existing;

    const recipientData = {
      recipientRole,
    };

    if (recipientRole === "barangay") {
      recipientData.recipientUser = toObjectIdOrNull(place.barangayId);
      recipientData.recipientUserModel = "Barangay";
      recipientData.recipientBarangay = toObjectIdOrNull(place.barangayId);
      recipientData.recipientBarangayName = place.barangayName || "";
    }

    return await createNotification({
      ...recipientData,

      senderUser: actorUser,
      senderRole: actorRole || "",
      senderName: actorName,

      module: "evacuation",
      type: payload.type,
      priority: payload.priority,

      title: payload.title,
      message: payload.message,
      link: getEvacRecipientLink(recipientRole),

      referenceId: place._id,
      referenceModel: "EvacPlace",
      metadata: {
        dayKey,
        actorRole,
        actorName,
        alertReason: payload.alertReason,
        previousStatus: previousStatus || "",
        placeId: place._id,
        placeName: place.name || "",
        barangayId: place.barangayId || null,
        barangayName: place.barangayName || "",
        capacityStatus: place.capacityStatus || "",
        currentOccupants: Number(place.currentOccupants || 0),
        capacityIndividual: Number(place.capacityIndividual || 0),
        currentFamilies: Number(place.currentFamilies || 0),
        capacityFamily: Number(place.capacityFamily || 0),
        occupiedBeds: Number(place.occupiedBeds || 0),
        bedCapacity: Number(place.bedCapacity || 0),
        occupancyPercent: buildOccupancySummary(place).occupancyPercent,
        ...metadata,
      },
    });
  } catch (err) {
    console.error("Create Evac Notification For Recipient Error:", err);
    return null;
  }
};

const notifyEvacEvent = async ({
  req,
  place,
  eventType,
  previousStatus = "",
  customMessage = "",
  metadata = {},
}) => {
  try {
    if (!place?._id) return;

    const recipients = getEvacRecipientsForActor(req, place);

    await Promise.all(
      recipients.map((recipient) =>
        createEvacNotificationForRecipientOnce({
          req,
          place,
          recipientRole: recipient.role,
          eventType,
          previousStatus,
          customMessage,
          metadata,
        })
      )
    );
  } catch (err) {
    console.error("Notify Evac Event Error:", err);
  }
};

const notifyEvacCapacityRisk = async (req, place, previousStatus = "") => {
  try {
    if (!place?._id || place.isArchived) return;

    const summary = buildOccupancySummary(place);
    const currentStatus = place.capacityStatus || summary.capacityStatus;
    const oldStatus = safeLower(previousStatus);

    if (currentStatus === "full") {
      await notifyEvacEvent({
        req,
        place,
        eventType: "full",
        previousStatus: oldStatus,
      });

      return;
    }

    if (currentStatus === "limited" && oldStatus !== "limited") {
      await notifyEvacEvent({
        req,
        place,
        eventType: "limited",
        previousStatus: oldStatus,
      });
    }

    if (summary.occupancyPercent >= LIMITED_OCCUPANCY_PERCENT && currentStatus !== "full") {
      await notifyEvacEvent({
        req,
        place,
        eventType: "high_occupancy",
        previousStatus: oldStatus,
      });
    }
  } catch (err) {
    console.error("Notify Evac Capacity Risk Error:", err);
  }
};

// -----------------------------
// ROLE / FILTER HELPERS
// -----------------------------
const isBarangayOwnerOfPlace = (req, place) => {
  if (!place) return false;
  if (req.session?.role !== "barangay") return true;

  const userId = req.session?.userId;
  const candidates = getSessionBarangayCandidates(req);

  const idMatch =
    userId &&
    mongoose.Types.ObjectId.isValid(String(userId)) &&
    String(place.barangayId) === String(userId);

  const nameMatch = candidates.some((candidate) => {
    const exact = safeLower(place.barangayName) === safeLower(candidate);

    const normalized =
      normalizeBarangayKey(place.barangayName) === normalizeBarangayKey(candidate);

    return exact || normalized;
  });

  return Boolean(idMatch || nameMatch);
};

const buildRoleAwarePlaceFilter = (req, options = {}) => {
  const role = req.session?.role;
  const userId = req.session?.userId;
  const barangayCandidates = getSessionBarangayCandidates(req);
  const includeArchived = options.includeArchived === true;
  const archivedOnly = options.archivedOnly === true;
  const filter = includeArchived
    ? archivedOnly
      ? { isArchived: true }
      : {}
    : { isArchived: false };

  if (role === "barangay") {
    const ownConditions = [];

    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
      ownConditions.push({ barangayId: userId });
    }

    barangayCandidates.forEach((candidate) => {
      if (!candidate) return;

      ownConditions.push({ barangayName: candidate });

      const looseRegex = buildBarangayLooseRegex(candidate);
      if (looseRegex) {
        ownConditions.push({ barangayName: looseRegex });
      }
    });

    if (ownConditions.length > 0) {
      filter.$or = ownConditions;
    }
  }

  return filter;
};

const buildRoleAwareHistoryFilter = (req) => {
  const role = req.session?.role;
  const userId = req.session?.userId;
  const barangayCandidates = getSessionBarangayCandidates(req);

  const filter = {};

  if (role === "barangay") {
    const ownConditions = [];

    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
      ownConditions.push({ barangayId: userId });
    }

    barangayCandidates.forEach((candidate) => {
      if (!candidate) return;

      ownConditions.push({ barangayName: candidate });

      const looseRegex = buildBarangayLooseRegex(candidate);
      if (looseRegex) {
        ownConditions.push({ barangayName: looseRegex });
      }
    });

    if (ownConditions.length > 0) {
      filter.$or = ownConditions;
    }
  }

  return filter;
};

const applyPlaceQueryFilters = (baseFilter, req) => {
  const role = req.session?.role;

  const selectedBarangayId = sanitizeText(req.query?.barangayId);
  const selectedBarangayName = sanitizeText(req.query?.barangayName);
  const status = safeLower(req.query?.status);
  const search = sanitizeText(req.query?.search);

  const filter = { ...baseFilter };

  if (role !== "barangay") {
    if (selectedBarangayId && mongoose.Types.ObjectId.isValid(selectedBarangayId)) {
      filter.barangayId = selectedBarangayId;
    } else if (
      selectedBarangayName &&
      safeLower(selectedBarangayName) !== "all barangays"
    ) {
      filter.barangayName = selectedBarangayName;
    }
  }

  if (["available", "limited", "full"].includes(status)) {
    filter.capacityStatus = status;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");

    const searchConditions = [
      { name: regex },
      { location: regex },
      { barangayName: regex },
      { remarks: regex },
    ];

    if (filter.$or && Array.isArray(filter.$or)) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: filter.$or });
      filter.$and.push({ $or: searchConditions });
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  return filter;
};

const applyHistoryQueryFilters = (baseFilter, req) => {
  const role = req.session?.role;

  const selectedBarangayId = sanitizeText(req.query?.barangayId);
  const selectedBarangayName = sanitizeText(req.query?.barangayName);
  const search = sanitizeText(req.query?.search);

  const filter = { ...baseFilter };

  if (role !== "barangay") {
    if (selectedBarangayId && mongoose.Types.ObjectId.isValid(selectedBarangayId)) {
      filter.barangayId = selectedBarangayId;
    } else if (
      selectedBarangayName &&
      safeLower(selectedBarangayName) !== "all barangays"
    ) {
      filter.barangayName = selectedBarangayName;
    }
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");

    const searchConditions = [
      { placeName: regex },
      { details: regex },
      { barangayName: regex },
      { action: regex },
      { performedBy: regex },
    ];

    if (filter.$or && Array.isArray(filter.$or)) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: filter.$or });
      filter.$and.push({ $or: searchConditions });
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  return filter;
};

const sanitizePublicPlace = (place) => {
  if (!place) return null;

  const summary = buildOccupancySummary(place);

  return {
    _id: place._id,
    name: place.name || "",
    location: place.location || "",
    barangayId: place.barangayId || "",
    barangayName: place.barangayName || "",
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    capacityStatus: summary.capacityStatus || "available",

    capacityIndividual: summary.capacityIndividual,
    currentOccupants: summary.currentOccupants,
    remainingIndividualCapacity: summary.remainingIndividualCapacity,
    occupancyPercent: summary.occupancyPercent,

    showOnLanding: place.showOnLanding !== false,
    updatedAt: place.updatedAt || null,
  };
};

const formatDateValue = formatPdfDateValue;

const formatLabel = (value) => {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return "-";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// -----------------------------
// CREATE PLACE
// -----------------------------
const createPlace = async (req, res) => {
  try {
    const {
      name,
      location,
      barangayId,
      barangayName,
      barangay,
      latitude,
      longitude,
      capacityIndividual,
      currentOccupants,
      capacityFamily,
      currentFamilies,
      bedCapacity,
      occupiedBeds,
      floorArea,
      femaleCR,
      maleCR,
      commonCR,
      potableWater,
      nonPotableWater,
      isPermanent,
      isCovidFacility,
      remarks,
      showOnLanding,
    } = req.body;

    const sessionBarangayCandidates = getSessionBarangayCandidates(req);

    const finalBarangayId =
      barangayId || (req.session?.role === "barangay" ? req.session.userId : null);

    const finalBarangayName =
      sanitizeText(barangayName) ||
      sanitizeText(barangay) ||
      (req.session?.role === "barangay" ? sessionBarangayCandidates[0] || "" : "");

    if (
      !sanitizeText(name) ||
      !sanitizeText(location) ||
      !finalBarangayId ||
      !finalBarangayName ||
      latitude === undefined ||
      longitude === undefined ||
      capacityIndividual === undefined ||
      capacityFamily === undefined
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: name, location, barangayId, barangayName, latitude, longitude, capacityIndividual, capacityFamily",
      });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        message: "Invalid coordinates",
      });
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({
        message: "Coordinates out of valid range",
      });
    }

    const boundsError = await ensureBarangayPlacementWithinBounds(
      req,
      latNum,
      lngNum,
      finalBarangayName
    );

    if (boundsError) {
      return res.status(403).json({ message: boundsError });
    }

    const individualCapacityNum = toNumber(capacityIndividual, 0);
    const familyCapacityNum = toNumber(capacityFamily, 0);
    const bedCapacityNum = toNumber(bedCapacity, 0);

    const currentOccupantsNum = clampNumber(
      currentOccupants,
      0,
      individualCapacityNum > 0 ? individualCapacityNum : null
    );

    const currentFamiliesNum = clampNumber(
      currentFamilies,
      0,
      familyCapacityNum > 0 ? familyCapacityNum : null
    );

    const occupiedBedsNum = clampNumber(
      occupiedBeds,
      0,
      bedCapacityNum > 0 ? bedCapacityNum : null
    );

    const newPlace = new Place({
      name: sanitizeText(name),
      location: sanitizeText(location),
      barangayId: finalBarangayId,
      barangayName: finalBarangayName,
      latitude: latNum,
      longitude: lngNum,

      capacityIndividual: individualCapacityNum,
      currentOccupants: currentOccupantsNum,

      capacityFamily: familyCapacityNum,
      currentFamilies: currentFamiliesNum,

      bedCapacity: bedCapacityNum,
      occupiedBeds: occupiedBedsNum,

      floorArea: toNumber(floorArea, 0),
      femaleCR: toBoolean(femaleCR),
      maleCR: toBoolean(maleCR),
      commonCR: toBoolean(commonCR),
      potableWater: toBoolean(potableWater),
      nonPotableWater: toBoolean(nonPotableWater),
      isPermanent: toBoolean(isPermanent),
      isCovidFacility: toBoolean(isCovidFacility),
      remarks: sanitizeText(remarks),
      showOnLanding:
        req.session?.role === "barangay" ? true : toBoolean(showOnLanding),

      capacityStatus: deriveCapacityStatus(currentOccupantsNum, individualCapacityNum),
      occupancyLastUpdatedAt: currentOccupantsNum > 0 ? new Date() : null,
      occupancyUpdatedBy:
        currentOccupantsNum > 0
          ? sanitizeText(req.session?.username || req.session?.name || "unknown")
          : "",
    });

    await newPlace.save();

    await EHistory.create({
      action: "ADD",
      placeName: newPlace.name,
      details: `Added ${newPlace.name} in ${newPlace.barangayName} with occupancy ${newPlace.currentOccupants}/${newPlace.capacityIndividual}`,
      ...buildHistoryMeta(req, newPlace, finalBarangayId, finalBarangayName),
    });

    await notifyEvacEvent({
      req,
      place: newPlace,
      eventType: "created",
    });

    await notifyEvacCapacityRisk(req, newPlace, "");

    return res.status(201).json({
      message: "Place created successfully",
      place: newPlace,
      occupancy: buildOccupancySummary(newPlace),
    });
  } catch (error) {
    console.error("Create Place Error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "An active evacuation place with the same name already exists in this barangay",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------
// GET ALL PLACES
// -----------------------------
const getPlaces = async (req, res) => {
  try {
    const archivedQuery = safeLower(req.query?.archived);
    const includeArchived =
      archivedQuery === "all" || archivedQuery === "true";
    const archivedOnly =
      archivedQuery === "only" || archivedQuery === "archived";

    const baseFilter = buildRoleAwarePlaceFilter(req, {
      includeArchived,
      archivedOnly,
    });
    const finalFilter = applyPlaceQueryFilters(baseFilter, req);
    const places = await Place.find(finalFilter).lean().sort({
      barangayName: 1,
      name: 1,
      createdAt: -1,
    });

    const barangayMaps = await buildBarangayLookupMaps();
    const resolvedPlaces = places.map((place) =>
      attachResolvedBarangayMeta(place, barangayMaps)
    );

    return res.json(resolvedPlaces);
  } catch (err) {
    console.error("Get Places Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------
// GET PUBLIC PLACES FOR LANDING PAGE
// -----------------------------
const getPublicPlaces = async (req, res) => {
  try {
    const selectedBarangayName = sanitizeText(req.query?.barangayName);
    const status = safeLower(req.query?.status);
    const search = sanitizeText(req.query?.search);

    const filter = {
      isArchived: false,
      showOnLanding: true,
    };

    if (
      selectedBarangayName &&
      safeLower(selectedBarangayName) !== "all barangays" &&
      safeLower(selectedBarangayName) !== "all"
    ) {
      filter.barangayName = selectedBarangayName;
    }

    if (["available", "limited", "full"].includes(status)) {
      filter.capacityStatus = status;
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { name: regex },
        { location: regex },
        { barangayName: regex },
      ];
    }

    const places = await Place.find(filter).sort({
      barangayName: 1,
      name: 1,
      createdAt: -1,
    });

    const publicPlaces = places
      .map(sanitizePublicPlace)
      .filter(
        (item) =>
          item &&
          item.latitude !== null &&
          item.latitude !== undefined &&
          item.longitude !== null &&
          item.longitude !== undefined
      );

    return res.json(publicPlaces);
  } catch (err) {
    console.error("Get Public Places Error:", err);
    return res.status(500).json({ message: "Failed to load public evacuation areas" });
  }
};

// -----------------------------
// GET HISTORY
// -----------------------------
const getHistory = async (req, res) => {
  try {
    const baseFilter = buildRoleAwareHistoryFilter(req);
    const finalFilter = applyHistoryQueryFilters(baseFilter, req);

    const logs = await EHistory.find(finalFilter).sort({ createdAt: -1 });
    return res.json(logs);
  } catch (err) {
    console.error("Get History Error:", err);
    return res.status(500).json({ message: "Failed to load history" });
  }
};

// -----------------------------
// EXPORT EVAC PLACES PDF
// -----------------------------
const exportPlacesPdf = async (req, res) => {
  try {
    const baseFilter = buildRoleAwarePlaceFilter(req);
    const finalFilter = applyPlaceQueryFilters(baseFilter, req);

    const places = await Place.find(finalFilter).sort({
      barangayName: 1,
      name: 1,
      createdAt: -1,
    });

    const totalPlaces = places.length;
    const availableCount = places.filter((p) => p.capacityStatus === "available").length;
    const limitedCount = places.filter((p) => p.capacityStatus === "limited").length;
    const fullCount = places.filter((p) => p.capacityStatus === "full").length;

    const totalIndividualCapacity = places.reduce(
      (sum, p) => sum + Number(p.capacityIndividual || 0),
      0
    );

    const totalCurrentOccupants = places.reduce(
      (sum, p) => sum + Number(p.currentOccupants || 0),
      0
    );

    const totalRemainingIndividualCapacity = Math.max(
      0,
      totalIndividualCapacity - totalCurrentOccupants
    );

    const overallOccupancyPercent =
      totalIndividualCapacity > 0
        ? Math.min(
            100,
            Math.round((totalCurrentOccupants / totalIndividualCapacity) * 100)
          )
        : 0;

    const totalFamilyCapacity = places.reduce(
      (sum, p) => sum + Number(p.capacityFamily || 0),
      0
    );

    const totalCurrentFamilies = places.reduce(
      (sum, p) => sum + Number(p.currentFamilies || 0),
      0
    );

    const totalBedCapacity = places.reduce(
      (sum, p) => sum + Number(p.bedCapacity || 0),
      0
    );

    const totalOccupiedBeds = places.reduce(
      (sum, p) => sum + Number(p.occupiedBeds || 0),
      0
    );

    const permanentCount = places.filter((p) => p.isPermanent).length;
    const covidFacilityCount = places.filter((p) => p.isCovidFacility).length;
    const shownOnLandingCount = places.filter((p) => p.showOnLanding).length;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="evacuation-areas-${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    const doc = createPdfDocument({
      size: "A4",
      layout: "landscape",
      margin: 30,
    });

    doc.pipe(res);

    drawPdfHeader(doc, {
      title: "Evacuation Areas Report",
      subtitle: "Current place records",
      generatedAt: new Date(),
    });

    drawPdfSectionTitle(doc, "Summary");
    drawPdfLabelValue(doc, "Total Places", String(totalPlaces));
    drawPdfLabelValue(doc, "Available", String(availableCount));
    drawPdfLabelValue(doc, "Limited", String(limitedCount));
    drawPdfLabelValue(doc, "Full", String(fullCount));
    drawPdfLabelValue(doc, "Total Individual Capacity", String(totalIndividualCapacity));
    drawPdfLabelValue(doc, "Current Occupants", String(totalCurrentOccupants));
    drawPdfLabelValue(doc, "Remaining Individual Capacity", String(totalRemainingIndividualCapacity));
    drawPdfLabelValue(doc, "Overall Occupancy", `${overallOccupancyPercent}%`);
    drawPdfLabelValue(doc, "Total Family Capacity", String(totalFamilyCapacity));
    drawPdfLabelValue(doc, "Current Families", String(totalCurrentFamilies));
    drawPdfLabelValue(doc, "Total Bed Capacity", String(totalBedCapacity));
    drawPdfLabelValue(doc, "Occupied Beds", String(totalOccupiedBeds));
    drawPdfLabelValue(doc, "Permanent Facilities", String(permanentCount));
    drawPdfLabelValue(doc, "Covid Facilities", String(covidFacilityCount));
    drawPdfLabelValue(doc, "Shown on Landing", String(shownOnLandingCount));

    drawPdfSectionTitle(doc, "Evacuation Areas");

    const columns = [
      { label: "Name", key: "name", width: 100 },
      { label: "Barangay", key: "barangayName", width: 75 },
      { label: "Location", key: "location", width: 95 },
      { label: "Status", key: "capacityStatus", width: 50 },
      { label: "Occupancy", key: "occupancy", width: 60, align: "right" },
      { label: "Occ %", key: "occupancyPercent", width: 38, align: "right" },
      { label: "Family", key: "familyOccupancy", width: 52, align: "right" },
      { label: "Beds", key: "bedOccupancy", width: 45, align: "right" },
      { label: "Lat", key: "latitude", width: 58 },
      { label: "Lng", key: "longitude", width: 58 },
      { label: "Landing", key: "showOnLanding", width: 42 },
      { label: "Updated", key: "updatedAt", width: 80 },
    ];

    if (!places.length) {
      drawPdfEmptyState(doc, "No evacuation areas available for this filter.");
    } else {
      drawPdfTable(
        doc,
        columns,
        places.map((place) => {
          const current = Number(place.currentOccupants || 0);
          const capacity = Number(place.capacityIndividual || 0);
          const percent = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

          return {
            name: sanitizeText(place.name) || "-",
            barangayName: sanitizeText(place.barangayName) || "-",
            location: sanitizeText(place.location) || "-",
            capacityStatus: formatLabel(place.capacityStatus),
            occupancy: `${current}/${capacity}`,
            occupancyPercent: `${percent}%`,
            familyOccupancy: `${Number(place.currentFamilies || 0)}/${Number(
              place.capacityFamily || 0
            )}`,
            bedOccupancy: `${Number(place.occupiedBeds || 0)}/${Number(
              place.bedCapacity || 0
            )}`,
            latitude:
              place.latitude !== undefined && place.latitude !== null
                ? Number(place.latitude).toFixed(5)
                : "-",
            longitude:
              place.longitude !== undefined && place.longitude !== null
                ? Number(place.longitude).toFixed(5)
                : "-",
            showOnLanding: place.showOnLanding ? "Yes" : "No",
            updatedAt: formatDateValue(place.updatedAt),
          };
        }),
        {
          rowHeight: 26,
          emptyMessage: "No evacuation areas available for this filter.",
        }
      );
    }

    const placesWithRemarks = places.filter((place) => sanitizeText(place.remarks));

    if (placesWithRemarks.length) {
      drawPdfSectionTitle(doc, "Remarks");

      placesWithRemarks.forEach((place, index) => {
        ensurePdfPageSpace(doc, 50);
        drawPdfParagraphBlock(
          doc,
          `${index + 1}. ${sanitizeText(place.name) || "Unnamed Area"}`,
          sanitizeText(place.remarks)
        );
      });
    }

    drawPdfFooter(doc, { generatedAt: new Date() });

    doc.end();
  } catch (err) {
    console.error("Export Places PDF Error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Failed to export evacuation areas PDF" });
    }
  }
};

// -----------------------------
// UPDATE PLACE
// -----------------------------
const updatePlace = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to update this evacuation area",
      });
    }

    const {
      name,
      location,
      barangayId,
      barangayName,
      barangay,
      latitude,
      longitude,
      capacityIndividual,
      currentOccupants,
      capacityFamily,
      currentFamilies,
      bedCapacity,
      occupiedBeds,
      floorArea,
      femaleCR,
      maleCR,
      commonCR,
      potableWater,
      nonPotableWater,
      isPermanent,
      isCovidFacility,
      remarks,
      showOnLanding,
    } = req.body;

    const finalBarangayName = sanitizeText(barangayName) || sanitizeText(barangay);

    existing.name = sanitizeText(name || existing.name);
    existing.location = sanitizeText(location || existing.location);

    if (barangayId && req.session?.role !== "barangay") {
      existing.barangayId = barangayId;
    }

    if (finalBarangayName && req.session?.role !== "barangay") {
      existing.barangayName = finalBarangayName;
    }

    if (latitude !== undefined) {
      const latNum = Number(latitude);
      if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
        return res.status(400).json({ message: "Invalid latitude" });
      }
      existing.latitude = latNum;
    }

    if (longitude !== undefined) {
      const lngNum = Number(longitude);
      if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return res.status(400).json({ message: "Invalid longitude" });
      }
      existing.longitude = lngNum;
    }

    const nextLat =
      existing.latitude === undefined || existing.latitude === null
        ? null
        : Number(existing.latitude);
    const nextLng =
      existing.longitude === undefined || existing.longitude === null
        ? null
        : Number(existing.longitude);

    if (nextLat !== null && nextLng !== null) {
      const boundsError = await ensureBarangayPlacementWithinBounds(
        req,
        nextLat,
        nextLng,
        existing.barangayName
      );

      if (boundsError) {
        return res.status(403).json({ message: boundsError });
      }
    }

    if (capacityIndividual !== undefined) {
      existing.capacityIndividual = toNumber(capacityIndividual, 0);

      if (
        Number(existing.capacityIndividual || 0) > 0 &&
        Number(existing.currentOccupants || 0) > Number(existing.capacityIndividual || 0)
      ) {
        existing.currentOccupants = Number(existing.capacityIndividual || 0);
      }
    }

    if (capacityFamily !== undefined) {
      existing.capacityFamily = toNumber(capacityFamily, 0);

      if (
        Number(existing.capacityFamily || 0) > 0 &&
        Number(existing.currentFamilies || 0) > Number(existing.capacityFamily || 0)
      ) {
        existing.currentFamilies = Number(existing.capacityFamily || 0);
      }
    }

    if (bedCapacity !== undefined) {
      existing.bedCapacity = toNumber(bedCapacity, 0);

      if (
        Number(existing.bedCapacity || 0) > 0 &&
        Number(existing.occupiedBeds || 0) > Number(existing.bedCapacity || 0)
      ) {
        existing.occupiedBeds = Number(existing.bedCapacity || 0);
      }
    }

    if (currentOccupants !== undefined) {
      const maxIndividual = Number(existing.capacityIndividual || 0);
      const newCurrentOccupants = clampNumber(
        currentOccupants,
        0,
        maxIndividual > 0 ? maxIndividual : null
      );

      existing.currentOccupants = newCurrentOccupants;
      existing.occupancyLastUpdatedAt = new Date();
      existing.occupancyUpdatedBy = sanitizeText(
        req.session?.username || req.session?.name || "unknown"
      );
    }

    if (currentFamilies !== undefined) {
      const maxFamilies = Number(existing.capacityFamily || 0);
      existing.currentFamilies = clampNumber(
        currentFamilies,
        0,
        maxFamilies > 0 ? maxFamilies : null
      );
    }

    if (occupiedBeds !== undefined) {
      const maxBeds = Number(existing.bedCapacity || 0);
      existing.occupiedBeds = clampNumber(
        occupiedBeds,
        0,
        maxBeds > 0 ? maxBeds : null
      );
    }

    if (floorArea !== undefined) {
      existing.floorArea = toNumber(floorArea, 0);
    }

    if (femaleCR !== undefined) existing.femaleCR = toBoolean(femaleCR);
    if (maleCR !== undefined) existing.maleCR = toBoolean(maleCR);
    if (commonCR !== undefined) existing.commonCR = toBoolean(commonCR);
    if (potableWater !== undefined) existing.potableWater = toBoolean(potableWater);
    if (nonPotableWater !== undefined) existing.nonPotableWater = toBoolean(nonPotableWater);
    if (isPermanent !== undefined) existing.isPermanent = toBoolean(isPermanent);
    if (isCovidFacility !== undefined) existing.isCovidFacility = toBoolean(isCovidFacility);
    if (remarks !== undefined) existing.remarks = sanitizeText(remarks);

    if (showOnLanding !== undefined && req.session?.role !== "barangay") {
      existing.showOnLanding = toBoolean(showOnLanding);
    }

    const previousStatus = existing.capacityStatus || "available";

    existing.capacityStatus = deriveCapacityStatus(
      existing.currentOccupants,
      existing.capacityIndividual
    );

    await existing.save();

    await EHistory.create({
      action: "UPDATE",
      placeName: existing.name,
      details: `Updated details for ${existing.name}. Occupancy is now ${Number(
        existing.currentOccupants || 0
      )}/${Number(existing.capacityIndividual || 0)}.`,
      ...buildHistoryMeta(req, existing),
    });

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "updated",
      previousStatus,
    });

    await notifyEvacCapacityRisk(req, existing, previousStatus);

    return res.json({
      message: "Place updated successfully",
      place: existing,
      occupancy: buildOccupancySummary(existing),
    });
  } catch (err) {
    console.error("Update Place Error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        message: "An active evacuation place with the same name already exists in this barangay",
      });
    }

    return res.status(500).json({ message: "Update failed" });
  }
};

// -----------------------------
// UPDATE CAPACITY STATUS
// Manual status update is kept for compatibility.
// But if there are occupants/capacity data, backend still protects the correct status.
// -----------------------------
const updateCapacityStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { capacityStatus } = req.body;

    if (!["available", "limited", "full"].includes(capacityStatus)) {
      return res.status(400).json({ message: "Invalid capacity status" });
    }

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to update this evacuation area",
      });
    }

    const hasOccupancyData =
      Number(existing.currentOccupants || 0) > 0 ||
      Number(existing.capacityIndividual || 0) > 0;

    const previousStatus = existing.capacityStatus || "available";

    if (hasOccupancyData) {
      existing.capacityStatus = deriveCapacityStatus(
        existing.currentOccupants,
        existing.capacityIndividual
      );
    } else {
      existing.capacityStatus = capacityStatus;
    }

    await existing.save();

    await EHistory.create({
      action: "STATUS_UPDATE",
      placeName: existing.name,
      details: `Status changed to ${existing.capacityStatus}`,
      ...buildHistoryMeta(req, existing),
    });

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "status",
      previousStatus,
    });

    await notifyEvacCapacityRisk(req, existing, previousStatus);

    return res.json(existing);
  } catch (err) {
    console.error("Update Capacity Status Error:", err);
    return res.status(500).json({ message: "Update failed" });
  }
};

// -----------------------------
// UPDATE OCCUPANCY
// Supports exact set and plus/minus movement.
// Example:
// { currentOccupants: 10 }
// { occupantDelta: 1 }
// { occupantDelta: -1 }
// -----------------------------
const updateOccupancy = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      currentOccupants,
      occupantDelta,
      currentFamilies,
      familyDelta,
      occupiedBeds,
      bedDelta,
      remarks,
    } = req.body || {};

    const existing = await Place.findById(id);

    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to update this evacuation area's occupancy",
      });
    }

    const maxIndividuals = Number(existing.capacityIndividual || 0);
    const maxFamilies = Number(existing.capacityFamily || 0);
    const maxBeds = Number(existing.bedCapacity || 0);

    let nextOccupants = Number(existing.currentOccupants || 0);

    if (occupantDelta !== undefined) {
      nextOccupants += toNumber(occupantDelta, 0);
    } else if (currentOccupants !== undefined) {
      nextOccupants = toNumber(currentOccupants, 0);
    }

    if (nextOccupants < 0) {
      return res.status(400).json({
        message: "Current occupants cannot be less than 0",
      });
    }

    if (maxIndividuals > 0 && nextOccupants > maxIndividuals) {
      return res.status(400).json({
        message: `Occupancy cannot exceed individual capacity of ${maxIndividuals}`,
      });
    }

    let nextFamilies = Number(existing.currentFamilies || 0);

    if (familyDelta !== undefined) {
      nextFamilies += toNumber(familyDelta, 0);
    } else if (currentFamilies !== undefined) {
      nextFamilies = toNumber(currentFamilies, 0);
    }

    if (nextFamilies < 0) {
      return res.status(400).json({
        message: "Current families cannot be less than 0",
      });
    }

    if (maxFamilies > 0 && nextFamilies > maxFamilies) {
      return res.status(400).json({
        message: `Family occupancy cannot exceed family capacity of ${maxFamilies}`,
      });
    }

    let nextBeds = Number(existing.occupiedBeds || 0);

    if (bedDelta !== undefined) {
      nextBeds += toNumber(bedDelta, 0);
    } else if (occupiedBeds !== undefined) {
      nextBeds = toNumber(occupiedBeds, 0);
    }

    if (nextBeds < 0) {
      return res.status(400).json({
        message: "Occupied beds cannot be less than 0",
      });
    }

    if (maxBeds > 0 && nextBeds > maxBeds) {
      return res.status(400).json({
        message: `Occupied beds cannot exceed bed capacity of ${maxBeds}`,
      });
    }

    const previousOccupants = Number(existing.currentOccupants || 0);
    const previousFamilies = Number(existing.currentFamilies || 0);
    const previousBeds = Number(existing.occupiedBeds || 0);
    const previousStatus = existing.capacityStatus || "available";

    await ensurePlaceBarangayMeta(existing, req);

    existing.currentOccupants = nextOccupants;
    existing.currentFamilies = nextFamilies;
    existing.occupiedBeds = nextBeds;
    existing.capacityStatus = deriveCapacityStatus(
      existing.currentOccupants,
      existing.capacityIndividual
    );
    existing.occupancyLastUpdatedAt = new Date();
    existing.occupancyUpdatedBy = sanitizeText(
      req.session?.username || req.session?.name || "unknown"
    );

    await existing.save();

    const summary = buildOccupancySummary(existing);

    await EHistory.create({
  action: "UPDATE",
  placeName: existing.name,
  details:
    `Occupancy updated for ${existing.name}: ` +
    `individuals ${previousOccupants}/${maxIndividuals || 0} to ` +
    `${existing.currentOccupants}/${maxIndividuals || 0}; ` +
    `families ${previousFamilies}/${maxFamilies || 0} to ` +
    `${existing.currentFamilies}/${maxFamilies || 0}; ` +
    `beds ${previousBeds}/${maxBeds || 0} to ` +
    `${existing.occupiedBeds}/${maxBeds || 0}. ` +
    `Status: ${previousStatus} to ${existing.capacityStatus}.` +
    `${sanitizeText(remarks) ? ` Remarks: ${sanitizeText(remarks)}` : ""}`,
  ...buildHistoryMeta(req, existing),
});

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "occupancy",
      previousStatus,
    });

    await notifyEvacCapacityRisk(req, existing, previousStatus);

    return res.json({
      message: "Occupancy updated successfully",
      place: existing,
      occupancy: summary,
    });
  } catch (err) {
    console.error("Update Occupancy Error:", err);
    return res.status(500).json({ message: "Failed to update occupancy" });
  }
};

// -----------------------------
// UPDATE LANDING VISIBILITY
// -----------------------------
const updateLandingVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { showOnLanding } = req.body || {};

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    existing.showOnLanding = toBoolean(showOnLanding);
    await existing.save();

    await EHistory.create({
      action: "UPDATE",
      placeName: existing.name,
      details: `Landing page visibility changed to ${
        existing.showOnLanding ? "shown" : "hidden"
      }`,
      ...buildHistoryMeta(req, existing),
    });

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "visibility",
    });

    return res.json({
      message: "Landing visibility updated successfully",
      place: existing,
    });
  } catch (err) {
    console.error("Update Landing Visibility Error:", err);
    return res.status(500).json({ message: "Failed to update landing visibility" });
  }
};

// -----------------------------
// DELETE / ARCHIVE PLACE
// -----------------------------
const deletePlace = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to archive this evacuation area",
      });
    }

    existing.isArchived = true;
    existing.archivedAt = new Date();
    await existing.save();

    await EHistory.create({
      action: "DELETE",
      placeName: existing.name,
      details: "Place archived",
      ...buildHistoryMeta(req, existing),
    });

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "archived",
    });

    return res.json({ message: "Place archived successfully" });
  } catch (err) {
    console.error("Delete Place Error:", err);
    return res.status(500).json({ message: "Delete failed" });
  }
};

const permanentDeletePlace = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to delete this evacuation area",
      });
    }

    if (!existing.isArchived) {
      return res.status(400).json({
        message: "Only archived evacuation areas can be permanently deleted",
      });
    }

    const placeName = existing.name;

    await existing.deleteOne();

    await EHistory.create({
      action: "DELETE",
      placeName,
      details: "Archived place permanently deleted",
      ...buildHistoryMeta(req, existing),
    });

    return res.json({
      message: "Archived evacuation area deleted successfully",
    });
  } catch (err) {
    console.error("Permanent Delete Place Error:", err);
    return res.status(500).json({ message: "Permanent delete failed" });
  }
};

// -----------------------------
// ANALYTICS SUMMARY
// -----------------------------
const getAnalyticsSummary = async (req, res) => {
  try {
    const baseFilter = buildRoleAwarePlaceFilter(req);
    const finalFilter = applyPlaceQueryFilters(baseFilter, req);

    const places = await Place.find(finalFilter).lean();
    const barangayMaps = await buildBarangayLookupMaps();
    const resolvedPlaces = places.map((place) =>
      attachResolvedBarangayMeta(place, barangayMaps)
    );

    const totalPlaces = resolvedPlaces.length;

    const statusCounts = resolvedPlaces.reduce(
      (acc, p) => {
        const status = p.capacityStatus || "available";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { available: 0, limited: 0, full: 0 }
    );

    const totalIndividualCapacity = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.capacityIndividual || 0),
      0
    );

    const totalCurrentOccupants = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.currentOccupants || 0),
      0
    );

    const totalRemainingIndividualCapacity = Math.max(
      0,
      totalIndividualCapacity - totalCurrentOccupants
    );

    const overallOccupancyPercent =
      totalIndividualCapacity > 0
        ? Math.min(
            100,
            Math.round((totalCurrentOccupants / totalIndividualCapacity) * 100)
          )
        : 0;

    const totalFamilyCapacity = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.capacityFamily || 0),
      0
    );

    const totalCurrentFamilies = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.currentFamilies || 0),
      0
    );

    const totalBedCapacity = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.bedCapacity || 0),
      0
    );

    const totalOccupiedBeds = resolvedPlaces.reduce(
      (sum, p) => sum + Number(p.occupiedBeds || 0),
      0
    );

    const permanentCount = resolvedPlaces.filter((p) => p.isPermanent).length;
    const covidFacilities = resolvedPlaces.filter((p) => p.isCovidFacility).length;

    const barangayBreakdownMap = resolvedPlaces.reduce((acc, place) => {
      const key = sanitizeText(place.barangayName) || "Unassigned";

      if (!acc[key]) {
        acc[key] = {
          barangayName: key,
          totalPlaces: 0,
          available: 0,
          limited: 0,
          full: 0,
          totalIndividualCapacity: 0,
          currentOccupants: 0,
          remainingIndividualCapacity: 0,
          occupancyPercent: 0,
          totalFamilyCapacity: 0,
          currentFamilies: 0,
          totalBedCapacity: 0,
          occupiedBeds: 0,
        };
      }

      const status = place.capacityStatus || "available";

      acc[key].totalPlaces += 1;
      acc[key][status] = (acc[key][status] || 0) + 1;
      acc[key].totalIndividualCapacity += Number(place.capacityIndividual || 0);
      acc[key].currentOccupants += Number(place.currentOccupants || 0);
      acc[key].totalFamilyCapacity += Number(place.capacityFamily || 0);
      acc[key].currentFamilies += Number(place.currentFamilies || 0);
      acc[key].totalBedCapacity += Number(place.bedCapacity || 0);
      acc[key].occupiedBeds += Number(place.occupiedBeds || 0);

      return acc;
    }, {});

    const barangayBreakdown = Object.values(barangayBreakdownMap)
      .map((item) => {
        const remaining = Math.max(
          0,
          Number(item.totalIndividualCapacity || 0) -
            Number(item.currentOccupants || 0)
        );

        const percent =
          Number(item.totalIndividualCapacity || 0) > 0
            ? Math.min(
                100,
                Math.round(
                  (Number(item.currentOccupants || 0) /
                    Number(item.totalIndividualCapacity || 0)) *
                    100
                )
              )
            : 0;

        return {
          ...item,
          remainingIndividualCapacity: remaining,
          occupancyPercent: percent,
        };
      })
      .sort((a, b) => a.barangayName.localeCompare(b.barangayName));

    const criticalBarangays = barangayBreakdown.filter(
      (item) =>
        item.full > 0 ||
        item.available === 0 ||
        item.occupancyPercent >= LIMITED_OCCUPANCY_PERCENT
    );

    return res.json({
      totalPlaces,
      statusCounts,

      totalIndividualCapacity,
      totalCurrentOccupants,
      totalRemainingIndividualCapacity,
      overallOccupancyPercent,

      totalFamilyCapacity,
      totalCurrentFamilies,

      totalBedCapacity,
      totalOccupiedBeds,

      permanentCount,
      covidFacilities,
      barangayBreakdown,
      criticalBarangays,
    });
  } catch (error) {
    console.error("Get Analytics Summary Error:", error);
    return res.status(500).json({ message: "Failed to fetch analytics" });
  }
};

// -----------------------------
// UNARCHIVE PLACE
// -----------------------------
const unarchivePlace = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Place.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (!isBarangayOwnerOfPlace(req, existing)) {
      return res.status(403).json({
        message: "You are not allowed to unarchive this evacuation area",
      });
    }

    existing.isArchived = false;
    existing.archivedAt = null;
    await existing.save();

    await EHistory.create({
      action: "UPDATE",
      placeName: existing.name,
      details: "Place unarchived",
      ...buildHistoryMeta(req, existing),
    });

    await notifyEvacEvent({
      req,
      place: existing,
      eventType: "updated",
      customMessage: `${existing.name} in ${existing.barangayName} was unarchived.`,
    });

    return res.json({
      message: "Place unarchived successfully",
      place: existing,
    });
  } catch (err) {
    console.error("Unarchive Place Error:", err);
    return res.status(500).json({ message: "Unarchive failed" });
  }
};

module.exports = {
  createPlace,
  getPlaces,
  getPublicPlaces,
  getHistory,
  exportPlacesPdf,
  updatePlace,
  updateCapacityStatus,
  updateOccupancy,
  updateLandingVisibility,
  deletePlace,
  permanentDeletePlace,
  unarchivePlace,
  getAnalyticsSummary,
};
