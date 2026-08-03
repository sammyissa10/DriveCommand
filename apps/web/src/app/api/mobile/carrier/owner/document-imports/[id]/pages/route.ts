/**
 * PUT /api/mobile/carrier/owner/document-imports/[id]/pages — re-shoot a page
 *
 * This is the one that matters on a phone: a page photographed badly in a
 * warehouse gets replaced on its own, and every other page stays cached.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleReshoot } from '@/lib/document-import/handlers';

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOwner(req);
  if ('error' in gate) return gate.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const result = await handleReshoot(gate.auth.tenantId, gate.auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('PUT /api/mobile/carrier/owner/document-imports/[id]/pages failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
