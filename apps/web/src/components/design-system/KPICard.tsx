'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * KPICard — Presentational card displaying a key metric.
 *
 * Design rules:
 * - Number is prominent (text-2xl font-bold)
 * - Label is secondary (text-xs text-muted-foreground)
 * - Icon provides context
 * - Optional trend indicator (up/down/neutral)
 * - No data fetching inside — purely presentational
 *
 * @example
 * <KPICard
 *   label="Loads This Week"
 *   value={42}
 *   icon={Package}
 *   trend={{ direction: 'up', label: '+12% vs last week' }}
 * />
 */

export interface KPITrend {
  direction: 'up' | 'down' | 'neutral';
  label: string;
}

export interface KPICardProps {
  /** Metric label */
  label: string;
  /** Metric value (number or formatted string) */
  value: string | number;
  /** Icon component */
  icon: LucideIcon;
  /** Optional trend indicator */
  trend?: KPITrend;
  /** Click handler (makes card interactive) */
  onClick?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  onClick,
  loading = false,
  className,
}: KPICardProps) {
  const isInteractive = Boolean(onClick);

  const content = (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-xs font-medium">{label}</span>
      </div>

      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {value}
        </p>
      )}

      {trend && !loading && (
        <div className="flex items-center gap-1">
          <TrendIcon direction={trend.direction} />
          <span
            className={cn(
              'text-xs',
              trend.direction === 'up' && 'text-status-success-foreground',
              trend.direction === 'down' && 'text-status-danger-foreground',
              trend.direction === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trend.label}
          </span>
        </div>
      )}
    </>
  );

  const baseClasses = cn(
    'rounded-lg border border-border bg-card p-4 flex flex-col gap-2',
    isInteractive && [
      'cursor-pointer',
      'transition-all duration-fast',
      'hover:border-primary/20 hover:shadow-2',
      'active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    ],
    className
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        className={baseClasses}
        onClick={onClick}
        aria-label={`${label}: ${value}${trend ? `, ${trend.label}` : ''}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClasses} aria-label={`${label}: ${value}`}>
      {content}
    </div>
  );
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  const icons = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  };
  const colors = {
    up: 'text-status-success-foreground',
    down: 'text-status-danger-foreground',
    neutral: 'text-muted-foreground',
  };

  const Icon = icons[direction];
  return <Icon className={cn('h-3 w-3', colors[direction])} strokeWidth={1.5} />;
}

/**
 * KPICardGrid — Responsive grid layout for KPI cards.
 *
 * @example
 * <KPICardGrid>
 *   <KPICard ... />
 *   <KPICard ... />
 *   <KPICard ... />
 *   <KPICard ... />
 * </KPICardGrid>
 */
export function KPICardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {children}
    </div>
  );
}
