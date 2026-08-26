import { isPointInsideJaen } from "./jaenBounds";
import jaenGeoJSON from "../data/jaen.json";

const JAEN_DEBUG_POINTS = [
  { latitude: 15.3383, longitude: 120.9141 },
  { latitude: 15.3278, longitude: 120.9196 },
  { latitude: 15.3489, longitude: 120.9272 },
  { latitude: 15.3612, longitude: 120.9064 },
  { latitude: 15.3136, longitude: 120.9325 },
  { latitude: 15.3774, longitude: 120.9188 },
  { latitude: 15.3349, longitude: 120.9481 },
  { latitude: 15.3921, longitude: 120.9367 },
  { latitude: 15.3228, longitude: 120.8994 },
  { latitude: 15.3679, longitude: 120.9576 },
  { latitude: 15.3197, longitude: 120.9653 },
  { latitude: 15.4092, longitude: 120.8918 },
];

const JAEN_DEBUG_BOUNDS = {
  north: 15.42,
  south: 15.28,
  east: 121.05,
  west: 120.85,
};

const DEBUG_BOUNDARY_MARGIN = 0.0015;
const DEBUG_LOCATION_ATTEMPTS = 96;

function hashString(value) {
  return String(value || "debug-user").split("").reduce((hash, char) => {
    const nextHash = (hash << 5) - hash + char.charCodeAt(0);
    return nextHash | 0;
  }, 0);
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function hashToUnitInterval(value) {
  return (hashString(value) >>> 0) / 4294967295;
}

function pointInRing(latitude, longitude, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(latitude, longitude, polygon) {
  const outerRing = polygon?.[0];
  if (!Array.isArray(outerRing) || !pointInRing(latitude, longitude, outerRing)) {
    return false;
  }

  return !polygon.slice(1).some((hole) => pointInRing(latitude, longitude, hole));
}

function isInsideJaenBoundary(latitude, longitude) {
  if (!isPointInsideJaen(latitude, longitude)) return false;

  return (jaenGeoJSON?.features || []).some((feature) => {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") {
      return pointInPolygon(latitude, longitude, geometry.coordinates);
    }
    if (geometry?.type === "MultiPolygon") {
      return geometry.coordinates.some((polygon) =>
        pointInPolygon(latitude, longitude, polygon)
      );
    }
    return false;
  });
}

export function generateSeededJaenDebugLocation(userId) {
  const normalizedUserId = String(userId || "debug-user");
  const latitudeSpan =
    JAEN_DEBUG_BOUNDS.north - JAEN_DEBUG_BOUNDS.south - DEBUG_BOUNDARY_MARGIN * 2;
  const longitudeSpan =
    JAEN_DEBUG_BOUNDS.east - JAEN_DEBUG_BOUNDS.west - DEBUG_BOUNDARY_MARGIN * 2;

  // Rejection sampling distributes stable per-user locations throughout the
  // actual Jaen polygon instead of repeatedly choosing from a few fixed spots.
  for (let attempt = 0; attempt < DEBUG_LOCATION_ATTEMPTS; attempt += 1) {
    const latitude =
      JAEN_DEBUG_BOUNDS.south +
      DEBUG_BOUNDARY_MARGIN +
      hashToUnitInterval(`${normalizedUserId}:latitude:${attempt}`) * latitudeSpan;
    const longitude =
      JAEN_DEBUG_BOUNDS.west +
      DEBUG_BOUNDARY_MARGIN +
      hashToUnitInterval(`${normalizedUserId}:longitude:${attempt}`) * longitudeSpan;
    const candidate = {
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
    };

    if (isInsideJaenBoundary(candidate.latitude, candidate.longitude)) {
      return candidate;
    }
  }

  const fallbackStart = (hashString(normalizedUserId) >>> 0) % JAEN_DEBUG_POINTS.length;
  const fallback = [...JAEN_DEBUG_POINTS.slice(fallbackStart), ...JAEN_DEBUG_POINTS.slice(0, fallbackStart)].find((item) =>
    isInsideJaenBoundary(item.latitude, item.longitude)
  );

  return fallback || JAEN_DEBUG_POINTS[0];
}
