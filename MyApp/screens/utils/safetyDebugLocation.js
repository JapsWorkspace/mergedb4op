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

function hashString(value) {
  return String(value || "debug-user").split("").reduce((hash, char) => {
    const nextHash = (hash << 5) - hash + char.charCodeAt(0);
    return nextHash | 0;
  }, 0);
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
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
  const seed = Math.abs(hashString(userId));
  const point = JAEN_DEBUG_POINTS[seed % JAEN_DEBUG_POINTS.length] || JAEN_DEBUG_POINTS[0];
  const offsetSeed = Math.abs(hashString(`${userId}:offset`));
  const latOffset = (((offsetSeed % 7) - 3) * 0.00012);
  const lngOffset = ((((Math.floor(offsetSeed / 7) % 7) - 3)) * 0.00012);
  const candidate = {
    latitude: roundCoordinate(point.latitude + latOffset),
    longitude: roundCoordinate(point.longitude + lngOffset),
  };

  if (isInsideJaenBoundary(candidate.latitude, candidate.longitude)) {
    return candidate;
  }

  const fallback = JAEN_DEBUG_POINTS.find((item) =>
    isInsideJaenBoundary(item.latitude, item.longitude)
  );

  return fallback || JAEN_DEBUG_POINTS[0];
}
