import { routeIsInsideJaen } from "../../screens/utils/jaenBounds";
import { routeIntersectsHazard } from "../../screens/utils/routeUtils";

/**
 * Chooses the best route:
 * 1. Must stay inside Jaen
 * 2. Prefer routes without hazards
 * 3. Fallback to fastest if none are safe
 */
export function chooseBestRoute(routes, hazards) {
  const jaenOnly = routes.filter(routeIsInsideJaen);
  if (!jaenOnly.length) return null;

  const safeRoutes = jaenOnly.filter(
    r => !routeIntersectsHazard(r, hazards)
  );

  return safeRoutes[0] || jaenOnly[0];
}
