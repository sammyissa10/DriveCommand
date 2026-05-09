import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { applyRateLimit, geocodingLimiter } from '@/lib/rate-limit';
import { getOSRMDirections } from '@/lib/geo/osrm';

/**
 * POST /api/geocoding/directions
 *
 * Server-side OSRM proxy for mobile clients. Returns a GeoJSON polyline for a
 * multi-stop route along with total distance and duration.
 *
 * Mobile cannot call the OSRM HTTP endpoint directly on all networks (mixed
 * content, CORS). This proxy accepts authenticated requests from mobile and
 * forwards them to OSRM with overview=full&geometries=geojson.
 *
 * Request body:
 *   { stops: Array<{ lat: number; lng: number }> }
 *   Minimum 2 stops required. Stops must be in visit order.
 *
 * Response (success):
 *   { polyline: [number, number][], distanceMiles: number, durationSeconds: number }
 *
 * Response (OSRM unavailable or no route found — not a 500):
 *   { polyline: null, distanceMiles: null, durationSeconds: null }
 *
 * Auth: accepts mobile Bearer token OR web session cookie.
 * Rate limit: shared geocodingLimiter with key dir:{userId}.
 */
export async function POST(req: NextRequest) {
  // Auth: accept mobile Bearer token or web session cookie
  const mobileAuth = await validateMobileToken(req);
  const session = mobileAuth ?? (await getSession());
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Rate limiting: shared geocoding limiter, keyed by userId with dir: prefix
  const rateLimited = await applyRateLimit(geocodingLimiter, `dir:${session.userId}`);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as Record<string, unknown>).stops)) {
    return NextResponse.json({ error: 'stops must be an array' }, { status: 400 });
  }

  const stops = (body as { stops: unknown[] }).stops;
  if (stops.length < 2) {
    return NextResponse.json({ error: 'At least 2 stops required' }, { status: 400 });
  }

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i] as Record<string, unknown>;
    if (typeof s?.lat !== 'number' || isNaN(s.lat) || s.lat < -90 || s.lat > 90) {
      return NextResponse.json(
        { error: `stops[${i}].lat must be a number between -90 and 90` },
        { status: 400 }
      );
    }
    if (typeof s?.lng !== 'number' || isNaN(s.lng) || s.lng < -180 || s.lng > 180) {
      return NextResponse.json(
        { error: `stops[${i}].lng must be a number between -180 and 180` },
        { status: 400 }
      );
    }
  }

  const result = await getOSRMDirections(stops as { lat: number; lng: number }[]);

  return NextResponse.json(
    result ?? { polyline: null, distanceMiles: null, durationSeconds: null }
  );
}
