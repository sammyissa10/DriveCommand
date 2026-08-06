/**
 * GET  /api/mobile/carrier/owner/document-imports/[id]/stops
 * POST /api/mobile/carrier/owner/document-imports/[id]/stops
 *
 * Bearer-token mirror of the web route. Same handlers, so the two surfaces
 * cannot drift — including the hard rule that this route links and never
 * creates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  handleConfirmStopFacility,
  handleGetStopResolution,
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
    const result = await handleGetStopResolution(auth.tenantId, auth.userId, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('GET /api/mobile/.../document-imports/[id]/stops failed', err);
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
    const result = await handleConfirmStopFacility(auth.tenantId, auth.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/mobile/.../document-imports/[id]/stops failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
