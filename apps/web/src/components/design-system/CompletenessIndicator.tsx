'use client';

import * as React from 'react';
import { X, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * CompletenessIndicator — Optional/dismissible progress indicator for forms.
 *
 * Design rules:
 * - Shows percentage of fields completed
 * - Never blocks saving or nags the user
 * - Can be dismissed and stays dismissed
 * - Uses success color at 100%, neutral otherwise
 *
 * @example
 * <CompletenessIndicator
 *   completed={5}
 *   total={8}
 *   onDismiss={() => setShowIndicator(false)}
 * />
 */

export interface CompletenessIndicatorProps {
  /** Number of completed/filled fields */
  completed: number;
  /** Total number of fields being tracked */
  total: number;
  /** Handler when dismissed */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

export function CompletenessIndicator({
  completed,
  total,
  onDismiss,
  className,
}: CompletenessIndicatorProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isComplete = percentage === 100;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg',
        'bg-muted/50 border border-border',
        'sticky top-0 z-10 backdrop-blur-sm bg-muted/80',
        className
      )}
    >
      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
            {isComplete ? (
              <>
                <CheckCircle className="h-4 w-4 text-status-success-foreground" />
                Profile complete
              </>
            ) : (
              'Profile completeness'
            )}
          </span>
          <span
            className={cn(
              'text-sm tabular-nums',
              isComplete
                ? 'text-status-success-foreground font-medium'
                : 'text-muted-foreground'
            )}
          >
            {percentage}%
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              isComplete ? 'bg-status-success-foreground' : 'bg-primary'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {!isComplete && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {completed} of {total} fields filled • Optional
          </p>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'p-1.5 rounded-md',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted',
            'transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label="Dismiss completeness indicator"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
