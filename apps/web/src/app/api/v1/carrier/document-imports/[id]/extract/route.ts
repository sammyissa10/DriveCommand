/**
 * POST /api/v1/carrier/document-imports/[id]/extract
 *
 * Runs (or resumes) extraction. Idempotent: a call while a run is genuinely in
 * flight is a no-op, and a call after a run died halfway re-reads only the
 * pages that never landed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { handleExtract } from '@/lib/document-import/handlers';

// Reading sixteen pages through a vision model does not fit the default budget.
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  // Spec Section 15: rate-limit extraction per tenant.
  const limited = await applyRateLimit(uploadLimiter, orgId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const result = await handleExtract(orgId, session.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/extract failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
