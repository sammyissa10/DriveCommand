/**
 * GET  /api/mobile/carrier/owner/document-imports/[id]/template/offer
 * POST /api/mobile/carrier/owner/document-imports/[id]/template/offer
 *
 * Bearer-token mirror of the web route. The post-commit template question
 * (spec Section 8, items 5 and 7), same handlers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  handleGetTemplateOffer,
  handleTemplateOfferResponse,
} from '@/lib/document-import/handlers';

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
    const result = await handleGetTemplateOffer(auth.tenantId, auth.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/.../document-imports/[id]/template/offer failed', err);
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
    const result = await handleTemplateOfferResponse(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/template/offer failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
