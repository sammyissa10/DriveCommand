'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export function DeletePayrollButton({
  recordId,
  status,
  deleteAction,
}: {
  recordId: string;
  status: string;
  deleteAction: (id: string) => Promise<any>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Only allow deletion of DRAFT records
  if (status !== 'DRAFT') {
    return null;
  }

  async function handleDelete() {
    setIsPending(true);
    await deleteAction(recordId);
    setIsPending(false);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Deleting...' : 'Confirm Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </button>
  );
}
