/**
 * Phase 11 — the board's status badges.
 *
 * Section 15: *"status = colour + icon + text"*, and Phase 11's verify list
 * makes it concrete — *"thumb over the inspection colour → still readable"*.
 * Every badge here therefore carries an icon AND a word; the tint is the third
 * signal, never the only one. That is also what makes them legible to anyone
 * who cannot separate the red from the green, which is roughly one man in
 * twelve looking at a fleet board.
 *
 * ONE primitive, two registries. `InspectionBadge` and `OnTimeBadge` differ only
 * in which map they read, so there is one component and no shared markup to
 * drift.
 *
 * The words come from `board-constants.ts`, not from here — quick-517: a
 * sentence assembled at its render site is a sentence that gets edited in one
 * of its two homes.
 */

import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { INSPECTION_COPY, ON_TIME_COPY } from '@/lib/carrier/board-constants';
import type { InspectionBadgeState, OnTimeState } from '@/lib/carrier/board-status';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-status-success-bg text-status-success-foreground',
  warning: 'bg-status-warning-bg text-status-warning-foreground',
  danger: 'bg-status-danger-bg text-status-danger-foreground',
  info: 'bg-status-info-bg text-status-info-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

interface BadgeShape {
  tone: Tone;
  icon: LucideIcon;
}

/**
 * Red is reserved. Section 15: *"red only for errors and destructive actions (a
 * failed inspection qualifies, a 'new' badge does not)"*. FAILED is the only
 * inspection state that gets it; defects logged are amber, because the trip may
 * still legally run.
 */
const INSPECTION_SHAPE: Record<InspectionBadgeState, BadgeShape> = {
  PASSED: { tone: 'success', icon: ShieldCheck },
  PASSED_WITH_DEFECTS: { tone: 'warning', icon: ShieldAlert },
  FAILED: { tone: 'danger', icon: ShieldX },
  OVERRIDDEN: { tone: 'info', icon: ShieldAlert },
  IN_PROGRESS: { tone: 'info', icon: Loader2 },
  NOT_STARTED: { tone: 'neutral', icon: CircleDashed },
  NOT_REQUIRED: { tone: 'neutral', icon: CircleSlash },
};

/**
 * `NO_WINDOWS` is deliberately NEUTRAL, never success.
 *
 * On this database 7 of 308 trips carry an appointment window at all, so this
 * is the state most rows land in. Painting it green would tell an owner their
 * day is on track when what it really says is that nobody set any windows —
 * and green is the one colour a person reads without stopping.
 */
const ON_TIME_SHAPE: Record<OnTimeState, BadgeShape> = {
  ON_TRACK: { tone: 'success', icon: CheckCircle2 },
  BEHIND_SCHEDULE: { tone: 'danger', icon: AlertTriangle },
  NO_WINDOWS: { tone: 'neutral', icon: CalendarOff },
  NOT_APPLICABLE: { tone: 'neutral', icon: Clock },
};

interface StateBadgeProps {
  label: string;
  description: string;
  shape: BadgeShape;
  className?: string;
}

function StateBadge({ label, description, shape, className }: StateBadgeProps) {
  const Icon = shape.icon;
  return (
    <span
      role="status"
      // The description, not the label: a screen reader gets the sentence that
      // explains the state rather than the two words that abbreviate it.
      aria-label={description}
      title={description}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASS[shape.tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function InspectionBadge({
  state,
  className,
}: {
  state: InspectionBadgeState;
  className?: string;
}) {
  const copy = INSPECTION_COPY[state];
  return (
    <StateBadge
      label={copy.label}
      description={`Inspection: ${copy.description}`}
      shape={INSPECTION_SHAPE[state]}
      className={className}
    />
  );
}

export function OnTimeBadge({ state, className }: { state: OnTimeState; className?: string }) {
  const copy = ON_TIME_COPY[state];
  return (
    <StateBadge
      label={copy.label}
      description={copy.description}
      shape={ON_TIME_SHAPE[state]}
      className={className}
    />
  );
}
