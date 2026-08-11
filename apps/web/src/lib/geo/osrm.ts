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

/**
 * The same engine's `table` service — an N×N distance and duration matrix in one
 * round trip.
 *
 * A SEPARATE constant rather than a path swap, because `OSRM_BASE_URL` above
 * bakes `/route/v1/driving` into the base: there is no substring of it that is
 * "the host". Same host, same protocol, same absence of a key — this adds a
 * second service on the provider already wired in, it does not add a provider.
 *
 * That host is the public demo server and is a known, separately tracked
 * pre-launch item (audit D2). It is deliberately NOT changed here: swapping it
 * would be an infrastructure decision made inside a feature commit. What this
 * phase does about it instead is call it **once per ordered facility set and
 * cache the answer** (`optimisation-matrix.ts`), which is the whole reason the
 * matrix service is used rather than N² point-to-point calls — twelve stops is
 * one request here and sixty-six through `getOSRMDistanceMiles`.
 */
const OSRM_TABLE_URL = 'http://router.project-osrm.org/table/v1/driving';

const TIMEOUT_MS = 5_000;

/**
 * A matrix costs the engine more than a single route, and a dispatcher is
 * waiting on a suggestion they did not ask for. Longer than the route timeout,
 * still short enough that a slow provider degrades to "no suggestion" rather
 * than to a screen that hangs.
 */
const MATRIX_TIMEOUT_MS = 10_000;

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

export interface OSRMMatrixResult {
  /** `miles[i][j]` — road distance from point i to point j. */
  miles: number[][]
  /** `minutes[i][j]` — driving duration from point i to point j. */
  minutes: number[][]
}

/**
 * Road distance and duration between every pair of points, in ONE request.
 *
 * Used by route optimisation (spec Section 9 Part B), which needs an N×N matrix
 * and would otherwise make N² calls to `getOSRMDistanceMiles` — 66 requests for
 * a twelve-stop run against a rate-limited host, versus one.
 *
 * @param points - Stops in any order; the matrix indices match this array.
 *                 Minimum 2. The caller is responsible for capping the length
 *                 (see `MATRIX_MAX_POINTS`) — the table service is quadratic.
 * @returns Two square matrices, or null if the request fails, times out, or
 *          comes back with a hole in it.
 *
 * OSRM coordinate order is lng,lat — see `getOSRMDistanceMiles`.
 *
 * `annotations=distance,duration` is required: without it the service returns
 * durations only, and a missing `distances` key would read as a zero-mile
 * matrix rather than as an error. Any `null` cell (no route between two points)
 * fails the whole matrix rather than being coerced — a zero there would make an
 * unreachable pair look like the cheapest leg on the trip, which is the one
 * wrong answer an optimiser must never be handed.
 *
 * Never throws — all errors are caught and null is returned.
 */
export async function getOSRMMatrix(
  points: { lat: number; lng: number }[]
): Promise<OSRMMatrixResult | null> {
  if (points.length < 2) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MATRIX_TIMEOUT_MS)

    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';')
    const url = `${OSRM_TABLE_URL}/${coordsStr}?annotations=distance,duration`

    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return null

    const data: {
      code: string
      distances?: (number | null)[][]
      durations?: (number | null)[][]
    } = await res.json()

    if (data.code !== 'Ok' || !data.distances || !data.durations) return null

    const n = points.length
    if (data.distances.length !== n || data.durations.length !== n) return null

    const miles: number[][] = []
    const minutes: number[][] = []

    for (let i = 0; i < n; i++) {
      const distRow = data.distances[i]
      const durRow = data.durations[i]
      if (!Array.isArray(distRow) || !Array.isArray(durRow)) return null
      if (distRow.length !== n || durRow.length !== n) return null

      const mi: number[] = []
      const mn: number[] = []
      for (let j = 0; j < n; j++) {
        const meters = distRow[j]
        const seconds = durRow[j]
        if (typeof meters !== 'number' || !isFinite(meters)) return null
        if (typeof seconds !== 'number' || !isFinite(seconds)) return null
        mi.push(meters / 1609.344)
        mn.push(seconds / 60)
      }
      miles.push(mi)
      minutes.push(mn)
    }

    return { miles, minutes }
  } catch {
    return null
  }
}
