/**
 * ErrorState Component
 *
 * Error state display for grid data fetching failures.
 * Red accent via status-danger tokens.
 */

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** Error object or message */
  error?: Error | string;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ErrorState displays error information with optional retry action.
 *
 * Design: Centered layout with alert icon, title, description, retry button
 * Icon: AlertCircle with strokeWidth={1.5}
 * Colors: Red accent via status-danger tokens
 *
 * @example
 * <ErrorState error={error} onRetry={refetch} />
 */
export function ErrorState({
  error,
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  // Extract error message
  const errorMessage =
    typeof error === 'string'
      ? error
      : error?.message || 'An unexpected error occurred';

  const finalDescription = description || errorMessage;

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      {/* Error icon */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-status-danger-bg">
        <AlertCircle
          className="h-5 w-5 text-status-danger-foreground"
          strokeWidth={1.5}
        />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>

      {/* Description */}
      <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
        {finalDescription}
      </p>

      {/* Retry button */}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}
