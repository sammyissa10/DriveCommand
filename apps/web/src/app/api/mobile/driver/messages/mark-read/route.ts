import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/mobile/driver/messages/mark-read
 *
 * Acknowledges that the driver has read all messages up to now.
 * The read-state is managed client-side via MMKV (last-read timestamp).
 * This endpoint exists for API symmetry and future server-side tracking.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  // Read state is tracked client-side; server acknowledges successfully
  return NextResponse.json({ success: true });
}
