export const DEFAULT_CAMERA_ID = "cam_1";

export const DAILY_HISTORY_LIMIT = 6;
export const PUBLIC_HISTORY_LIMIT = 5;
export const INTERNAL_HISTORY_LIMIT = 31;

export const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatLevel(value, fallback = "—") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return `${number.toFixed(2)} m`;
}

export function formatDateTime(value, fallback = "No sync yet") {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(value, fallback = "Unknown day") {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

export function getStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DANGER") return "danger";
  if (normalized === "WARNING") return "warning";
  return "safe";
}

export function getStatusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DANGER") return "Danger";
  if (normalized === "WARNING") return "Warning";
  return "Safe";
}

export function getStatusNarrative(status) {
  const normalized = String(status || "NO DATA").toUpperCase();

  if (normalized === "DANGER") {
    return {
      title: "Danger water level detected",
      meaning:
        "The water level has reached or exceeded the danger threshold. Flooding may already be occurring or may occur soon in low-lying areas.",
      action:
        "Avoid flooded roads, prepare for possible evacuation, secure important documents, and follow official MDRRMO announcements.",
    };
  }

  if (normalized === "WARNING") {
    return {
      title: "Water level is rising",
      meaning:
        "The water level has reached the warning threshold. Conditions may worsen if rain continues or upstream water increases.",
      action:
        "Stay alert, monitor updates, charge phones, prepare emergency supplies, and avoid unnecessary travel near waterways.",
    };
  }

  if (normalized === "SAFE") {
    return {
      title: "Water level is currently safe",
      meaning: "The latest water-level reading is below the warning threshold.",
      action:
        "Continue monitoring updates, especially during heavy rain or typhoon conditions.",
    };
  }

  return {
    title: "No current water-level data",
    meaning:
      "The system has not received a recent water-level reading from this camera.",
    action:
      "Wait for the monitoring system to update or check the camera connection.",
  };
}

export function normalizeCameraIds(items, fallback = [DEFAULT_CAMERA_ID]) {
  const unique = Array.from(
    new Set(
      (items || [])
        .map((item) => String(item?.camera_id || "").trim())
        .filter(Boolean)
    )
  );

  return unique.length ? unique : fallback;
}

export function normalizeLatestReading(reading, cameraId = DEFAULT_CAMERA_ID) {
  if (!reading || !Object.keys(reading).length) return null;

  return {
    ...reading,
    camera_id: reading.camera_id || cameraId,
    water_level: toNumber(reading.water_level, 0),
    warning_level: toNumber(reading.warning_level, 8),
    danger_level: toNumber(reading.danger_level, 10),
    status: String(reading.status || "SAFE").toUpperCase(),
    timestamp: reading.timestamp || reading.createdAt || null,
  };
}

function makeHistoryId(item, index) {
  return (
    item?._id ||
    item?.id ||
    `${item?.camera_id || DEFAULT_CAMERA_ID}-${item?.timestamp || item?.date || index}-${index}`
  );
}

export function normalizeDailyHistory(items) {
  return Array.isArray(items)
    ? items.map((item, index) => ({
        id: makeHistoryId(item, index),
        mode: "daily",
        camera_id: item?.camera_id || DEFAULT_CAMERA_ID,
        date: item?.date || "",
        label: item?.date || item?.label || "Unknown day",
        dateRange: item?.date || "",
        averageLevel: toNumber(item?.average_level, 0),
        highestLevel: toNumber(item?.maximum_level, 0),
        lowestLevel: toNumber(item?.minimum_level, 0),
        latestLevel: toNumber(item?.latest_level, 0),
        latestStatus: String(item?.latest_status || "SAFE").toUpperCase(),
        latestTimestamp: item?.latest_timestamp || item?.updatedAt || null,
        readingCount: toNumber(item?.reading_count, 0),
        safeCount: toNumber(item?.safe_count, 0),
        warningCount: toNumber(item?.warning_count, 0),
        dangerCount: toNumber(item?.danger_count, 0),
        totalLevel: toNumber(item?.total_level, 0),
        daysCount: 1,
      }))
    : [];
}

