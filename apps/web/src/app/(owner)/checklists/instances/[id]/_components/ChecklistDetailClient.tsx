'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
  CheckCircle2,
  XCircle,
  Minus,
  Loader2,
  Circle,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  AlertTriangle,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getSignedPhotoUrl } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SKIPPED';
type InstanceStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

type StepSnap = {
  name?: string;
  playbookPhase?: string;
  assigneeRole?: string;
  isDispatchBlocker?: boolean;
  stepType?: string;
};

type StepResultData = {
  note?: string;
  formData?: Record<string, unknown>;
  fileUrls?: string[];
  signatureUrl?: string;
  acknowledged?: boolean;
  passOrFail?: string;
};

type StepInstance = {
  id: string;
  status: StepStatus;
  stepSnapshot: unknown;
  assigneeRole: string | null;
  assignedUserId: string | null;
  dueDate: Date | string | null;
  result: unknown;
  skipReason: string | null;
  skippedByUserId: string | null;
  completedAt: Date | string | null;
  updatedAt: Date | string | null;
};

type PlaybookSnap = {
  name?: string;
  entityName?: string;
};

type Instance = {
  id: string;
  status: InstanceStatus;
  entityType: string;
  entityId: string;
  completionPercent: number;
  isDispatchReady: boolean | null;
  playbookSnapshot: unknown;
  stepInstances: StepInstance[];
};

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<string, string> = {
  PRE_START: 'Pre-Start',
  DAY_1: 'Day 1',
  WEEK_1: 'Week 1',
  ONGOING: 'Ongoing',
  NONE: 'General',
};

const PHASE_ORDER: string[] = ['PRE_START', 'DAY_1', 'WEEK_1', 'ONGOING', 'NONE'];

const STATUS_BADGE: Record<InstanceStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  BLOCKED: { label: 'Blocked', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
};

function getEntityProfileLink(entityType: string, entityId: string): string {
  if (entityType === 'DRIVER') return `/drivers/${entityId}`;
  if (entityType === 'VEHICLE') return `/trucks/${entityId}`;
  if (entityType === 'PARTNER') return `/crm/${entityId}`;
  return '#';
}

function formatDueDate(dueDate: Date | string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDueDateOverdue(dueDate: Date | string | null, status: StepStatus): boolean {
  if (!dueDate) return false;
  if (status === 'COMPLETE' || status === 'SKIPPED') return false;
  return new Date(dueDate) < new Date();
}

function StepResultBadge({ result }: { result: unknown }) {
  try {
    const r = result as StepResultData;
    if (r.passOrFail === 'pass') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3" /> Pass
        </span>
      );
    }
    if (r.passOrFail === 'fail') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <XCircle className="w-3 h-3" /> Fail
        </span>
      );
    }
    if (r.formData) return <span className="text-xs text-muted-foreground">Form submitted</span>;
    if (r.signatureUrl) return <span className="text-xs text-muted-foreground">Signed</span>;
    if (r.note) {
      const note = r.note.length > 60 ? r.note.slice(0, 57) + '…' : r.note;
      return <span className="text-xs text-muted-foreground">{note}</span>;
    }
    return <span className="text-xs text-muted-foreground">Completed</span>;
  } catch {
    return null;
  }
}

function getAssigneeLabel(step: StepInstance): string {
  if (step.assignedUserId) return 'Assigned user';
  const roleMap: Record<string, string> = {
    DRIVER: 'Driver',
    ADMIN: 'Admin',
    MECHANIC: 'Mechanic',
    MANAGER: 'Manager',
  };
  const snap = step.stepSnapshot as StepSnap | null;
  const role = step.assigneeRole ?? snap?.assigneeRole ?? '';
  return roleMap[role] ?? role ?? '—';
}

// ---------------------------------------------------------------------------
// Circular progress ring
// ---------------------------------------------------------------------------

function CompletionRing({ percent }: { percent: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width="56" height="56" aria-label={`${Math.round(percent)}% complete`}>
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-muted/30"
      />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all"
        transform="rotate(-90 28 28)"
      />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="currentColor"
        className="fill-foreground"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Step status icon
// ---------------------------------------------------------------------------

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'COMPLETE')
    return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
  if (status === 'FAILED')
    return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
  if (status === 'SKIPPED')
    return <Minus className="w-5 h-5 text-muted-foreground flex-shrink-0" />;
  if (status === 'IN_PROGRESS')
    return <Loader2 className="w-5 h-5 text-yellow-500 animate-spin flex-shrink-0" />;
  return <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />;
}

// ---------------------------------------------------------------------------
// Skip with Reason dialog
// ---------------------------------------------------------------------------

