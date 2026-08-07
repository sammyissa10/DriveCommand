/**
 * POST /api/mobile/carrier/owner/document-imports/[id]/stops/bulk
 *
 * Bearer-token mirror of the web route. The phone's selection is the same list
 * of indexes the browser sends, and the server treats both the same way: it acts
 * on every index named and never asks which of them were on screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleBulkApplyStops } from '@/lib/document-import/handlers';

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
    const result = await handleBulkApplyStops(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/stops/bulk failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
