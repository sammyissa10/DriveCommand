import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { generateDispatches } from '@/lib/carrier/dispatch-generator';

const GenerateSchema = z.object({
  generate_through_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
});

export async function POST(
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
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await generateDispatches(orgId, id, parsed.data.generate_through_date);

    return NextResponse.json({
      data: {
        dispatches_created: result.dispatchesCreated,
        skipped_existing: result.skippedExisting,
        errors: result.errors,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found or inactive')) {
      return NextResponse.json({ error: 'Route template not found' }, { status: 404 });
    }
    logger.error('POST /api/v1/carrier/route-templates/[id]/generate failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
