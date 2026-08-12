const OSRM_BASE = "https://router.project-osrm.org";

/**
 * Fetch routes from OSRM
 * profile: driving | walking | cycling
 */
export async function fetchRoutes({ start, end, profile }) {
  const url =
    `${OSRM_BASE}/route/v1/${profile}/` +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    `?alternatives=true&overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("OSRM request failed");
  }

  const json = await res.json();
  return json.routes || [];
}
