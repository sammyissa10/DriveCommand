/**
 * POST /api/mobile/carrier/owner/document-imports/[id]/extract
 *
 * Bearer-token mirror of the web extract route. Same idempotent resume
 * behaviour — which is what makes backgrounding the app safe: the phone can
 * lose the response entirely and simply call this again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleExtract } from '@/lib/document-import/handlers';

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  // Spec Section 15: rate-limit extraction per tenant.
  const limited = await applyRateLimit(uploadLimiter, auth.tenantId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const result = await handleExtract(auth.tenantId, auth.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/carrier/owner/document-imports/[id]/extract failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
