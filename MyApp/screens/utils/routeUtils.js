import { getDistance } from "./geo";

export function routeIntersectsHazard(route, hazards = []) {
  if (!hazards.length) return false;

  return route.geometry.coordinates.some(([lng, lat]) =>
    hazards.some(h =>
      getDistance(
        { lat, lng },
        { lat: h.lat, lng: h.lng }
      ) < h.radius
    )
  );
}