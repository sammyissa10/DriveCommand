import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { generateDispatches } from '@/lib/carrier/dispatch-generator';
import { createNotification } from '@/lib/carrier/in-app-notifications';

// today as YYYY-MM-DD (server-side default)
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const GenerateSchema = z.object({
  generate_through_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD')
    .optional(),
  // `date` is an alias for generate_through_date — generates for a specific single date
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD')
    .optional(),
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
    const body = await req.json().catch(() => ({}));
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Resolve the generate-through date: explicit field > date alias > today
    const generateThroughDate =
      parsed.data.generate_through_date ??
      parsed.data.date ??
      todayISO();

    const result = await generateDispatches(orgId, id, generateThroughDate);

    // Fire after() notifications for each generated dispatch
    for (const notif of result.notifications) {
      const { orgId: notifOrgId, dispatchId, templateName, dispatchNumber, needsAssignment } = notif;
      if (needsAssignment) {
        after(() =>
          createNotification({
            orgId: notifOrgId,
            userId: null,
            type: 'needs_assignment',
            title: 'Dispatch Needs Assignment',
            message: `Auto-generated dispatch ${dispatchNumber} from template "${templateName}" needs driver/truck assignment`,
            entityType: 'dispatch',
            entityId: dispatchId,
          })
        );
      } else {
        after(() =>
          createNotification({
            orgId: notifOrgId,
            userId: null,
            type: 'dispatch_generated',
            title: 'Dispatch Generated',
            message: `Dispatch ${dispatchNumber} auto-generated from template "${templateName}"`,
            entityType: 'dispatch',
            entityId: dispatchId,
          })
        );
      }
    }

    return NextResponse.json({
      data: {
        dispatches_created: result.dispatchesCreated,
        loads_created: result.loadsCreated,
        stops_created: result.stopsCreated,
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
