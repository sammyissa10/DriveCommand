'use client';

import { useTransition } from 'react';

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
        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
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
        className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isPending ? 'Updating...' : 'Complete Route'}
      </button>
    );
  }

  if (currentStatus === 'COMPLETED') {
    return (
      <p className="text-sm text-gray-600">
        <span className="mr-1">✓</span>
        Route completed
      </p>
    );
  }

  return null;
}
