/**
 * OSRM road distance and directions utility.
 *
 * Uses the public OSRM routing engine to compute real road distances
 * and polyline routes between geographic coordinates.
 *
 * NOTE: OSRM uses (longitude, latitude) order — opposite of the conventional
 * (lat, lng) order used elsewhere. All coordinates passed to the URL must
 * be in (lng, lat) order.
 *
 * This utility is used by:
 *   - load-form.tsx (replacing haversine straight-line distance)
 *   - route-form.tsx (replacing haversine straight-line distance)
 *   - profit-predictor-form.tsx (auto-filling distance from geocoded addresses)
 *   - /api/geocoding/distance (server-side proxy for mobile)
 *   - /api/geocoding/directions (server-side directions proxy for mobile map)
 *
 * DO NOT use this for:
 *   - IFTA state-lookup GPS ping segments (haversine is correct for point-to-point GPS)
 *   - Geofencing radius checks (turf.js is correct for proximity checks)
 */

const OSRM_BASE_URL = 'http://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 5_000;

interface OSRMResponse {
  code: string;
  routes?: Array<{
    distance: number; // meters
    duration: number; // seconds
  }>;
}

/**
 * Get the real road distance in miles between two coordinates via OSRM.
 *
 * @param lat1 - Origin latitude
 * @param lng1 - Origin longitude
 * @param lat2 - Destination latitude
 * @param lng2 - Destination longitude
 * @returns Distance in miles, or null if the request fails or no route is found.
 *
 * Never throws — all errors are caught and null is returned.
 */
export async function getOSRMDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // OSRM coordinate order: longitude,latitude (not lat,lng)
    const url = `${OSRM_BASE_URL}/${lng1},${lat1};${lng2},${lat2}?overview=false`;

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return null;

    const data: OSRMResponse = await res.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const meters = data.routes[0].distance;
    if (typeof meters !== 'number' || isNaN(meters)) return null;

    return meters / 1609.344;
  } catch {
    // Network error, timeout, JSON parse failure — all return null gracefully
    return null;
  }
}

export interface OSRMDirectionsResult {
  /** GeoJSON [lng, lat] coordinate pairs — Mapbox ShapeSource expects this order natively */
  polyline: [number, number][]
  /** Total route distance in miles */
  distanceMiles: number
  /** Total route duration in seconds */
  durationSeconds: number
}

/**
 * Get the real road polyline and distance/duration for a multi-stop route via OSRM.
 *
 * @param stops - Array of stops in visit order, each with lat and lng in decimal degrees.
 *                Minimum 2 stops required.
 * @returns Polyline coordinates (GeoJSON [lng, lat] order), distance in miles, and
 *          duration in seconds. Returns null if the request fails or no route found.
 *
 * OSRM coordinate order: longitude,latitude in the URL (opposite of conventional lat,lng).
 * Response geometry coordinates are also [lng, lat] (GeoJSON standard).
 * Mapbox ShapeSource uses GeoJSON [lng, lat] natively — no swap needed on the frontend.
 *
 * Never throws — all errors are caught and null is returned.
 */
export async function getOSRMDirections(
  stops: { lat: number; lng: number }[]
): Promise<OSRMDirectionsResult | null> {
  if (stops.length < 2) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    // OSRM coordinate order: lng,lat (not lat,lng) — see getOSRMDistanceMiles comment
    const coordsStr = stops.map(s => `${s.lng},${s.lat}`).join(';')
    const url = `${OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=geojson`

    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return null

    const data: {
      code: string
      routes?: Array<{
        distance: number
        duration: number
        geometry: { type: 'LineString'; coordinates: [number, number][] }
      }>
    } = await res.json()

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null

    const route = data.routes[0]
    if (!route.geometry?.coordinates?.length) return null

    return {
      polyline: route.geometry.coordinates,
      distanceMiles: route.distance / 1609.344,
      durationSeconds: route.duration,
    }
  } catch {
    return null
  }
}
