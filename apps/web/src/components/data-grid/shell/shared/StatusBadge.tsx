/**
 * StatusBadge Component
 *
 * THE SINGLE source of truth for all grid badges.
 * Tinted background + full-color text pattern (NEVER solid fill).
 */

import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

/**
 * StatusBadge displays a colored badge with tinted background pattern.
 *
 * Design: Tinted bg + full-color text (Vercel/Apple aesthetic)
 * Typography: text-xs font-medium (Inter 500)
 * Spacing: px-2 py-0.5
 * Shape: rounded-md pill
 *
 * @example
 * <StatusBadge variant="success">Active</StatusBadge>
 * <StatusBadge variant="warning">Pending</StatusBadge>
 * <StatusBadge variant="danger">Expired</StatusBadge>
 */
export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  const variantStyles = {
    success: 'bg-status-success-bg text-status-success-foreground',
    warning: 'bg-status-warning-bg text-status-warning-foreground',
    danger: 'bg-status-danger-bg text-status-danger-foreground',
    info: 'bg-status-info-bg text-status-info-foreground',
    purple: 'bg-status-purple-bg text-status-purple-foreground',
    neutral: 'bg-muted text-muted-foreground',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'text-xs font-medium',
        'px-2 py-0.5',
        'rounded-md',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
