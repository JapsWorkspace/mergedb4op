export const JAEN_BOUNDS = {
  north: 15.42,
  south: 15.28,
  east: 121.05,
  west: 120.85,
};

export function isPointInsideJaen(lat, lng) {
  return (
    lat >= JAEN_BOUNDS.south &&
    lat <= JAEN_BOUNDS.north &&
    lng >= JAEN_BOUNDS.west &&
    lng <= JAEN_BOUNDS.east
  );
}

export function routeIsInsideJaen(route) {
  return route.geometry.coordinates.every(
    ([lng, lat]) => isPointInsideJaen(lat, lng)
  );
}
