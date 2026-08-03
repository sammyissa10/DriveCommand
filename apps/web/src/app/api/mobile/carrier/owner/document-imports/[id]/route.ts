/**
 * GET    /api/mobile/carrier/owner/document-imports/[id]  — status + progress
 * DELETE /api/mobile/carrier/owner/document-imports/[id]  — cancel
 *
 * Auth is inline rather than via `withMobileAuth` because that wrapper does not
 * forward the dynamic-route params — the same reason the driver dispatch route
 * next door does it this way.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCancel, handleGetImport } from '@/lib/document-import/handlers';

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
    const result = await handleGetImport(gate.auth.tenantId, gate.auth.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/carrier/owner/document-imports/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner(req);
  if ('error' in gate) return gate.error;

  try {
    const { id } = await params;
    const result = await handleCancel(gate.auth.tenantId, gate.auth.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('DELETE /api/mobile/carrier/owner/document-imports/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
