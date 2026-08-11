/**
 * GET  /api/mobile/carrier/owner/document-imports/[id]/end-stop
 * POST /api/mobile/carrier/owner/document-imports/[id]/end-stop
 *
 * Bearer-token mirror of the web route. Same handlers, so the two surfaces
 * cannot drift — including that `reset` deletes the stored decision rather than
 * overwriting it, and that a facility id is only admissible for
 * `DESIGNATED_PARKING`.
 *
 * The mobile token carries a role but no permission map, so the viewer here is
 * role-only: an OWNER sees driver residences and nobody else does. That is the
 * default-deny direction `facility-visibility.ts` documents, and it is the safe
 * one — a manager on a phone sees no home addresses rather than all of them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleGetEndStop, handleSetEndStop } from '@/lib/document-import/handlers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }
  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const result = await handleGetEndStop(auth.tenantId, auth.userId, id, {
      role: auth.role,
      permissions: null,
      carrierDriverId: null,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/.../document-imports/[id]/end-stop failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const result = await handleSetEndStop(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/end-stop failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