export function normalizeAnalyticsHistory(items) {
  return Array.isArray(items)
    ? items.map((item, index) => ({
        id: makeHistoryId(item, index),
        mode: String(item?.period || "monthly"),
        camera_id: item?.camera_id || DEFAULT_CAMERA_ID,
        date: item?.label || "",
        label: item?.label || "Unknown period",
        dateRange:
          item?.start_date && item?.end_date
            ? `${item.start_date} to ${item.end_date}`
            : item?.start_date || item?.end_date || "",
        averageLevel: toNumber(item?.average_level, 0),
        highestLevel: toNumber(item?.maximum_level, 0),
        lowestLevel: toNumber(item?.minimum_level, 0),
        latestLevel: toNumber(item?.latest_level, 0),
        latestStatus: String(item?.latest_status || "SAFE").toUpperCase(),
        latestTimestamp: item?.latest_timestamp || null,
        readingCount: toNumber(item?.reading_count, 0),
        safeCount: toNumber(item?.safe_count, 0),
        warningCount: toNumber(item?.warning_count, 0),
        dangerCount: toNumber(item?.danger_count, 0),
        totalLevel: toNumber(item?.total_level, 0),
        daysCount: toNumber(item?.days_count, 0),
      }))
    : [];
}

export function getRecordSummary(record) {
  const total = toNumber(record?.readingCount, 0);
  const safe = toNumber(record?.safeCount, 0);
  const warning = toNumber(record?.warningCount, 0);
  const danger = toNumber(record?.dangerCount, 0);

  if (total <= 0) {
    return "No classification data available.";
  }

  if (danger > 0) {
    return `${danger} out of ${total} readings reached danger level.`;
  }

  if (warning > 0) {
    return `${warning} out of ${total} readings reached warning level.`;
  }

  if (safe > 0) {
    return `All ${total} readings were within safe level.`;
  }

  return "No classification data available.";
}

export function getRecordExplanation(record) {
  const total = toNumber(record?.readingCount, 0);
  const safe = toNumber(record?.safeCount, 0);
  const warning = toNumber(record?.warningCount, 0);
  const danger = toNumber(record?.dangerCount, 0);
  const latestStatus = String(record?.latestStatus || "SAFE").toUpperCase();

  if (total <= 0) {
    return "No classification data available for this period.";
  }

  if (danger > 0) {
    return `${danger} out of ${total} readings reached danger level. Citizens should review this period carefully.`;
  }

  if (warning > 0) {
    return `${warning} out of ${total} readings reached warning level. Water rise was observed during this period.`;
  }

  if (safe > 0 || latestStatus === "SAFE") {
    return `All ${total} readings were within safe level during this period.`;
  }

  return "No classification data available for this period.";
}

export function getRecordLabel(record, period = "daily") {
  if (period === "daily") return record?.date || record?.label || "Unknown day";
  return record?.label || "Unknown period";
}

export function getRecordRange(record, period = "daily") {
  if (period === "daily") {
    return record?.date || record?.label || "Unknown day";
  }

  return record?.dateRange || "—";
}

function getPhilippineDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value: partValue }) => [type, partValue])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function groupRawHistoryByDay(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const grouped = new Map();

  items.forEach((item, index) => {
    const timestamp = item?.timestamp || item?.createdAt || null;
    const dateKey = getPhilippineDate(timestamp);

    if (!dateKey) return;

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        id: `${dateKey}-${index}`,
        mode: "daily",
        camera_id: item?.camera_id || DEFAULT_CAMERA_ID,
        date: dateKey,
        label: dateKey,
        dateRange: dateKey,
        averageLevel: 0,
        highestLevel: toNumber(item?.water_level, 0),
        lowestLevel: toNumber(item?.water_level, 0),
        latestLevel: toNumber(item?.water_level, 0),
        latestStatus: String(item?.status || "SAFE").toUpperCase(),
        latestTimestamp: timestamp,
        readingCount: 0,
        safeCount: 0,
        warningCount: 0,
        dangerCount: 0,
        totalLevel: 0,
        daysCount: 1,
      });
    }

    const group = grouped.get(dateKey);
    const level = toNumber(item?.water_level, 0);
    const normalizedStatus = String(item?.status || "SAFE").toUpperCase();
    const itemTimestamp = timestamp ? new Date(timestamp).getTime() : 0;
    const latestGroupTimestamp = group.latestTimestamp
      ? new Date(group.latestTimestamp).getTime()
      : 0;

    group.readingCount += 1;
    group.totalLevel += level;
    group.highestLevel = Math.max(group.highestLevel, level);
    group.lowestLevel = Math.min(group.lowestLevel, level);

    if (normalizedStatus === "DANGER") {
      group.dangerCount += 1;
    } else if (normalizedStatus === "WARNING") {
      group.warningCount += 1;
    } else {
      group.safeCount += 1;
    }

    if (itemTimestamp >= latestGroupTimestamp) {
      group.latestLevel = level;
      group.latestStatus = normalizedStatus;
      group.latestTimestamp = timestamp;
    }
  });

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      averageLevel:
        group.readingCount > 0
          ? Number((group.totalLevel / group.readingCount).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
