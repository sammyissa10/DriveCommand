/**
 * PUT /api/v1/carrier/document-imports/[id]/pages — re-shoot one page
 *
 * Replaces one position in the ordered `source_file_keys` array and drops only
 * that page's cached row, so the next extraction bills for one page (spec
 * Section 14). There is no reorder endpoint — see the note in `intake.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { handleReshoot } from '@/lib/document-import/handlers';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const result = await handleReshoot(orgId, session.userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error('PUT /api/v1/carrier/document-imports/[id]/pages failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
