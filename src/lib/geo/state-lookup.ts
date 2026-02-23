/**
 * Lightweight US state bounding box lookup.
 * Uses approximate rectangular bounding boxes for all 48 contiguous states + DC.
 * Intentionally approximate — IFTA quarterly reporting does not require polygon precision.
 *
 * States are ordered by area ascending so smaller states get priority
 * when bounding boxes overlap at borders.
 */

export interface StateBounds {
  code: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * US state bounding boxes ordered by area ascending (smallest first).
 * This ensures smaller states win over larger ones when boxes overlap.
 */
const STATE_BOUNDS: StateBounds[] = [
  // Smallest first — DC, RI, DE, CT, NJ, NH, VT, MA, HI, MD, etc.
  { code: 'DC', name: 'District of Columbia', minLat: 38.791, maxLat: 38.996, minLng: -77.120, maxLng: -76.909 },
  { code: 'RI', name: 'Rhode Island',         minLat: 41.146, maxLat: 42.019, minLng: -71.908, maxLng: -71.094 },
  { code: 'DE', name: 'Delaware',             minLat: 38.451, maxLat: 39.839, minLng: -75.789, maxLng: -74.984 },
  { code: 'CT', name: 'Connecticut',          minLat: 40.950, maxLat: 42.050, minLng: -73.728, maxLng: -71.786 },
  { code: 'NJ', name: 'New Jersey',           minLat: 38.928, maxLat: 41.358, minLng: -75.559, maxLng: -73.893 },
  { code: 'NH', name: 'New Hampshire',        minLat: 42.696, maxLat: 45.306, minLng: -72.557, maxLng: -70.610 },
  { code: 'VT', name: 'Vermont',              minLat: 42.726, maxLat: 45.017, minLng: -73.438, maxLng: -71.464 },
  { code: 'MA', name: 'Massachusetts',        minLat: 41.187, maxLat: 42.886, minLng: -73.508, maxLng: -69.928 },
  { code: 'MD', name: 'Maryland',             minLat: 37.886, maxLat: 39.723, minLng: -79.487, maxLng: -74.986 },
  { code: 'HI', name: 'Hawaii',               minLat: 18.910, maxLat: 22.236, minLng: -160.254, maxLng: -154.806 },
  { code: 'WV', name: 'West Virginia',        minLat: 37.201, maxLat: 40.638, minLng: -82.644, maxLng: -77.719 },
  { code: 'SC', name: 'South Carolina',       minLat: 32.034, maxLat: 35.215, minLng: -83.354, maxLng: -78.541 },
  { code: 'IN', name: 'Indiana',              minLat: 37.771, maxLat: 41.760, minLng: -88.098, maxLng: -84.784 },
  { code: 'ME', name: 'Maine',                minLat: 43.060, maxLat: 47.460, minLng: -71.083, maxLng: -66.950 },
  { code: 'KY', name: 'Kentucky',             minLat: 36.497, maxLat: 39.148, minLng: -89.571, maxLng: -81.964 },
  { code: 'OH', name: 'Ohio',                 minLat: 38.403, maxLat: 41.977, minLng: -84.820, maxLng: -80.519 },
  { code: 'VA', name: 'Virginia',             minLat: 36.540, maxLat: 39.466, minLng: -83.675, maxLng: -75.242 },
  { code: 'TN', name: 'Tennessee',            minLat: 34.982, maxLat: 36.678, minLng: -90.310, maxLng: -81.647 },
  { code: 'PA', name: 'Pennsylvania',         minLat: 39.719, maxLat: 42.269, minLng: -80.519, maxLng: -74.690 },
  { code: 'NY', name: 'New York',             minLat: 40.496, maxLat: 45.016, minLng: -79.762, maxLng: -71.856 },
  { code: 'MS', name: 'Mississippi',          minLat: 30.173, maxLat: 35.008, minLng: -91.655, maxLng: -88.098 },
  { code: 'AL', name: 'Alabama',              minLat: 30.144, maxLat: 35.008, minLng: -88.473, maxLng: -84.889 },
  { code: 'GA', name: 'Georgia',              minLat: 30.356, maxLat: 35.001, minLng: -85.605, maxLng: -80.840 },
  { code: 'FL', name: 'Florida',              minLat: 24.396, maxLat: 31.001, minLng: -87.634, maxLng: -80.032 },
  { code: 'NC', name: 'North Carolina',       minLat: 33.842, maxLat: 36.588, minLng: -84.322, maxLng: -75.460 },
  { code: 'IA', name: 'Iowa',                 minLat: 40.376, maxLat: 43.501, minLng: -96.639, maxLng: -90.140 },
  { code: 'IL', name: 'Illinois',             minLat: 36.970, maxLat: 42.508, minLng: -91.513, maxLng: -87.019 },
  { code: 'MI', name: 'Michigan',             minLat: 41.696, maxLat: 48.306, minLng: -90.418, maxLng: -82.122 },
  { code: 'WI', name: 'Wisconsin',            minLat: 42.491, maxLat: 47.080, minLng: -92.889, maxLng: -86.250 },
  { code: 'MN', name: 'Minnesota',            minLat: 43.499, maxLat: 49.384, minLng: -97.239, maxLng: -89.489 },
  { code: 'AR', name: 'Arkansas',             minLat: 33.004, maxLat: 36.500, minLng: -94.618, maxLng: -89.644 },
  { code: 'LA', name: 'Louisiana',            minLat: 28.925, maxLat: 33.019, minLng: -94.043, maxLng: -88.817 },
  { code: 'MO', name: 'Missouri',             minLat: 35.995, maxLat: 40.614, minLng: -95.774, maxLng: -89.099 },
  { code: 'OK', name: 'Oklahoma',             minLat: 33.615, maxLat: 37.002, minLng: -103.002, maxLng: -94.430 },
  { code: 'KS', name: 'Kansas',               minLat: 36.993, maxLat: 40.003, minLng: -102.051, maxLng: -94.589 },
  { code: 'NE', name: 'Nebraska',             minLat: 39.999, maxLat: 43.001, minLng: -104.053, maxLng: -95.308 },
  { code: 'SD', name: 'South Dakota',         minLat: 42.479, maxLat: 45.945, minLng: -104.058, maxLng: -96.436 },
  { code: 'ND', name: 'North Dakota',         minLat: 45.935, maxLat: 49.000, minLng: -104.049, maxLng: -96.554 },
  { code: 'TX', name: 'Texas',                minLat: 25.837, maxLat: 36.500, minLng: -106.645, maxLng: -93.508 },
  { code: 'CO', name: 'Colorado',             minLat: 36.992, maxLat: 41.003, minLng: -109.060, maxLng: -102.042 },
  { code: 'WY', name: 'Wyoming',              minLat: 40.994, maxLat: 45.006, minLng: -111.056, maxLng: -104.052 },
  { code: 'MT', name: 'Montana',              minLat: 44.358, maxLat: 49.001, minLng: -116.049, maxLng: -104.040 },
  { code: 'ID', name: 'Idaho',                minLat: 41.988, maxLat: 49.001, minLng: -117.243, maxLng: -111.043 },
  { code: 'UT', name: 'Utah',                 minLat: 36.998, maxLat: 42.001, minLng: -114.053, maxLng: -109.041 },
  { code: 'AZ', name: 'Arizona',              minLat: 31.332, maxLat: 37.004, minLng: -114.815, maxLng: -109.045 },
  { code: 'NM', name: 'New Mexico',           minLat: 31.332, maxLat: 37.000, minLng: -109.050, maxLng: -103.002 },
  { code: 'NV', name: 'Nevada',               minLat: 35.001, maxLat: 42.000, minLng: -120.005, maxLng: -114.039 },
  { code: 'OR', name: 'Oregon',               minLat: 41.992, maxLat: 46.236, minLng: -124.566, maxLng: -116.463 },
  { code: 'WA', name: 'Washington',           minLat: 45.543, maxLat: 49.002, minLng: -124.733, maxLng: -116.916 },
  { code: 'CA', name: 'California',           minLat: 32.534, maxLat: 42.009, minLng: -124.409, maxLng: -114.131 },
  { code: 'AK', name: 'Alaska',               minLat: 54.775, maxLat: 71.352, minLng: -168.000, maxLng: -130.000 },
];

/**
 * Map of 2-letter state code to full state name.
 */
export const US_STATES: Record<string, string> = Object.fromEntries(
  STATE_BOUNDS.map((s) => [s.code, s.name])
);

/**
 * Return the 2-letter US state code for a given lat/lng coordinate.
 * Uses bounding box matching — intentionally approximate for IFTA reporting.
 * States are checked smallest-first to handle border overlap.
 *
 * @param lat - Latitude (decimal degrees)
 * @param lng - Longitude (decimal degrees)
 * @returns 2-letter state code (e.g. "NY") or null if outside all bounding boxes
 */
export function getStateFromCoordinates(lat: number, lng: number): string | null {
  for (const state of STATE_BOUNDS) {
    if (
      lat >= state.minLat &&
      lat <= state.maxLat &&
      lng >= state.minLng &&
      lng <= state.maxLng
    ) {
      return state.code;
    }
  }
  return null;
}

/**
 * Calculate the great-circle distance between two GPS coordinates using the Haversine formula.
 * Returns distance in miles.
 *
 * @param lat1 - Latitude of point 1 (decimal degrees)
 * @param lng1 - Longitude of point 1 (decimal degrees)
 * @param lat2 - Latitude of point 2 (decimal degrees)
 * @param lng2 - Longitude of point 2 (decimal degrees)
 * @returns Distance in miles
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
