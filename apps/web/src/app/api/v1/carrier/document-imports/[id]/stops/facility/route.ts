/**
 * POST /api/v1/carrier/document-imports/[id]/stops/facility
 *      { stopIndex, name, facilityType?, addressLine1?, ... }
 *
 * The T4 exit, and **the only route in this module that can create a facility**.
 *
 * Spec Section 7's hard rule is that T3 and T4 never create without a human tap,
 * because a polluted facility table is unrecoverable. Giving creation its own
 * route with its own required body is how that rule is expressed at the
 * transport layer: nothing a GET or a link-confirmation does can reach
 * `createFacility`, and this route cannot be reached without a person having
 * seen and accepted a name.
 *
 * Create-and-link in one request, for the same reason create-and-select is one
 * request for a client: no window exists in which the facility is real and the
 * import does not know.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleCreateStopFacility } from '@/lib/document-import/handlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await handleCreateStopFacility(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/[id]/stops/facility failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
