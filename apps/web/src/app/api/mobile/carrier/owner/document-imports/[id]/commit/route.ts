/**
 * GET  /api/mobile/carrier/owner/document-imports/[id]/commit
 * POST /api/mobile/carrier/owner/document-imports/[id]/commit
 *
 * Bearer-token mirror of the web route. Same handlers, so the two surfaces
 * cannot drift — including the server-side validation gate, which is the whole
 * point of item 2: a direct API call with a blocked driver must still be
 * blocked, and this is the surface most likely to be called directly.
 *
 * The mobile token carries a role but no permission map, so the viewer is
 * role-only: an OWNER sees driver residences and nobody else does. That is the
 * default-deny direction `facility-visibility.ts` documents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCommitImport, handleGetCommitPreview } from '@/lib/document-import/handlers';

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
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    const result = await handleGetCommitPreview(auth.tenantId, auth.userId, id, query, {
      role: auth.role,
      permissions: null,
      carrierDriverId: null,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/.../document-imports/[id]/commit failed', err);
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
    const result = await handleCommitImport(auth.tenantId, auth.userId, id, body, {
      role: auth.role,
      permissions: null,
      carrierDriverId: null,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/commit failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
