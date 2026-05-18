import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';
import { TaskCompletionClient } from './task-completion-client';
import { AuditTrailFooter } from '@/components/audit-trail-footer';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormField = {
  id?: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

type StepSnap = {
  name?: string;
  stepType?: string;
  assigneeRole?: string;
  description?: string;
  defaultConfig?: {
    instructions?: string;
    formSchema?: FormField[];
    requiresPhoto?: boolean;
  };
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

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETE: 'Completed',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

const STATUS_CLASSES: Record<string, string> = {
  NOT_STARTED: 'bg-muted text-muted-foreground border-border',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  COMPLETE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  FAILED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  SKIPPED: 'bg-muted text-muted-foreground border-border',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  DRIVER: 'Driver Profile',
  VEHICLE: 'Vehicle',
  DISPATCH: 'Dispatch',
  PARTNER: 'Partner',
  OTHER: 'Other',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverTaskDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  let task: Awaited<ReturnType<typeof fetchTask>> = null;
  let stepAudit: { creator: { firstName: string | null; lastName: string | null; email: string } | null; createdAt: Date; updatedAt: Date } | null = null;
  try {
    [task, stepAudit] = await Promise.all([
      fetchTask(id, session.userId, session.tenantId),
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.stepInstance.findFirst({
          where: { id },
          select: {
            creator: { select: { firstName: true, lastName: true, email: true } },
            createdAt: true,
            updatedAt: true,
          },
        });
      }, TX_OPTIONS).catch(() => null),
    ]);
  } catch (err) {
    logger.error('[DriverTaskDetailPage] Failed to fetch task:', err);
  }

  if (!task) notFound();

  const snap = task.stepSnapshot as StepSnap;
  const playbookSnap = task.playbookInstance.playbookSnapshot as PlaybookSnap;

  const stepName = snap.name ?? 'Unnamed Step';
  const stepType = snap.stepType ?? 'CUSTOM_NOTE';
  const stepTypeLabel = STEP_TYPE_LABELS[stepType] ?? stepType;
  const statusLabel = STATUS_LABELS[task.status] ?? task.status;
  const statusClass = STATUS_CLASSES[task.status] ?? STATUS_CLASSES.NOT_STARTED;
  const playbookName = playbookSnap.name ?? 'Checklist';
  const entityLabel =
    ENTITY_TYPE_LABELS[task.playbookInstance.entityType] ?? task.playbookInstance.entityType;
  const instructions = snap.defaultConfig?.instructions;
  const description = snap.description;

  return (
    <div className="space-y-6 max-w-lg">
      {/* Back */}
      <Link
        href="/tasks"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start gap-2 flex-wrap">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground leading-tight flex-1 min-w-0">
            {stepName}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <Badge variant="secondary" className="text-xs">
              {stepTypeLabel}
            </Badge>
            <Badge className={`text-xs border ${statusClass}`}>
              {statusLabel}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {playbookName} &middot; {entityLabel}
        </p>
        {task.dueDate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            Due {format(new Date(task.dueDate), 'MMMM d, yyyy')}
          </p>
        )}
      </div>

      {/* Instructions / description */}
      {(instructions || description) && (
        <div className="rounded-lg bg-muted/60 border border-border px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Instructions
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {instructions ?? description}
          </p>
        </div>
      )}

      {/* Completion section */}
      <TaskCompletionClient
        stepInstanceId={task.id}
        stepType={stepType}
        status={task.status}
        defaultConfig={snap.defaultConfig ?? {}}
      />

      {stepAudit && (
        <AuditTrailFooter
          createdAt={stepAudit.createdAt}
          createdByName={stepAudit.creator ? `${stepAudit.creator.firstName ?? ''} ${stepAudit.creator.lastName ?? ''}`.trim() || null : null}
          createdByEmail={stepAudit.creator?.email ?? null}
          updatedAt={stepAudit.updatedAt}
          updatedByName={null}
          updatedByEmail={null}
        />
      )}
    </div>
  );
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchTask(stepInstanceId: string, userId: string, tenantId: string) {
  /**
   * @bypass_rls reason: driver-server-component
   * WHY: Server component uses Supabase session auth. StepInstance requires bypass_rls.
   * SCOPE: Scoped to session.tenantId + session.userId (or role-assigned DRIVER steps).
   * SAFETY: Gated by driver layout auth check.
   */
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    return tx.stepInstance.findFirst({
      where: {
        id: stepInstanceId,
        AND: [
          { playbookInstance: { tenantId } },
          {
            OR: [
              { assignedUserId: userId },
              { assigneeRole: 'DRIVER', assignedUserId: null },
            ],
          },
        ],
      },
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
