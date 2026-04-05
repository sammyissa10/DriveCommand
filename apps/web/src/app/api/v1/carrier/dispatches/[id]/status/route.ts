import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { transitionDispatchStatus } from '@/lib/carrier/dispatches';

const StatusTransitionSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'cancelled', 'tonu']),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = StatusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await transitionDispatchStatus(
      orgId,
      id,
      parsed.data.status,
      parsed.data.notes
    );

    if (result === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, details: (result as { error: string; details?: { from: string; to: string } }).details },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/dispatches/[id]/status failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
