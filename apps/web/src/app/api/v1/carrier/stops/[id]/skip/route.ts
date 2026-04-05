import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { skipStop } from '@/lib/carrier/stop-completion';

const SkipSchema = z.object({
  skip_reason: z.string().min(1, 'skip_reason is required'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  // Only owner or sysadmin may skip stops — drivers cannot
  if (session.role === 'driver') {
    return NextResponse.json({ error: 'Drivers cannot skip stops' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = SkipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await skipStop(orgId, id, session.userId, parsed.data.skip_reason);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/stops/[id]/skip failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
