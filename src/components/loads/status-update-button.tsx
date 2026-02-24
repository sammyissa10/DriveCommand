'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';

interface StatusUpdateButtonProps {
  loadId: string;
  currentStatus: string;
  updateStatusAction: (id: string, newStatus: string) => Promise<any>;
  revertStatusAction?: (id: string) => Promise<any>;
}

const NEXT_STATUS: Record<string, { status: string; label: string }> = {
  DISPATCHED: { status: 'PICKED_UP', label: 'Mark Picked Up' },
  PICKED_UP: { status: 'IN_TRANSIT', label: 'Mark In Transit' },
  IN_TRANSIT: { status: 'DELIVERED', label: 'Mark Delivered' },
  DELIVERED: { status: 'INVOICED', label: 'Mark Invoiced' },
};

const PREV_STATUS: Record<string, { status: string; label: string }> = {
  DISPATCHED: { status: 'PENDING', label: 'Revert to Pending' },
  PICKED_UP: { status: 'DISPATCHED', label: 'Revert to Dispatched' },
  IN_TRANSIT: { status: 'PICKED_UP', label: 'Revert to Picked Up' },
  DELIVERED: { status: 'IN_TRANSIT', label: 'Revert to In Transit' },
  INVOICED: { status: 'DELIVERED', label: 'Revert to Delivered' },
};

const NON_CANCELLABLE = new Set(['DELIVERED', 'INVOICED', 'CANCELLED', 'PENDING']);

export function StatusUpdateButton({
  loadId,
  currentStatus,
  updateStatusAction,
  revertStatusAction,
}: StatusUpdateButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[currentStatus];
  const prev = PREV_STATUS[currentStatus];
  const canCancel = !NON_CANCELLABLE.has(currentStatus);
  const canRevert = !!revertStatusAction && !!prev;

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

  async function handleRevert() {
    if (!revertStatusAction || !prev) return;
    if (!window.confirm(`Are you sure you want to revert this load to ${prev.label.replace('Revert to ', '')}?`)) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await revertStatusAction(loadId);
      if (result?.error) {
        setError(typeof result.error === 'string' ? result.error : 'Failed to revert status.');
        setIsPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to revert status.');
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

  if (!next && !canCancel && !canRevert) {
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
      {canRevert && (
        <button
          onClick={handleRevert}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <Undo2 className="h-4 w-4" />
          {prev.label}
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
