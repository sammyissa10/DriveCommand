'use client';

/**
 * ErrorState - Error state component for DataGrid.
 *
 * Shows error message with retry button.
 */

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  /** Error object or message */
  error: Error | string;
  /** Callback when "Try again" is clicked */
  onRetry?: () => void;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ErrorState({
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 mb-4">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        Something went wrong
      </h3>
      <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
        {errorMessage}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
