/**
 * StatusBadge Component (DriveCommand Brand)
 *
 * THE SINGLE source of truth for all grid badges.
 * Brand pattern: semantic tint bg (12% opacity) + full-strength text color
 * JetBrains Mono uppercase label — the signature data treatment.
 * Square-ish corners (4px) — "we move freight, not pillows"
 */

import { cn } from '@/lib/utils';

export type StatusBadgeVariant =
  | 'success'    // On-Time / Active — #22C07A
  | 'warning'    // At-Risk — #F5B841
  | 'danger'     // Delayed / Expired — #FF3B30
  | 'info'       // In-Transit — #0A21C0
  | 'delivered'  // Delivered — #2BB5A5
  | 'neutral'    // Scheduled — #64748B
  | 'unassigned' // Unassigned — #050A44
  | 'detention'  // Detention — #8C6FFF
  | 'purple';    // Legacy alias for detention

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * Maps trucking status strings to badge variants.
 * Use this to convert API status values to badge variants.
 *
 * @example
 * const variant = getStatusVariant(load.status); // "on_time" → "success"
 * <StatusBadge variant={variant}>{load.status}</StatusBadge>
 */
export function getStatusVariant(status: string): StatusBadgeVariant {
  const normalized = status.toLowerCase().replace(/[_-]/g, '');

  const map: Record<string, StatusBadgeVariant> = {
    // Success states
    active: 'success',
    ontime: 'success',
    on_time: 'success',
    completed: 'success',
    approved: 'success',
    ready: 'success',

    // Warning states
    pending: 'warning',
    atrisk: 'warning',
    at_risk: 'warning',
    expiring: 'warning',
    late: 'warning',

    // Danger states
    inactive: 'danger',
    delayed: 'danger',
    expired: 'danger',
    overdue: 'danger',
    cancelled: 'danger',
    failed: 'danger',
    outofservice: 'danger',
    out_of_service: 'danger',

    // Warning states (truck maintenance)
    maintenance: 'warning',

    // Info states (in-transit)
    intransit: 'info',
    in_transit: 'info',
    inprogress: 'info',
    in_progress: 'info',
    dispatched: 'info',
    enroute: 'info',

    // Delivered
    delivered: 'delivered',
    pod: 'delivered',
    picked_up: 'delivered',

    // Scheduled/neutral
    scheduled: 'neutral',
    draft: 'neutral',
    paused: 'neutral',

    // Unassigned
    unassigned: 'unassigned',
    open: 'unassigned',
    available: 'unassigned',

    // Detention
    detention: 'detention',
    waiting: 'detention',
    held: 'detention',
  };

  return map[normalized] || 'neutral';
}

/**
 * StatusBadge displays a colored badge with brand-aligned styling.
 *
 * Design (DriveCommand Brand):
 * - Typography: JetBrains Mono, text-xs (11px), font-medium, uppercase, tracking-wide
 * - Background: semantic color at 12% opacity
 * - Text: full-strength semantic color
 * - Shape: 4px radius (square-ish — brand rule)
 * - Spacing: px-2 py-0.5
 *
 * Status chips are the ONE place semantic color appears.
 * Everything else in the grid is monochrome.
 *
 * @example
 * <StatusBadge variant="success">Active</StatusBadge>
 * <StatusBadge variant="warning">At Risk</StatusBadge>
 * <StatusBadge variant="danger">Delayed</StatusBadge>
 * <StatusBadge variant="info">In Transit</StatusBadge>
 */
export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  // Map purple to detention for backwards compatibility
  const resolvedVariant = variant === 'purple' ? 'detention' : variant;

  return (
    <span
      className={cn(
        // Layout
        'inline-flex items-center justify-center',
        // Typography: JetBrains Mono (brand signature)
        'font-mono text-[11px] font-medium uppercase tracking-wide',
        // Spacing
        'px-2 py-0.5',
        // Shape: 4px radius (square-ish, brand rule)
        'rounded',
        // Variant styles
        variantStyles[resolvedVariant],
        className
      )}
      style={{
        fontFamily: "var(--grid-font-data, 'JetBrains Mono', monospace)",
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Variant styles using CSS custom properties from grid-tokens.css
 * Pattern: bg at 12% opacity + full-strength text
 */
const variantStyles: Record<StatusBadgeVariant, string> = {
  success: 'bg-[var(--grid-status-success-bg)] text-[var(--grid-status-success)]',
  warning: 'bg-[var(--grid-status-warning-bg)] text-[var(--grid-status-warning)]',
  danger: 'bg-[var(--grid-status-danger-bg)] text-[var(--grid-status-danger)]',
  info: 'bg-[var(--grid-status-info-bg)] text-[var(--grid-status-info)]',
  delivered: 'bg-[var(--grid-status-delivered-bg)] text-[var(--grid-status-delivered)]',
  neutral: 'bg-[var(--grid-status-neutral-bg)] text-[var(--grid-status-neutral)]',
  unassigned: 'bg-[var(--grid-status-unassigned-bg)] text-[var(--grid-status-unassigned)]',
  detention: 'bg-[var(--grid-status-detention-bg)] text-[var(--grid-status-detention)]',
  purple: 'bg-[var(--grid-status-detention-bg)] text-[var(--grid-status-detention)]', // Alias
};
