import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { applyRateLimit, geocodingLimiter } from '@/lib/rate-limit';
import { getOSRMDistanceMiles } from '@/lib/geo/osrm';

/**
 * POST /api/geocoding/distance
 *
 * Server-side OSRM proxy for mobile clients. Mobile cannot call the OSRM
 * HTTP endpoint directly on all networks (mixed content, CORS). This proxy
 * accepts authenticated requests from mobile and forwards them to OSRM.
 *
 * Request body:
 *   { originLat: number, originLng: number, destLat: number, destLng: number }
 *
 * Response:
 *   { distanceMiles: number | null }
 *
 * Auth: accepts mobile Bearer token OR web session cookie.
 * Rate limit: shared geocodingLimiter with key dist:{userId}.
 */
export async function POST(req: NextRequest) {
  // Auth: accept mobile Bearer token or web session cookie
  const mobileAuth = await validateMobileToken(req);
  const session = mobileAuth ?? (await getSession());
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Rate limiting: shared geocoding limiter, keyed by userId
  const rateLimited = await applyRateLimit(geocodingLimiter, `dist:${session.userId}`);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const { originLat, originLng, destLat, destLng } = body as Record<string, unknown>;

  // Validate all 4 fields are numbers within valid lat/lng ranges
  if (typeof originLat !== 'number' || isNaN(originLat)) {
    return NextResponse.json({ error: 'originLat must be a number' }, { status: 400 });
  }
  if (typeof originLng !== 'number' || isNaN(originLng)) {
    return NextResponse.json({ error: 'originLng must be a number' }, { status: 400 });
  }
  if (typeof destLat !== 'number' || isNaN(destLat)) {
    return NextResponse.json({ error: 'destLat must be a number' }, { status: 400 });
  }
  if (typeof destLng !== 'number' || isNaN(destLng)) {
    return NextResponse.json({ error: 'destLng must be a number' }, { status: 400 });
  }

  if (originLat < -90 || originLat > 90) {
    return NextResponse.json({ error: 'originLat must be between -90 and 90' }, { status: 400 });
  }
  if (originLng < -180 || originLng > 180) {
    return NextResponse.json({ error: 'originLng must be between -180 and 180' }, { status: 400 });
  }
  if (destLat < -90 || destLat > 90) {
    return NextResponse.json({ error: 'destLat must be between -90 and 90' }, { status: 400 });
  }
  if (destLng < -180 || destLng > 180) {
    return NextResponse.json({ error: 'destLng must be between -180 and 180' }, { status: 400 });
  }

  const distanceMiles = await getOSRMDistanceMiles(originLat, originLng, destLat, destLng);

  return NextResponse.json({ distanceMiles });
}
