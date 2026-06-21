'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AlertBadge — Compliance/alert indicator with icon + text.
 *
 * Design rules:
 * - Always pairs color with icon (accessibility requirement)
 * - Never uses color alone to convey meaning
 * - Tinted background with full-strength text
 * - Red is only for errors/danger, never decorative
 *
 * @example
 * <AlertBadge variant="warning">Insurance expires in 3 days</AlertBadge>
 * <AlertBadge variant="danger" icon={AlertCircle}>Registration expired</AlertBadge>
 * <AlertBadge variant="success">All documents valid</AlertBadge>
 */

const alertBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        danger: 'bg-status-danger-bg text-status-danger-foreground',
        warning: 'bg-status-warning-bg text-status-warning-foreground',
        success: 'bg-status-success-bg text-status-success-foreground',
        info: 'bg-status-info-bg text-status-info-foreground',
        neutral: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

const defaultIcons: Record<string, LucideIcon> = {
  danger: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle,
  info: Info,
  neutral: Clock,
};

export interface AlertBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertBadgeVariants> {
  /** Custom icon (overrides default for variant) */
  icon?: LucideIcon;
  /** Badge content */
  children: React.ReactNode;
}

export function AlertBadge({
  variant = 'neutral',
  icon,
  children,
  className,
  ...props
}: AlertBadgeProps) {
  const Icon = icon ?? defaultIcons[variant ?? 'neutral'];

  return (
    <div
      className={cn(alertBadgeVariants({ variant }), className)}
      role="status"
      {...props}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Utility to determine alert variant based on days until expiry.
 *
 * @example
 * const variant = getExpiryVariant(daysUntilExpiry);
 * <AlertBadge variant={variant}>...</AlertBadge>
 */
export function getExpiryVariant(
  daysUntilExpiry: number | null
): 'danger' | 'warning' | 'success' | 'neutral' {
  if (daysUntilExpiry === null) return 'neutral';
  if (daysUntilExpiry < 0) return 'danger';
  if (daysUntilExpiry <= 30) return 'warning';
  return 'success';
}

/**
 * Formats expiry message based on days remaining.
 *
 * @example
 * const message = formatExpiryMessage(-5);  // "Expired 5 days ago"
 * const message = formatExpiryMessage(10);  // "Expires in 10 days"
 */
export function formatExpiryMessage(daysUntilExpiry: number | null): string {
  if (daysUntilExpiry === null) return 'No expiry set';
  if (daysUntilExpiry < 0) {
    const days = Math.abs(daysUntilExpiry);
    return `Expired ${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (daysUntilExpiry === 0) return 'Expires today';
  return `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`;
}
