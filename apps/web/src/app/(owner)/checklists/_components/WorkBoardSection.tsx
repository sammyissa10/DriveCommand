'use client';

import Link from 'next/link';
import { CheckCircle2, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** Matches the shape returned by instance.list (stepInstances partial select) */
export type InstanceListItem = {
  id: string;
  status: string;
  entityType: string;
  entityId: string;
  completionPercent: number;
  completedAt: Date | string | null;
  playbookSnapshot: unknown;
  stepInstances: Array<{
    id: string;
    status: string;
    dueDate: Date | string | null;
    stepSnapshot?: unknown;
  }>;
};

type BucketKey = 'attention' | 'progress' | 'completed';

function classifyInstance(instance: InstanceListItem): BucketKey | null {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  if (instance.status === 'BLOCKED') return 'attention';

  if (instance.status === 'COMPLETED') {
    return instance.completedAt && new Date(instance.completedAt) >= todayMidnight
      ? 'completed'
      : null;
  }

  // NOT_STARTED and IN_PROGRESS are both "active" — show on the board.
  // Route to 'attention' if any step is overdue, otherwise 'progress'.
  if (instance.status === 'IN_PROGRESS' || instance.status === 'NOT_STARTED') {
    const now = new Date();
    const hasOverdue = instance.stepInstances.some(
      (s) =>
        s.status !== 'COMPLETE' &&
        s.status !== 'SKIPPED' &&
        s.dueDate != null &&
        new Date(s.dueDate) < now,
    );
    return hasOverdue ? 'attention' : 'progress';
  }

  return null;
}

function getNextStepLabel(instance: InstanceListItem): string | null {
  const next = instance.stepInstances.find(
    (s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS',
  );
  if (!next) return null;
  const snap = (next.stepSnapshot as { name?: string } | undefined);
  return snap?.name ?? null;
}

function getEntityLink(entityType: string, entityId: string): string {
  if (entityType === 'DRIVER') return `/drivers/${entityId}`;
  if (entityType === 'VEHICLE') return `/trucks/${entityId}`;
  if (entityType === 'PARTNER') return `/crm/${entityId}`;
  return '#';
}

function getEntityLabel(entityType: string): string {
  if (entityType === 'DRIVER') return 'Driver';
  if (entityType === 'VEHICLE') return 'Vehicle';
  if (entityType === 'PARTNER') return 'Partner';
  if (entityType === 'DISPATCH') return 'Dispatch';
  return entityType;
}

function getPlaybookName(instance: InstanceListItem): string {
  const snap = instance.playbookSnapshot as unknown as { name?: string } | null;
  return snap?.name ?? 'Checklist';
}

function getEntityName(instance: InstanceListItem): string {
  const snap = instance.playbookSnapshot as unknown as { entityName?: string } | null;
  return snap?.entityName ?? getEntityLabel(instance.entityType);
}

// Circular progress indicator using SVG
function CircularProgress({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width="44" height="44" className="flex-shrink-0" aria-hidden>
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-muted/30"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all"
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="26"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fill="currentColor"
        className="fill-foreground"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

interface InstanceCardProps {
  instance: InstanceListItem;
  bucket: BucketKey;
}

function InstanceCard({ instance, bucket }: InstanceCardProps) {
  const borderColor =
    bucket === 'attention'
      ? 'border-l-4 border-l-red-500'
      : bucket === 'progress'
        ? 'border-l-4 border-l-yellow-500'
        : 'border-l-4 border-l-green-500';

  const nextStep = getNextStepLabel(instance);
  const entityLink = getEntityLink(instance.entityType, instance.entityId);
  const playbookName = getPlaybookName(instance);
  const entityName = getEntityName(instance);

  return (
    <Card className={`${borderColor} transition-shadow hover:shadow-md`}>
      <CardContent className="p-4 space-y-3">
        {/* Entity + playbook */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={entityLink}
              className="text-sm font-semibold hover:underline line-clamp-1"
            >
              {entityName}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{playbookName}</p>
          </div>
          <CircularProgress percent={instance.completionPercent} />
        </div>

        {/* Next / overdue step label */}
        {nextStep && (
          <p className="text-xs text-muted-foreground truncate">
            {bucket === 'attention' ? (
              <span className="text-red-600 dark:text-red-400 font-medium">Overdue: </span>
            ) : (
              'Next: '
            )}
            {nextStep}
          </p>
        )}

        {/* Status badge + action */}
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={
              bucket === 'attention'
                ? 'border-red-300 text-red-700 dark:text-red-400 text-xs'
                : bucket === 'completed'
                  ? 'border-green-300 text-green-700 dark:text-green-400 text-xs'
                  : 'border-yellow-300 text-yellow-700 dark:text-yellow-400 text-xs'
            }
          >
            {bucket === 'attention' && <AlertCircle className="w-3 h-3 mr-1" />}
            {bucket === 'progress' && <Clock className="w-3 h-3 mr-1" />}
            {bucket === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {bucket === 'attention' ? 'Needs Attention' : bucket === 'progress' ? 'In Progress' : 'Done'}
          </Badge>
          <Link href={`/checklists/instances/${instance.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
              View Checklist
              <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface SwimlaneColumnProps {
  title: string;
  bucket: BucketKey;
  instances: InstanceListItem[];
}

function SwimlaneColumn({ title, bucket, instances }: SwimlaneColumnProps) {
  const headerColor =
    bucket === 'attention'
      ? 'text-red-600 dark:text-red-400'
      : bucket === 'progress'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400';

  return (
    <div className="flex flex-col min-w-0 h-full">
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`text-sm font-semibold ${headerColor}`}>{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {instances.length}
        </span>
      </div>
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[calc(100vh-260px)] pr-1">
        {instances.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Nothing here</p>
        ) : (
          instances.map((inst) => (
            <InstanceCard key={inst.id} instance={inst} bucket={bucket} />
          ))
        )}
      </div>
    </div>
  );
}

interface WorkBoardSectionProps {
  instances: InstanceListItem[];
  isLoading: boolean;
}

export function WorkBoardSection({ instances, isLoading }: WorkBoardSectionProps) {
  const attention: InstanceListItem[] = [];
  const progress: InstanceListItem[] = [];
  const completed: InstanceListItem[] = [];

  for (const inst of instances) {
    const bucket = classifyInstance(inst);
    if (bucket === 'attention') attention.push(inst);
    else if (bucket === 'progress') progress.push(inst);
    else if (bucket === 'completed') completed.push(inst);
  }

  const hasAny = attention.length > 0 || progress.length > 0 || completed.length > 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-28 rounded bg-muted animate-pulse" />
            <div className="h-28 rounded-lg bg-muted animate-pulse" />
            <div className="h-28 rounded-lg bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="flex items-center justify-center py-10 mb-8 border border-dashed rounded-lg text-sm text-muted-foreground">
        When you start a checklist, it&apos;ll show up here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-stretch">
      <SwimlaneColumn title="Needs Attention" bucket="attention" instances={attention} />
      <SwimlaneColumn title="In Progress" bucket="progress" instances={progress} />
      <SwimlaneColumn title="Completed Today" bucket="completed" instances={completed} />
    </div>
  );
}
