import { useEffect, useRef, useState } from "react";
import axios from "axios";

const OSRM_BASE = "https://router.project-osrm.org";

/* =========================
   PROFILE + SPEED
========================= */

const OSRM_PROFILE_MAP = {
  walking: "foot",
  cycling: "bike",
  driving: "driving",
};

const SPEED_KMH = {
  walking: 4.5,
  cycling: 15,
  driving: 40,
};

function formatDuration(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/* =========================
   GEOMETRY
========================= */

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const INCIDENT_RADIUS = {
  low: 0,
  medium: 40,
  high: 80,
  critical: 150,
};

/* =========================
   INCIDENT ANALYSIS
========================= */

function analyzeRouteAgainstIncidents(routeCoords, incidents) {
  let dangerScore = 0;
  let hitPoints = 0;
  let isBlocked = false;
  let isRisky = false;

  if (!incidents || incidents.length === 0) {
    return { dangerScore, isBlocked, isRisky };
  }

  for (const point of routeCoords) {
    for (const incident of incidents) {
      const radius =
        INCIDENT_RADIUS[incident.level] ?? INCIDENT_RADIUS.high;

      const dist = getDistanceMeters(
        point.latitude,
        point.longitude,
        incident.latitude,
        incident.longitude
      );

      if (dist < radius) {
        hitPoints++;
        dangerScore += 1000;
      }
    }
  }

  const hitRatio = routeCoords.length
    ? hitPoints / routeCoords.length
    : 0;

  if (hitRatio > 0.2) isBlocked = true;
  else if (hitRatio > 0.04) isRisky = true;

  return { dangerScore, isBlocked, isRisky };
}

/* =========================
   INTERSECTION‑BASED DETOUR
========================= */

function findIntersectionWaypoint(route, incidents) {
  const steps = route.legs?.[0]?.steps ?? [];

  for (const step of steps) {
    for (const inter of step.intersections ?? []) {
      const [lng, lat] = inter.location;

      for (const inc of incidents) {
        if (inc.level !== "critical") continue;

        const dist = getDistanceMeters(
          lat,
          lng,
          inc.latitude,
          inc.longitude
        );

        if (dist > INCIDENT_RADIUS.critical * 1.2) {
          console.log("✅ [Intersection Detour] Using", { lat, lng });
          return { lat, lng };
        }
      }
    }
  }

  console.log("❌ [Intersection Detour] None found");
  return null;
}

/* =========================
   FALLBACK: LATERAL DETOUR
========================= */

function pickLateralWaypoint(routeCoords, incidents) {
  if (!routeCoords.length) return null;

  const flood = incidents.find((i) => i.level === "critical");
  if (!flood) return null;

  const base = routeCoords.find(
    (p) =>
      getDistanceMeters(
        p.latitude,
        p.longitude,
        flood.latitude,
        flood.longitude
      ) < INCIDENT_RADIUS.critical
  );

  if (!base) return null;

  const LATERAL_THRESHOLD = 0.0004;

  for (const p of routeCoords) {
    const lateral =
      Math.abs(p.latitude - base.latitude) +
      Math.abs(p.longitude - base.longitude);

    if (lateral > LATERAL_THRESHOLD) {
      console.log("✅ [Lateral Detour] Using", p);
      return { lat: p.latitude, lng: p.longitude };
    }
  }

  console.log("❌ [Lateral Detour] None found");
  return null;
}

/* =========================
   HOOK
========================= */

export default function useRouting({
  enabled,
  from,
  to,
  mode = "driving",
  incidents = [],
}) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const inFlightRef = useRef(false);
  const lastKeyRef = useRef(null);

  /* ✅ TEMP DEBUG — FORCE CRITICAL INCIDENT AT ROUTE START */
  const debugIncidents = [
    ...incidents,
    {
      latitude: from?.[0],
      longitude: from?.[1],
      level: "critical",
    },
  ];

  useEffect(() => {
    lastKeyRef.current = null;
    inFlightRef.current = false;
  }, [mode, enabled]);

  useEffect(() => {
    if (!enabled || !from || !to) return;

    const profile = OSRM_PROFILE_MAP[mode] || "driving";
    const key = `${profile}:${from[0]},${from[1]}->${to.lat},${to.lng}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    setError(null);

    const requestRoute = (wp) => {
      const coords = wp
        ? `${from[1]},${from[0]};${wp.lng},${wp.lat};${to.lng},${to.lat}`
        : `${from[1]},${from[0]};${to.lng},${to.lat}`;

      console.log("[OSRM]", wp ? "WITH WAYPOINT" : "DIRECT", coords);

      return axios.get(
        `${OSRM_BASE}/route/v1/${profile}/${coords}`,
        {
          params: {
            overview: "full",
            geometries: "geojson",
            steps: true,
            alternatives: true,
          },
        }
      );
    };

    requestRoute()
      .then((res) => {
        const route = res.data.routes?.[0];
        if (!route) return res;

        let wp = findIntersectionWaypoint(route, debugIncidents);

        if (!wp) {
          const coords = route.geometry.coordinates.map(
            ([lng, lat]) => ({
              latitude: lat,
              longitude: lng,
            })
          );
          wp = pickLateralWaypoint(coords, debugIncidents);
        }

        return wp ? requestRoute(wp) : res;
      })
      .then((res) => {
        const final = res.data.routes.map((r, i) => {
          const coords = r.geometry.coordinates.map(
            ([lng, lat]) => ({
              latitude: lat,
              longitude: lng,
            })
          );

          return {
            id: `${key}-${i}`,
            coords,
            distance: r.distance,
            steps: r.legs?.[0]?.steps || [],
            summary: {
              km: (r.distance / 1000).toFixed(1),
              minutes: Math.round(
                (r.distance / 1000 / SPEED_KMH[mode]) * 60
              ),
              displayTime: formatDuration(
                Math.round(
                  (r.distance / 1000 / SPEED_KMH[mode]) * 60
                )
              ),
            },
            ...analyzeRouteAgainstIncidents(coords, debugIncidents),
          };
        });

        const safe = final.filter(
          (r) => !r.isBlocked && !r.isRisky
        );
        const risky = final.filter(
          (r) => !r.isBlocked && r.isRisky
        );

        let recommendedId = null;
        if (safe.length) recommendedId = safe[0].id;
        else if (risky.length) recommendedId = risky[0].id;

        setRoutes(
          final.map((r) => ({
            ...r,
            isRecommended: r.id === recommendedId,
          }))
        );
      })
      .catch(setError)
      .finally(() => {
        inFlightRef.current = false;
        setLoading(false);
      });
  }, [enabled, from, to, mode, incidents]);

  return { routes, loading, error };
}
