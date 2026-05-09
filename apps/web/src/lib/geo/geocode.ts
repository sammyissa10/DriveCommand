/**
 * Shared geocoding utility using Nominatim (OpenStreetMap).
 * Free, no API key required. Respects OSM usage policy (low-volume requests only).
 *
 * Used by:
 * - geofence-check.ts (lazy geocode of existing Load coordinates)
 * - mobile/owner/loads POST handler (geocode on create)
 * - mobile/owner/loads/[id] PATCH handler (re-geocode on origin/destination change)
 */

/**
 * Geocode a single address using Nominatim (OpenStreetMap).
 * Returns { lat, lng } or null if geocoding fails.
 * Never throws — all errors return null.
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DriveCommand/1.0 fleet-management' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    // Nominatim returns `lat` and `lon` (not `lng`)
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}

/**
 * Geocode both ends of a load (origin → pickup, destination → delivery) in parallel.
 * Returns null lat/lng for any address that fails geocoding.
 * Never throws.
 */
export async function geocodeLoadAddresses(
  origin: string,
  destination: string
): Promise<{
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
}> {
  const [pickup, delivery] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);

  return {
    pickupLat: pickup?.lat ?? null,
    pickupLng: pickup?.lng ?? null,
    deliveryLat: delivery?.lat ?? null,
    deliveryLng: delivery?.lng ?? null,
  };
}
