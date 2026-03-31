import { NextRequest, NextResponse } from 'next/server';
import type { AddressResult } from '@drivecommand/types';
import { getSession } from '@/lib/auth/session';
import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { applyRateLimit, geocodingLimiter } from '@/lib/rate-limit';

// In-memory cache: key = lowercase trimmed query, value = { data, timestamp }
const cache = new Map<string, { data: AddressResult[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
}

function formatAddress(r: NominatimResult): string {
  const a = r.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || '';
  const state = a.state || '';
  const zip = a.postcode || '';
  const parts = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

export async function POST(req: NextRequest) {
  // Auth: accept mobile Bearer token or web session cookie
  const mobileAuth = await validateMobileToken(req);
  const session = mobileAuth ?? (await getSession());
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Rate limiting: 30 requests/minute per user (or IP as fallback)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimited = await applyRateLimit(geocodingLimiter, `geo:${session.userId ?? ip}`);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('query' in body)) {
    return NextResponse.json({ error: 'Missing required field: query' }, { status: 400 });
  }

  const { query } = body as { query: unknown };

  if (typeof query !== 'string') {
    return NextResponse.json({ error: 'query must be a string' }, { status: 400 });
  }

  const trimmed = query.trim();

  if (trimmed.length < 3) {
    return NextResponse.json({ error: 'query must be at least 3 characters' }, { status: 400 });
  }

  if (trimmed.length > 300) {
    return NextResponse.json({ error: 'query must be 300 characters or fewer' }, { status: 400 });
  }

  const cacheKey = trimmed.toLowerCase();

  // Check in-memory cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const params = new URLSearchParams({
      q: trimmed,
      format: 'json',
      limit: '6',
      countrycodes: 'us',
      addressdetails: '1',
    });

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DriveCommand/1.0 (geocoding-proxy)',
      },
    });

    if (!res.ok) {
      // Graceful degradation — return empty array on upstream failure
      return NextResponse.json([], { headers: { 'Cache-Control': 'public, max-age=300' } });
    }

    const data: NominatimResult[] = await res.json();

    const results: AddressResult[] = data.map((r) => ({
      formatted_address: formatAddress(r),
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      place_id: String(r.place_id),
    }));

    // Store in cache
    cache.set(cacheKey, { data: results, timestamp: Date.now() });

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    // Graceful degradation — return empty array on any error
    return NextResponse.json([], { headers: { 'Cache-Control': 'public, max-age=300' } });
  }
}
