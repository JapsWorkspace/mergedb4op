export function normalizeBarangayName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[._-]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\bbrgy\b/g, "barangay")
    .trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getObjectField(value, keys = []) {
  if (!value || typeof value !== "object") return "";

  for (const key of keys) {
    const nextValue = value[key];
    if (nextValue !== undefined && nextValue !== null && String(nextValue).trim()) {
      return nextValue;
    }
  }

  return "";
}

function extractBarangayFromAddress(value) {
  const objectValue = getObjectField(value, ["barangay", "barangayName", "brgy"]);
  if (objectValue) return objectValue;
  if (!value || typeof value === "object") return "";

  const text = String(value || "").trim();
  const match = text.match(/\b(?:brgy\.?|barangay)\s+([^,]+)/i);
  return match ? match[1].trim() : "";
}

function extractDistrictFromAddress(value) {
  const objectValue = getObjectField(value, ["district"]);
  if (objectValue) return objectValue;
  if (!value || typeof value === "object") return "";

  const text = String(value || "").trim();
  const match = text.match(/\bdistrict\s+([^,]+)/i);
  return match ? match[1].trim() : "";
}

function getUserBarangay(user) {
  return (
    user?.barangay ||
    user?.address?.barangay ||
    user?.profile?.barangay ||
    extractBarangayFromAddress(user?.address) ||
    extractBarangayFromAddress(user?.streetAddress) ||
    extractBarangayFromAddress(user?.street) ||
    ""
  );
}

function getUserDistrict(user) {
  return (
    user?.district ||
    user?.address?.district ||
    user?.profile?.district ||
    extractDistrictFromAddress(user?.address) ||
    extractDistrictFromAddress(user?.streetAddress) ||
    ""
  );
}

function getUserCoordinate(user) {
  const latitude = Number(user?.location?.lat ?? user?.latitude ?? user?.lat);
  const longitude = Number(user?.location?.lng ?? user?.longitude ?? user?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

function getCenterBarangay(center) {
  return (
    center?.barangay ||
    center?.barangayName ||
    center?.address?.barangay ||
    extractBarangayFromAddress(center?.address) ||
    extractBarangayFromAddress(center?.location) ||
    ""
  );
}

function getCenterDistrict(center) {
  return (
    center?.district ||
    center?.address?.district ||
    extractDistrictFromAddress(center?.address) ||
    extractDistrictFromAddress(center?.location) ||
    ""
  );
}

function getCenterCoordinate(center) {
  const latitude = Number(center?.latitude ?? center?.lat ?? center?.location?.lat);
  const longitude = Number(center?.longitude ?? center?.lng ?? center?.location?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceMeters(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(pointB.latitude - pointA.latitude);
  const dLon = toRadians(pointB.longitude - pointA.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(pointA.latitude)) *
      Math.cos(toRadians(pointB.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAvailabilityScore(center) {
  const status = normalizeText(center?.capacityStatus || center?.status || center?.availability);
  if (status === "available") return 0;
  if (status === "limited") return 1;
  if (status === "full") return 3;
  return 2;
}

export function rankEvacuationCentersForUser(user, evacCenters) {
  const centers = Array.isArray(evacCenters) ? evacCenters : [];
  const userBarangay = normalizeBarangayName(getUserBarangay(user));
  const userDistrict = normalizeText(getUserDistrict(user));
  const userCoordinate = getUserCoordinate(user);

  console.log("[evac recommendation user barangay]", userBarangay || "");

  let sameBarangayCount = 0;
  let sameDistrictCount = 0;
  let alternativesCount = 0;

  const ranked = centers.map((center, index) => {
    const centerBarangay = normalizeBarangayName(getCenterBarangay(center));
    const centerDistrict = normalizeText(getCenterDistrict(center));
    const centerCoordinate = getCenterCoordinate(center);
    const distanceFromUserMeters = distanceMeters(userCoordinate, centerCoordinate);
    const sameBarangay = Boolean(userBarangay && centerBarangay && userBarangay === centerBarangay);
    const sameDistrict = Boolean(
      !sameBarangay && userDistrict && centerDistrict && userDistrict === centerDistrict
    );

    let recommendationRank = 4;
    let recommendationLabel = "Other Evacuation Center";
    let recommendationBadge = "Other Evacuation Center";
    let recommendationScopeLabel = "";
    let reason = "This evacuation center remains available as an alternative option.";

    if (sameBarangay) {
      sameBarangayCount += 1;
      recommendationRank = 1;
      recommendationLabel = "Recommended for your barangay";
      recommendationBadge = "Recommended";
      recommendationScopeLabel = "Your Barangay";
      reason = "This evacuation center is located in your registered barangay.";
    } else if (sameDistrict) {
      sameDistrictCount += 1;
      recommendationRank = 2;
      recommendationLabel = "Nearby Alternative";
      recommendationBadge = "Nearby Alternative";
      reason = "This evacuation center is in your registered district.";
    } else if (Number.isFinite(distanceFromUserMeters)) {
      alternativesCount += 1;
      recommendationRank = userBarangay || userDistrict ? 3 : 2;
      recommendationLabel = "Nearby Alternative";
      recommendationBadge = "Nearby Alternative";
      reason = "This evacuation center is sorted by distance from your shared location.";
    } else {
      alternativesCount += 1;
    }

    return {
      ...center,
      isRecommended: sameBarangay,
      recommendationRank,
      recommendationLabel,
      recommendationBadge,
      recommendationScopeLabel,
      reason,
      distanceFromUserMeters,
      _recommendationSortIndex: index,
    };
  });

  ranked.sort((a, b) => {
    const rankDiff = Number(a.recommendationRank || 99) - Number(b.recommendationRank || 99);
    if (rankDiff !== 0) return rankDiff;

    const availabilityDiff = getAvailabilityScore(a) - getAvailabilityScore(b);
    if (availabilityDiff !== 0) return availabilityDiff;

    const distanceDiff =
      Number(a.distanceFromUserMeters ?? Number.POSITIVE_INFINITY) -
      Number(b.distanceFromUserMeters ?? Number.POSITIVE_INFINITY);
    if (Number.isFinite(distanceDiff) && distanceDiff !== 0) return distanceDiff;

    return Number(a._recommendationSortIndex || 0) - Number(b._recommendationSortIndex || 0);
  });

  console.log("[evac recommended same barangay count]", sameBarangayCount);
  console.log("[evac same district count]", sameDistrictCount);
  console.log("[evac alternatives count]", alternativesCount);
  console.log("[evac ranking complete]", { total: ranked.length });

  return ranked.map(({ _recommendationSortIndex, ...center }) => center);
}

