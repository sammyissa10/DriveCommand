/**
 * POST /api/mobile/carrier/owner/document-imports/[id]/stops/facility
 *
 * Bearer-token mirror of the web route, and the only mobile route that can
 * create a facility. See the web route's header for why creation lives behind
 * its own verb.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCreateStopFacility } from '@/lib/document-import/handlers';

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
    const result = await handleCreateStopFacility(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/stops/facility failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
