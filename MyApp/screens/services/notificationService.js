import AsyncStorage from "@react-native-async-storage/async-storage";

const CLUSTER_STORAGE_KEY = "shownClusterNotifications";
const CLUSTER_COOLDOWN_MS = 30 * 60 * 1000;

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "");
}

export function getClusterThresholdLevel(total) {
  const count = Number(total || 0);
  if (count >= 10) return "10";
  if (count >= 8) return "8";
  if (count >= 5) return "5";
  return null;
}

export function getBarangayGroupHash(barangays = []) {
  return barangays
    .map((barangay) => normalizeKeyPart(barangay?.label || barangay?.name || barangay))
    .filter(Boolean)
    .sort()
    .join("|");
}

export function createClusterNotificationKey({ incidentType, barangays, thresholdLevel }) {
  return `${normalizeKeyPart(incidentType)}|${getBarangayGroupHash(barangays)}|${thresholdLevel}`;
}

async function readShownClusterNotifications() {
  try {
    const raw = await AsyncStorage.getItem(CLUSTER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.log("[cluster] storage read failed:", err?.message);
    return {};
  }
}

async function writeShownClusterNotifications(nextValue) {
  try {
    await AsyncStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(nextValue));
  } catch (err) {
    console.log("[cluster] storage write failed:", err?.message);
  }
}

export async function shouldNotifyCluster(cluster) {
  const thresholdLevel =
    cluster?.thresholdLevel || getClusterThresholdLevel(cluster?.total);
  const key = createClusterNotificationKey({
    incidentType: cluster?.category || cluster?.type,
    barangays: cluster?.barangays || [],
    thresholdLevel,
  });
  const shown = await readShownClusterNotifications();
  const existing = shown[key];
  const lastNotifiedAt = Number(existing?.lastNotifiedAt || 0);
  const withinCooldown =
    lastNotifiedAt > 0 && Date.now() - lastNotifiedAt < CLUSTER_COOLDOWN_MS;
  const alreadyShown = Boolean(existing);
  const shouldNotify = Boolean(key && thresholdLevel && !alreadyShown);

  console.log("[cluster] detected:", {
    type: cluster?.category || cluster?.type,
    total: cluster?.total,
    thresholdLevel,
    barangays: (cluster?.barangays || []).map((item) => item?.label || item),
  });
  console.log("[cluster] key:", key);
  console.log("[cluster] alreadyShown:", alreadyShown);
  console.log("[cluster] shouldNotify:", shouldNotify);

  return {
    key,
    thresholdLevel,
    alreadyShown,
    withinCooldown,
    shouldNotify,
  };
}

export async function markClusterNotificationShown(key) {
  if (!key) return;

  const shown = await readShownClusterNotifications();
  const next = {
    ...shown,
    [key]: {
      lastNotifiedAt: Date.now(),
    },
  };

  await writeShownClusterNotifications(next);
  console.log("[cluster] savedKey:", key);
}