interface SkipDialogProps {
  stepInstanceId: string;
  stepName: string;
  open: boolean;
  onClose: () => void;
  onSkipped: () => void;
}

function SkipDialog({ stepInstanceId, stepName, open, onClose, onSkipped }: SkipDialogProps) {
  const trpc = useTRPC();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const skipMutation = useMutation(
    trpc.workflows.stepInstance.skip.mutationOptions({
      onSuccess: () => {
        onSkipped();
        onClose();
        setReason('');
        setError('');
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    skipMutation.mutate({ stepInstanceId, reason: reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setReason(''); setError(''); } }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Skip with Reason</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Skipping: <span className="font-medium text-foreground">{stepName}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="skip-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="skip-reason"
              placeholder="Explain why this task is being skipped…"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(''); }}
              rows={3}
              maxLength={500}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          {skipMutation.isError && (
            <p className="text-xs text-destructive">
              {skipMutation.error?.message ?? 'Failed to skip. Please try again.'}
            </p>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={skipMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={skipMutation.isPending}>
              {skipMutation.isPending ? 'Skipping…' : 'Skip Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Approve (mechanic sign-off) dialog
// ---------------------------------------------------------------------------

interface ApproveDialogProps {
  stepInstanceId: string;
  stepName: string;
  open: boolean;
  onClose: () => void;
  onApproved: () => void;
}

function ApproveDialog({ stepInstanceId, stepName, open, onClose, onApproved }: ApproveDialogProps) {
  const trpc = useTRPC();
  const [note, setNote] = useState('');

  const approveMutation = useMutation(
    trpc.workflows.stepInstance.approve.mutationOptions({
      onSuccess: () => {
        onApproved();
        onClose();
        setNote('');
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    approveMutation.mutate({ stepInstanceId, note: note.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setNote(''); } }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Approve Repair Sign-off</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Approving: <span className="font-medium text-foreground">{stepName}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Note (optional)</Label>
            <Textarea
              id="approve-note"
              placeholder="Add approval notes…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {approveMutation.isError && (
            <p className="text-xs text-destructive">
              {approveMutation.error?.message ?? 'Failed to approve. Please try again.'}
            </p>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={approveMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View Result sheet
// ---------------------------------------------------------------------------

function ResultSheet({ result, open, onClose }: { result: unknown; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Task Result</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap break-words">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// View Issue modal
// ---------------------------------------------------------------------------

function ViewIssueModal({
  step,
  open,
  onClose,
}: {
  step: StepInstance | null;
  open: boolean;
  onClose: () => void;
}) {
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const snap = (step?.stepSnapshot ?? {}) as StepSnap;
  const stepName = snap.name ?? 'Inspection Step';
  const result = step?.result as { photoUrls?: string[]; note?: string } | null;
  const photoPath = result?.photoUrls?.[0] ?? null;
  const note = result?.note ?? null;
  const timestamp = step?.completedAt
    ? format(new Date(step.completedAt as string), 'MMM d, yyyy h:mm a')
    : null;

  useEffect(() => {
    if (!open || !photoPath) {
      setSignedPhotoUrl(null);
      return;
    }
    setPhotoLoading(true);
    getSignedPhotoUrl(photoPath)
      .then((url) => setSignedPhotoUrl(url))
      .catch(() => null)
      .finally(() => setPhotoLoading(false));
  }, [open, photoPath]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <XCircle className="h-5 w-5" />
            Inspection Failure
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Step</p>
            <p className="text-sm font-medium">{stepName}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-xs">
              Failed
            </Badge>
            {timestamp && (
              <span className="text-xs text-muted-foreground">{timestamp}</span>
            )}
          </div>

          {note && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{note}</p>
            </div>
          )}

          {photoPath && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Photo</p>
              {photoLoading ? (
                <div className="h-48 bg-muted rounded-lg flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : signedPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedPhotoUrl}
                  alt="Inspection failure photo"
                  className="w-full max-h-64 object-contain rounded-lg border border-border"
                />
              ) : (
                <div className="h-16 bg-muted rounded-lg flex items-center justify-center text-sm text-muted-foreground">
                  Photo unavailable
                </div>
              )}
            </div>
          )}

          {!note && !photoPath && (
            <p className="text-sm text-muted-foreground">No additional details were submitted.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step row
// ---------------------------------------------------------------------------

interface StepRowProps {
  step: StepInstance;
  onSkip: (stepId: string, stepName: string) => void;
  onApprove: (stepId: string, stepName: string) => void;
  onViewResult: (result: unknown) => void;
  onViewIssue: (step: StepInstance) => void;
}

function StepRow({ step, onSkip, onApprove, onViewResult, onViewIssue }: StepRowProps) {
  const snap = (step.stepSnapshot ?? {}) as StepSnap;
  const stepName = snap.name ?? 'Unnamed Task';
  const assignee = getAssigneeLabel(step);
  const dueDateStr = formatDueDate(step.dueDate);
  const overdue = isDueDateOverdue(step.dueDate, step.status);
  const canSkip = step.status === 'NOT_STARTED' || step.status === 'IN_PROGRESS';
  const isApprovalStep = snap.stepType === 'APPROVAL';

  return (
    <div className="flex items-start gap-3 py-3 px-4 hover:bg-muted/30 rounded-lg transition-colors">
      {/* Status icon */}
      <div className="mt-0.5">
        <StepStatusIcon status={step.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={`text-sm font-medium leading-snug ${step.status === 'SKIPPED' ? 'line-through text-muted-foreground' : ''}`}>
          {stepName}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{assignee}</span>
          {dueDateStr && (
            <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
              Due {dueDateStr}
              {overdue && ' (overdue)'}
            </span>
          )}
          {step.status === 'COMPLETE' && step.result != null && (
            <StepResultBadge result={step.result} />
          )}
          {step.status === 'SKIPPED' && (
            <Badge variant="secondary" className="text-xs">Skipped</Badge>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {step.status === 'NOT_STARTED' && isApprovalStep && (
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onApprove(step.id, stepName)}
          >
            Approve
          </Button>
        )}
        {step.status === 'NOT_STARTED' && !isApprovalStep && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            View Details
          </Button>
        )}
        {step.status === 'COMPLETE' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onViewResult(step.result)}
          >
            View Result
          </Button>
        )}
        {step.status === 'FAILED' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-600 dark:text-red-400"
            onClick={() => onViewIssue(step)}
          >
            View Issue
          </Button>
        )}

        {/* Overflow menu for skip action */}
        {canSkip && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="w-4 h-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-muted-foreground"
                onClick={() => onSkip(step.id, stepName)}
              >
                Skip with Reason
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase section (collapsible)
// ---------------------------------------------------------------------------

interface PhaseSectionProps {
  phaseKey: string;
  steps: StepInstance[];
  onSkip: (stepId: string, stepName: string) => void;
  onApprove: (stepId: string, stepName: string) => void;
  onViewResult: (result: unknown) => void;
  onViewIssue: (step: StepInstance) => void;
}

function PhaseSection({ phaseKey, steps, onSkip, onApprove, onViewResult, onViewIssue }: PhaseSectionProps) {
  const [open, setOpen] = useState(true);
  const completeCount = steps.filter((s) => s.status === 'COMPLETE').length;
  const label = PHASE_LABEL[phaseKey] ?? phaseKey;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors">
          <span>{label} ({completeCount}/{steps.length} complete)</span>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 divide-y divide-border">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} onSkip={onSkip} onApprove={onApprove} onViewResult={onViewResult} onViewIssue={onViewIssue} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface ChecklistDetailClientProps {
  instanceId: string;
}

export function ChecklistDetailClient({ instanceId }: ChecklistDetailClientProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [skipDialog, setSkipDialog] = useState<{ id: string; name: string } | null>(null);
  const [approveDialog, setApproveDialog] = useState<{ id: string; name: string } | null>(null);
  const [resultSheet, setResultSheet] = useState<unknown>(null);
  const [viewIssueStep, setViewIssueStep] = useState<StepInstance | null>(null);

  const { data, isLoading, isError } = useQuery(
    trpc.workflows.instance.get.queryOptions({ id: instanceId }),
  );

  function handleSkipped() {
    void queryClient.invalidateQueries({
      queryKey: trpc.workflows.instance.get.queryKey({ id: instanceId }),
    });
  }

  function handleApproved() {
    void queryClient.invalidateQueries({
      queryKey: trpc.workflows.instance.get.queryKey({ id: instanceId }),
    });
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <AlertTriangle className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Could not load this checklist. It may not exist or you may not have access.
          </p>
          <Link href="/checklists">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Checklists
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const instance = data as unknown as Instance;
  const skippedByUsers = (data as unknown as { skippedByUsers?: Record<string, { fullName: string }> })?.skippedByUsers ?? {};
  const playbookSnap = (instance.playbookSnapshot ?? {}) as PlaybookSnap;
  const playbookName = playbookSnap.name ?? 'Checklist';
  const entityName = playbookSnap.entityName ?? instance.entityType;
  const entityLink = getEntityProfileLink(instance.entityType, instance.entityId);
  const statusInfo = STATUS_BADGE[instance.status] ?? STATUS_BADGE.NOT_STARTED;

  // Group step instances by phase
  const phaseGroups: Record<string, StepInstance[]> = {};
  for (const step of instance.stepInstances) {
    const snap = (step.stepSnapshot ?? {}) as StepSnap;
    const phase = snap.playbookPhase ?? 'NONE';
    if (!phaseGroups[phase]) phaseGroups[phase] = [];
    phaseGroups[phase].push(step);
  }

  // Sort phases in canonical order
  const orderedPhases = PHASE_ORDER.filter((p) => phaseGroups[p]?.length);
  // Add any unexpected phases at end
  const extraPhases = Object.keys(phaseGroups).filter((p) => !PHASE_ORDER.includes(p));

  // Dispatch readiness: find blocker steps not complete
  const blockerSteps = instance.stepInstances.filter((s) => {
    const snap = (s.stepSnapshot ?? {}) as StepSnap;
    return snap.isDispatchBlocker && s.status !== 'COMPLETE' && s.status !== 'SKIPPED';
  });

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/checklists" className="hover:text-foreground transition-colors">
          Checklists
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">{playbookName}</span>
      </nav>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <CompletionRing percent={instance.completionPercent} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href={entityLink}
                  className="text-lg font-semibold hover:underline truncate"
                >
                  {entityName}
                </Link>
                <Badge className={`text-xs px-2 py-0.5 ${statusInfo.className}`}>
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{playbookName}</p>
            </div>
          </div>

          {/* Dispatch readiness banner */}
          <div className="mt-5">
            {instance.isDispatchReady === true ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm font-medium">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                Dispatch Ready
              </div>
            ) : blockerSteps.length > 0 ? (
              <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">Blocked — {blockerSteps.length} {blockerSteps.length === 1 ? 'task' : 'tasks'} required: </span>
                  {blockerSteps
                    .map((s) => ((s.stepSnapshot as StepSnap)?.name ?? 'Unnamed Task'))
                    .join(', ')}
                </span>
              </div>
            ) : (
              <div className="px-4 py-2.5 rounded-lg bg-muted text-muted-foreground text-sm">
                Dispatch readiness not yet determined
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phase sections */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {[...orderedPhases, ...extraPhases].map((phase) => (
            <PhaseSection
              key={phase}
              phaseKey={phase}
              steps={phaseGroups[phase] ?? []}
              onSkip={(id, name) => setSkipDialog({ id, name })}
              onApprove={(id, name) => setApproveDialog({ id, name })}
              onViewResult={(result) => setResultSheet(result)}
              onViewIssue={(step) => setViewIssueStep(step)}
            />
          ))}

          {instance.stepInstances.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks in this checklist.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Audit Log — skip events only (per user decision) */}
      {(() => {
        const skippedSteps = instance.stepInstances.filter(
          (s) => s.status === 'SKIPPED' && s.skippedByUserId,
        );

        if (skippedSteps.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Log</CardTitle>
              <CardDescription>Skip events recorded on this checklist.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {skippedSteps.map((s) => {
                const user = s.skippedByUserId ? skippedByUsers[s.skippedByUserId] : null;
                const userName = user?.fullName ?? 'Unknown';
                const timestamp = s.updatedAt
                  ? format(new Date(s.updatedAt as string), 'MMM d, yyyy h:mm a')
                  : '—';
                const snap = s.stepSnapshot as { name?: string };
                return (
                  <div key={s.id} className="flex flex-col gap-0.5 text-sm border-l-2 border-muted pl-3">
                    <span className="font-medium text-muted-foreground">{snap.name ?? 'Step'}</span>
                    <span>
                      Skipped by <span className="font-medium">{userName}</span>
                      {s.skipReason ? ` — Reason: ${s.skipReason}` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">{timestamp}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {/* Skip dialog */}
      {skipDialog && (
        <SkipDialog
          stepInstanceId={skipDialog.id}
          stepName={skipDialog.name}
          open={!!skipDialog}
          onClose={() => setSkipDialog(null)}
          onSkipped={handleSkipped}
        />
      )}

      {/* Approve dialog */}
      <ApproveDialog
        stepInstanceId={approveDialog?.id ?? ''}
        stepName={approveDialog?.name ?? ''}
        open={approveDialog !== null}
        onClose={() => setApproveDialog(null)}
        onApproved={handleApproved}
      />

      {/* Result sheet */}
      <ResultSheet
        result={resultSheet}
        open={resultSheet !== null}
        onClose={() => setResultSheet(null)}
      />

      {/* View Issue modal */}
      <ViewIssueModal
        step={viewIssueStep}
        open={viewIssueStep !== null}
        onClose={() => setViewIssueStep(null)}
      />
    </div>
  );
}
