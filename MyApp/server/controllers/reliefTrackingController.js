const ReliefRequest = require("../models/ReliefRequest");
const ReliefRelease = require("../models/ReliefRelease");
const Barangay = require("../models/Barangay");
const User = require("../models/User");

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const computePrioritySnapshotFromRows = (rows = []) => {
  const totalAffected = rows.reduce(
    (sum, row) =>
      sum +
      toNumber(row.male) +
      toNumber(row.female) +
      toNumber(row.lgbtq) +
      toNumber(row.pwd) +
      toNumber(row.pregnant) +
      toNumber(row.senior),
    0
  );

  const vulnerableCount = rows.reduce(
    (sum, row) =>
      sum + toNumber(row.pwd) + toNumber(row.pregnant) + toNumber(row.senior),
    0
  );

  const requestedFoodPacks = rows.reduce(
    (sum, row) => sum + toNumber(row.requestedFoodPacks),
    0
  );

  const priorityScore =
    vulnerableCount * 3 + totalAffected + requestedFoodPacks * 0.2;

  return {
    totalAffected,
    vulnerableCount,
    priorityScore,
  };
};

const buildFulfillmentFromReleases = (releases = []) => {
  const totalReleases = releases.length;
  const releasedFoodPacks = releases.reduce(
    (sum, release) => sum + toNumber(release.foodPacksReleased),
    0
  );
  const receivedReleases = releases.filter(
    (release) => release.releaseStatus === "received"
  ).length;
  const pendingReleases = releases.filter(
    (release) => release.releaseStatus === "released"
  ).length;

  const lastRelease = releases
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  return {
    totalReleases,
    releasedFoodPacks,
    receivedReleases,
    pendingReleases,
    lastReleaseAt: lastRelease?.releasedAt || lastRelease?.createdAt || null,
  };
};

const deriveCurrentStage = (request, releases = []) => {
  if (!request) return "preparation";

  if (request.status === "pending") return "pending_review";
  if (request.status === "rejected") return "rejected";
  if (request.status === "approved") return "approved_waiting_release";
  if (request.status === "partially_released") return "partially_released";
  if (request.status === "released") return "released_waiting_receipt";
  if (request.status === "received") return "completed";
  if (request.status === "cancelled") return "completed";

  const hasReleased = releases.some(
    (release) => release.releaseStatus === "released"
  );
  const hasReceived = releases.some(
    (release) => release.releaseStatus === "received"
  );

  if (hasReleased && hasReceived) return "partially_released";
  if (hasReleased) return "released_waiting_receipt";
  if (hasReceived) return "completed";

  return "pending_review";
};

async function getReliefTracking(req, res) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const user = await User.findById(req.session.userId);
    const isDRRMO = user?.role === "drrmo";
    const isAdmin = user?.role === "admin";

    /* ================= DRRMO / ADMIN VIEW ================= */
    if (isDRRMO || isAdmin) {
      const requests = await ReliefRequest.find({
        isArchived: false,
      }).sort({ createdAt: -1 });

      const requestIds = requests.map((request) => request._id);

      const releases = await ReliefRelease.find({
        reliefRequestId: { $in: requestIds },
        isArchived: false,
      }).sort({ createdAt: -1 });

      const releasesByRequestId = new Map();

      for (const release of releases) {
        const key = String(release.reliefRequestId);
        if (!releasesByRequestId.has(key)) {
          releasesByRequestId.set(key, []);
        }
        releasesByRequestId.get(key).push(release);
      }

      const rows = requests.map((request) => {
        const relatedReleases = releasesByRequestId.get(String(request._id)) || [];
        const fulfillment = buildFulfillmentFromReleases(relatedReleases);
        const stage = deriveCurrentStage(request, relatedReleases);
        const prioritySnapshot =
          request.prioritySnapshot?.priorityScore ||
          request.prioritySnapshot?.totalAffected ||
          request.prioritySnapshot?.vulnerableCount
            ? request.prioritySnapshot
            : computePrioritySnapshotFromRows(request.rows || []);

        return {
          ...request.toObject(),
          fulfillment,
          currentStage: stage,
          prioritySnapshot,
          releases: relatedReleases,
        };
      });

      return res.json({
        rows,
        releases,
      });
    }

    /* ================= BARANGAY VIEW ================= */
    const barangay = await Barangay.findById(req.session.userId);
    if (!barangay) {
      return res.status(404).json({ message: "Barangay not found" });
    }

    const requests = await ReliefRequest.find({
      barangayId: barangay._id,
      isArchived: false,
    }).sort({ createdAt: -1 });

    const requestIds = requests.map((request) => request._id);

    const releases = await ReliefRelease.find({
      reliefRequestId: { $in: requestIds },
      isArchived: false,
    }).sort({ createdAt: -1 });

    const releasesByRequestId = new Map();

    for (const release of releases) {
      const key = String(release.reliefRequestId);
      if (!releasesByRequestId.has(key)) {
        releasesByRequestId.set(key, []);
      }
      releasesByRequestId.get(key).push(release);
    }

    const rows = requests.map((request) => {
      const relatedReleases = releasesByRequestId.get(String(request._id)) || [];
      const fulfillment = buildFulfillmentFromReleases(relatedReleases);
      const stage = deriveCurrentStage(request, relatedReleases);

      return {
        ...request.toObject(),
        fulfillment,
        currentStage: stage,
        releases: relatedReleases,
      };
    });

    return res.json({
      rows,
      releases,
    });
  } catch (err) {
    console.error("Get Relief Tracking Error:", err);
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getReliefTracking };