/**
 * GET   /api/mobile/carrier/owner/document-imports/[id]/resolution
 * PATCH /api/mobile/carrier/owner/document-imports/[id]/resolution
 *
 * Bearer-token mirror of the web routes. Auth is inline rather than via
 * `withMobileAuth` because that wrapper does not forward dynamic-route params —
 * same as its siblings in this folder.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleGetResolution, handleSetResolution } from '@/lib/document-import/handlers';

async function requireOwner(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return { error: unauthorizedResponse() } as const;
  if (auth.role !== 'OWNER') {
    return {
      error: NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 }),
    } as const;
  }
  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return { error: limited } as const;
  return { auth } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner(req);
  if ('error' in gate) return gate.error;

  try {
    const { id } = await params;
    const q = req.nextUrl.searchParams.get('q');
    const result = await handleGetResolution(gate.auth.tenantId, gate.auth.userId, id, q);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/carrier/owner/document-imports/[id]/resolution failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner(req);
  if ('error' in gate) return gate.error;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleSetResolution(gate.auth.tenantId, gate.auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('PATCH /api/mobile/carrier/owner/document-imports/[id]/resolution failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
