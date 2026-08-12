export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getFloodRadius(level) {
  if (level === "critical") return 150;
  if (level === "high") return 80;
  if (level === "medium") return 40;
  return 0;
}

export function buildFloodZone(incident) {
  return {
    lat: incident.latitude,
    lng: incident.longitude,
    radius: getFloodRadius(incident.level),
    level: incident.level,
  };
}

export function findRouteFloodIntersection(routeCoords, floodZone) {
  if (!floodZone || floodZone.radius <= 0) return null;

  for (let i = 0; i < routeCoords.length; i++) {
    const p = routeCoords[i];
    const dist = getDistanceMeters(
      p.latitude,
      p.longitude,
      floodZone.lat,
      floodZone.lng
    );

    if (dist < floodZone.radius) {
      return i;
    }
  }

  return null;
}

export function findCriticalFloodHit(routeCoords, incidents) {
  if (!incidents || incidents.length === 0) return null;

  for (let i = 0; i < incidents.length; i++) {
    const incident = incidents[i];
    if (incident.level !== "critical") continue;

    const zone = buildFloodZone(incident);
    const hitIndex = findRouteFloodIntersection(routeCoords, zone);

    if (hitIndex !== null) {
      return { index: hitIndex, incident };
    }
  }

  return null;
}

export function pickDetourWaypoint(routeCoords, hitIndex, stepsBack = 6) {
  if (hitIndex === null || hitIndex <= 0) return null;

  for (let i = hitIndex - stepsBack; i >= 0; i--) {
    const p = routeCoords[i];
    return { lat: p.latitude, lng: p.longitude };
  }

  return null;
}