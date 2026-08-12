const InventoryItem = require("../models/InventoryItem");
const EvacPlace = require("../models/EvacPlace");
const Notification = require("../models/Notification");
const createNotification = require("./createNotification");

const LOW_STOCK_THRESHOLD = 20;
const EXPIRING_SOON_DAYS = 30;
const LIMITED_OCCUPANCY_PERCENT = 75;

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeRole = (value) => normalizeString(value).toLowerCase();

const getDayKey = () => new Date().toISOString().slice(0, 10);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const diffDaysFromToday = (date) => {
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const getRoleLink = (role, module) => {
  if (module === "evacuation") {
    if (role === "admin") return "/evacuation";
    if (role === "barangay") return "/barangay/evacuation-centers";
    return "/drrmo/evacuation-centers";
  }

  if (role === "admin") return "/admin/inventory";
  if (role === "accountant") return "/accountant/inventory";
  return "/drrmo/inventory";
};

const createRiskNotificationOnce = async ({
  recipientRole,
  recipientUser = null,
  recipientUserModel = null,
  recipientBarangay = null,
  recipientBarangayName = "",
  module,
  type,
  priority,
  title,
  message,
  link,
  referenceId,
  referenceModel,
  metadata = {},
}) => {
  if (!recipientRole || !module || !type || !referenceId) return null;

  const dayKey = getDayKey();
  const query = {
    recipientRole,
    module,
    type,
    referenceId,
    "metadata.dayKey": dayKey,
  };

  if (recipientUser) {
    query.recipientUser = recipientUser;
  }

  const existing = await Notification.findOne(query).lean();
  if (existing) return existing;

  return createNotification({
    recipientRole,
    recipientUser,
    recipientUserModel,
    recipientBarangay,
    recipientBarangayName,
    senderRole: "system",
    senderName: "System",
    module,
    type,
    priority,
    title,
    message,
    link,
    referenceId,
    referenceModel,
    metadata: {
      dayKey,
      generatedBy: "risk_notification_scanner",
      ...metadata,
    },
  });
};

const getInventoryRiskPayloads = (item) => {
  const payloads = [];
  const quantity = Number(item.quantity || 0);
  const name = item.name || "Inventory item";
  const unit = item.unit || item.category || "unit(s)";

  if (quantity <= 0) {
    payloads.push({
      type: "inventory_out_of_stock",
      priority: "critical",
      title: "Inventory item is out of stock",
      message: `${name} is out of stock and needs immediate restocking.`,
      alertReason: "out_of_stock",
    });
  } else if (quantity < LOW_STOCK_THRESHOLD) {
    payloads.push({
      type: "inventory_low_stock",
      priority: "high",
      title: "Inventory item is low on stock",
      message: `${name} has ${quantity} ${unit} remaining.`,
      alertReason: "low_stock",
    });
  }

  if (item.type === "goods" && item.expirationDate) {
    const daysUntilExpiry = diffDaysFromToday(item.expirationDate);

    if (daysUntilExpiry < 0) {
      payloads.push({
        type: "inventory_expired",
        priority: "critical",
        title: "Inventory item has expired",
        message: `${name} expired on ${new Date(item.expirationDate).toLocaleDateString()}.`,
        alertReason: "expired",
        daysUntilExpiry,
      });
    } else if (daysUntilExpiry <= EXPIRING_SOON_DAYS) {
      payloads.push({
        type: "inventory_expiring_soon",
        priority: "high",
        title: "Inventory item is expiring soon",
        message: `${name} expires in ${daysUntilExpiry} day(s).`,
        alertReason: "expiring_soon",
        daysUntilExpiry,
      });
    }
  }

  return payloads;
};

const syncInventoryRiskNotifications = async (role) => {
  if (!["admin", "drrmo"].includes(role)) return;

  const today = startOfToday();
  const soon = addDays(today, EXPIRING_SOON_DAYS);

  const items = await InventoryItem.find({
    isArchive: { $ne: true },
    type: { $in: ["goods", "appliance"] },
    $or: [
      { quantity: { $lte: LOW_STOCK_THRESHOLD - 1 } },
      {
        type: "goods",
        expirationDate: {
          $exists: true,
          $ne: null,
          $lte: soon,
        },
      },
    ],
  })
    .select("name type category quantity unit expirationDate")
    .lean();

  await Promise.all(
    items.flatMap((item) =>
      getInventoryRiskPayloads(item).map((payload) =>
        createRiskNotificationOnce({
          recipientRole: role,
          module: "inventory",
          type: payload.type,
          priority: payload.priority,
          title: payload.title,
          message: payload.message,
          link: getRoleLink(role, "inventory"),
          referenceId: item._id,
          referenceModel: "InventoryItem",
          metadata: {
            alertReason: payload.alertReason,
            itemId: item._id,
            itemName: item.name || "",
            itemType: item.type || "",
            category: item.category || "",
            quantity: Number(item.quantity || 0),
            unit: item.unit || "",
            expirationDate: item.expirationDate || null,
            daysUntilExpiry:
              typeof payload.daysUntilExpiry === "number"
                ? payload.daysUntilExpiry
                : null,
          },
        })
      )
    )
  );
};

const deriveCapacityStatus = (place) => {
  const capacity = Number(place.capacityIndividual || 0);
  const current = Number(place.currentOccupants || 0);
  const occupancyPercent =
    capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  if (capacity > 0 && current >= capacity) return "full";
  if (capacity > 0 && occupancyPercent >= LIMITED_OCCUPANCY_PERCENT) return "limited";
  return place.capacityStatus || "available";
};

const getEvacRiskPayload = (place) => {
  const status = deriveCapacityStatus(place);
  const capacity = Number(place.capacityIndividual || 0);
  const current = Number(place.currentOccupants || 0);
  const occupancyPercent =
    capacity > 0 ? Math.round((current / capacity) * 100) : 0;
  const placeName = place.name || "Evacuation place";
  const barangayName = place.barangayName || "a barangay";

  if (status === "full") {
    return {
      type: "evac_place_full",
      priority: "critical",
      title: "Evacuation place is full",
      message: `${placeName} in ${barangayName} is full at ${current}/${capacity} occupants.`,
      alertReason: "full",
      status,
      occupancyPercent,
    };
  }

  if (status === "limited") {
    return {
      type: "evac_place_limited",
      priority: "high",
      title: "Evacuation place is limited",
      message: `${placeName} in ${barangayName} reached limited capacity at ${current}/${capacity} occupants (${occupancyPercent}%).`,
      alertReason: "limited",
      status,
      occupancyPercent,
    };
  }

  return null;
};

const syncEvacRiskNotifications = async (session) => {
  const role = normalizeRole(session?.role);
  if (!["admin", "drrmo", "barangay"].includes(role)) return;

  const places = await EvacPlace.find({
    isArchived: { $ne: true },
    $or: [
      { capacityStatus: { $in: ["limited", "full"] } },
      {
        capacityIndividual: { $gt: 0 },
        currentOccupants: { $gt: 0 },
      },
    ],
  })
    .select(
      "name barangayId barangayName capacityStatus currentOccupants capacityIndividual currentFamilies capacityFamily occupiedBeds bedCapacity"
    )
    .lean();

  const barangayName = normalizeString(session?.barangayName || session?.username);
  const relevantPlaces =
    role === "barangay"
      ? places.filter(
          (place) =>
            normalizeString(place.barangayName).toLowerCase() ===
            barangayName.toLowerCase()
        )
      : places;

  await Promise.all(
    relevantPlaces
      .map((place) => ({ place, payload: getEvacRiskPayload(place) }))
      .filter(({ payload }) => Boolean(payload))
      .map(({ place, payload }) =>
        createRiskNotificationOnce({
          recipientRole: role,
          recipientUser: role === "barangay" ? session.userId : null,
          recipientUserModel: role === "barangay" ? "Barangay" : null,
          recipientBarangay: role === "barangay" ? session.userId : null,
          recipientBarangayName: role === "barangay" ? place.barangayName || "" : "",
          module: "evacuation",
          type: payload.type,
          priority: payload.priority,
          title: payload.title,
          message: payload.message,
          link: getRoleLink(role, "evacuation"),
          referenceId: place._id,
          referenceModel: "EvacPlace",
          metadata: {
            alertReason: payload.alertReason,
            placeId: place._id,
            placeName: place.name || "",
            barangayId: place.barangayId || null,
            barangayName: place.barangayName || "",
            capacityStatus: payload.status,
            currentOccupants: Number(place.currentOccupants || 0),
            capacityIndividual: Number(place.capacityIndividual || 0),
            currentFamilies: Number(place.currentFamilies || 0),
            capacityFamily: Number(place.capacityFamily || 0),
            occupiedBeds: Number(place.occupiedBeds || 0),
            bedCapacity: Number(place.bedCapacity || 0),
            occupancyPercent: payload.occupancyPercent,
          },
        })
      )
  );
};

const syncRiskNotificationsForSession = async (session, moduleFilter = "") => {
  const role = normalizeRole(session?.role);
  const moduleName = normalizeString(moduleFilter).toLowerCase();

  if (!role || !session?.isLoggedIn) return;

  const shouldSyncInventory = !moduleName || moduleName === "all" || moduleName === "inventory";
  const shouldSyncEvacuation = !moduleName || moduleName === "all" || moduleName === "evacuation";

  const syncs = [];

  if (shouldSyncInventory) {
    syncs.push(syncInventoryRiskNotifications(role));
  }

  if (shouldSyncEvacuation) {
    syncs.push(syncEvacRiskNotifications(session));
  }

  await Promise.all(syncs);
};

module.exports = {
  syncRiskNotificationsForSession,
};
