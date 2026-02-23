'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface StatusUpdateButtonProps {
  loadId: string;
  currentStatus: string;
  updateStatusAction: (id: string, newStatus: string) => Promise<any>;
}

const NEXT_STATUS: Record<string, { status: string; label: string }> = {
  DISPATCHED: { status: 'PICKED_UP', label: 'Mark Picked Up' },
  PICKED_UP: { status: 'IN_TRANSIT', label: 'Mark In Transit' },
  IN_TRANSIT: { status: 'DELIVERED', label: 'Mark Delivered' },
  DELIVERED: { status: 'INVOICED', label: 'Mark Invoiced' },
};

const NON_CANCELLABLE = new Set(['DELIVERED', 'INVOICED', 'CANCELLED', 'PENDING']);

export function StatusUpdateButton({ loadId, currentStatus, updateStatusAction }: StatusUpdateButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[currentStatus];
  const canCancel = !NON_CANCELLABLE.has(currentStatus);

  async function handleProgress() {
    if (!next) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await updateStatusAction(loadId, next.status);
      if (result?.error) {
        setError(typeof result.error === 'string' ? result.error : 'Failed to update status.');
        setIsPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to update status.');
    }
    setIsPending(false);
  }

  async function handleCancel() {
    if (!window.confirm('Are you sure you want to cancel this load?')) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await updateStatusAction(loadId, 'CANCELLED');
      if (result?.error) {
        setError(typeof result.error === 'string' ? result.error : 'Failed to cancel load.');
        setIsPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to cancel load.');
    }
    setIsPending(false);
  }

  if (!next && !canCancel) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {next && (
        <button
          onClick={handleProgress}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Updating...' : next.label}
        </button>
      )}
      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
        >
          Cancel Load
        </button>
      )}
    </div>
  );
}
