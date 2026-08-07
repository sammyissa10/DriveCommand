/**
 * POST /api/mobile/carrier/owner/document-imports/[id]/stops/order
 *
 * Bearer-token mirror of the web route. The phone reorders with arrow buttons
 * rather than a drag (no gesture handler is installed — audit D4), but what it
 * sends is the same full permutation, so the persistence and the validation are
 * byte-identical to the browser's.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleReorderStops } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }
  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleReorderStops(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/stops/order failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
