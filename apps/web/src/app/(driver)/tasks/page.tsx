import Link from 'next/link';
import { CheckCircle2, ClipboardList, ChevronRight, Calendar } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

// ─── Snapshot types ───────────────────────────────────────────────────────────

type StepSnap = {
  name?: string;
  stepType?: string;
};

type PlaybookSnap = {
  name?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_TYPE_LABELS: Record<string, string> = {
  DOCUMENT_UPLOAD: 'Document',
  FORM_FILL: 'Form',
  INSPECTION_ITEM: 'Inspection',
  SIGNATURE: 'Signature',
  TRAINING_ACK: 'Training',
  APPROVAL: 'Approval',
  THIRD_PARTY: 'Third Party',
  CUSTOM_NOTE: 'Note',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  DRIVER: 'Driver Profile',
  VEHICLE: 'Vehicle',
  DISPATCH: 'Dispatch',
  PARTNER: 'Partner',
  OTHER: 'Other',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DriverTasksPage() {
  const session = await getSession();

  let tasks: Awaited<ReturnType<typeof fetchDriverTasks>> = [];

  try {
    if (session) {
      tasks = await fetchDriverTasks(session.userId, session.tenantId);
    }
  } catch (err) {
    logger.error('[DriverTasksPage] Failed to fetch step instances:', err);
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Tasks</h1>
          <p className="mt-1 text-muted-foreground text-sm">Your open checklist items</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">You&apos;re all caught up.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No open tasks assigned to you right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Tasks</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {tasks.length} open task{tasks.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {tasks.map((task) => {
          const snap = task.stepSnapshot as StepSnap;
          const playbookSnap = task.playbookInstance.playbookSnapshot as PlaybookSnap;
          const stepName = snap.name ?? 'Unnamed Step';
          const stepType = snap.stepType ? (STEP_TYPE_LABELS[snap.stepType] ?? snap.stepType) : null;
          const playbookName = playbookSnap.name ?? 'Unknown Checklist';
          const entityLabel =
            ENTITY_TYPE_LABELS[task.playbookInstance.entityType] ??
            task.playbookInstance.entityType;

          return (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-center gap-4 bg-card rounded-lg border border-border px-4 py-3 min-h-[68px] hover:bg-muted/50 active:scale-[0.99] transition-all group"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0 bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground truncate">{stepName}</p>
                  {stepType && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                      {stepType}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {playbookName} &middot; {entityLabel}
                </p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3 shrink-0" />
                    Due {format(new Date(task.dueDate), 'MMM d, yyyy')}
                  </p>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchDriverTasks(userId: string, tenantId: string) {
  /**
   * @bypass_rls reason: driver-server-component
   * WHY: Server component uses Supabase session auth, not the RLS-scoped tenant
   *      connection. StepInstance requires bypass_rls for server-side reads.
   * SCOPE: Returns only StepInstances assigned to session.userId within session.tenantId.
   * SAFETY: Gated by driver layout auth check (getSession + role guard).
   */
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    return tx.stepInstance.findMany({
      where: {
        assignedUserId: userId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        playbookInstance: { tenantId },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        playbookInstance: {
          select: {
            id: true,
            entityType: true,
            entityId: true,
            playbookSnapshot: true,
          },
        },
      },
    });
  }, TX_OPTIONS);
}
