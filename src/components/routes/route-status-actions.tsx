'use client';

import { useTransition } from 'react';
import { Play, CheckCircle } from 'lucide-react';

interface RouteStatusActionsProps {
  routeId: string;
  currentStatus: string;
  updateStatusAction: (routeId: string, newStatus: string) => Promise<any>;
}

export function RouteStatusActions({
  routeId,
  currentStatus,
  updateStatusAction,
}: RouteStatusActionsProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusUpdate = (newStatus: string, confirmMessage: string) => {
    if (window.confirm(confirmMessage)) {
      startTransition(async () => {
        await updateStatusAction(routeId, newStatus);
      });
    }
  };

  if (currentStatus === 'PLANNED') {
    return (
      <button
        onClick={() =>
          handleStatusUpdate(
            'IN_PROGRESS',
            'Start this route? Status will change to In Progress.'
          )
        }
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Play className="h-4 w-4" />
        {isPending ? 'Updating...' : 'Start Route'}
      </button>
    );
  }

  if (currentStatus === 'IN_PROGRESS') {
    return (
      <button
        onClick={() =>
          handleStatusUpdate(
            'COMPLETED',
            'Complete this route? This action cannot be undone.'
          )
        }
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <CheckCircle className="h-4 w-4" />
        {isPending ? 'Updating...' : 'Complete Route'}
      </button>
    );
  }

  if (currentStatus === 'COMPLETED') {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-emerald-500" />
        Route completed
      </p>
    );
  }

  return null;
}
