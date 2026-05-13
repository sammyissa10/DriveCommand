'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisputeModal } from './dispute-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SerializedComponent = {
  id: string;
  assignmentId: string;
  componentType: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  multiplier: string;
  grossAmount: string;
  isTaxable: boolean;
  isReimbursement: boolean;
  visibleToDriver: boolean;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
  stopId: string | null;
};

type QueueRow = {
  id: string;
  driverId: string;
  driverName: string;
  loadId: string;
  loadNumber: string | null;
  payStatus: 'PENDING_REVIEW' | 'DISPUTED';
  paymentModel: string;
  totalPay: string;
  isOverride: boolean;
  overrideReason: string | null;
  ageDays: number;
  createdAt: string;
};

interface ApprovalCardProps {
  assignmentId: string;
  row: QueueRow;
  onTransition: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelFor(componentType: string): string {
  return componentType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalCard({ assignmentId, row, onTransition }: ApprovalCardProps) {
  const [components, setComponents] = useState<SerializedComponent[] | null>(null);
  const [submitting, setSubmitting] = useState<'approve' | 'dispute' | null>(null);
  const [transitionError, setTransitionError] = useState<{
    message: string;
    hint?: string;
  } | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [flashGreen, setFlashGreen] = useState(false);

  // Fetch components when assignmentId changes
  useEffect(() => {
    setComponents(null);
    setTransitionError(null);
    fetch(`/api/driver-pay/assignments/${assignmentId}/components`)
      .then((r) => r.json())
      .then((data: { components?: SerializedComponent[] }) => {
        setComponents(data.components ?? []);
      })
      .catch(() => setComponents([]));
  }, [assignmentId]);

  const handleApprove = useCallback(async () => {
    setSubmitting('approve');
    setTransitionError(null);
    const res = await fetch(
      `/api/driver-pay/assignments/${assignmentId}/transitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      },
    );
    setSubmitting(null);
    if (res.status === 422) {
      const j = await res.json();
      setTransitionError({ message: j.error, hint: j.actionHint });
      return;
    }
    if (!res.ok) {
      toast.error('Could not approve. Please try again.');
      return;
    }
    // Success — flash green then advance
    setFlashGreen(true);
    setTimeout(() => {
      setFlashGreen(false);
      onTransition(assignmentId);
    }, 350);
  }, [assignmentId, onTransition]);

  const handleDisputeSubmit = useCallback(
    async (reason: string) => {
      setSubmitting('dispute');
      setTransitionError(null);
      const res = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dispute', reason }),
        },
      );
      setSubmitting(null);
      if (res.status === 422) {
        const j = await res.json();
        setTransitionError({ message: j.error, hint: j.actionHint });
        setDisputeOpen(false);
        return;
      }
      if (!res.ok) {
        toast.error('Could not dispute. Please try again.');
        return;
      }
      setDisputeOpen(false);
      onTransition(assignmentId);
    },
    [assignmentId, onTransition],
  );

  // Compute total from fetched components (may differ from queue summary)
  const total =
    components != null
      ? components
          .reduce((sum, c) => sum + Number(c.grossAmount), 0)
          .toFixed(2)
      : row.totalPay;

  return (
    <div
      className={cn(
        'flex h-full flex-col transition-colors duration-300',
        flashGreen && 'bg-emerald-50 dark:bg-emerald-950/30',
      )}
    >
      {/* Header */}
      <header className="border-b p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{row.driverName}</h2>
            <p className="text-sm text-muted-foreground">
              Load {row.loadNumber ?? '—'} &bull; {row.paymentModel}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">${total}</div>
            <Badge
              variant={row.payStatus === 'DISPUTED' ? 'destructive' : 'secondary'}
              className={
                row.payStatus === 'PENDING_REVIEW'
                  ? 'bg-amber-100 text-amber-900 hover:bg-amber-100'
                  : undefined
              }
            >
              {row.payStatus === 'DISPUTED' ? 'Disputed' : 'Pending Review'}
            </Badge>
          </div>
        </div>
        {row.isOverride && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="font-medium">Override</span>
            {row.overrideReason && <span> — {row.overrideReason}</span>}
          </div>
        )}
      </header>

      {/* Components table */}
      <div className="flex-1 overflow-y-auto p-4">
        {components === null ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : components.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pay components found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-2 font-medium">Type</th>
                <th className="pb-2 pr-2 font-medium">Description</th>
                <th className="pb-2 pr-2 text-right font-medium">Qty</th>
                <th className="pb-2 pr-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    'border-t',
                    (c.componentType === 'ADJUSTMENT_POSITIVE' ||
                      c.componentType === 'ADJUSTMENT_NEGATIVE') &&
                      'bg-amber-50/50 dark:bg-amber-950/20',
                  )}
                >
                  <td className="py-2 pr-2 text-xs text-muted-foreground">
                    {labelFor(c.componentType)}
                  </td>
                  <td className="py-2 pr-2">{c.description}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {c.quantity} {c.unit}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">${c.rate}</td>
                  <td
                    className={cn(
                      'py-2 text-right tabular-nums font-medium',
                      Number(c.grossAmount) < 0 && 'text-destructive',
                    )}
                  >
                    {Number(c.grossAmount) < 0 ? '-' : ''}$
                    {Math.abs(Number(c.grossAmount)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 border-t bg-background p-3">
        {transitionError && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <p className="font-medium text-amber-900 dark:text-amber-300">
              {transitionError.message}
            </p>
            {transitionError.hint && (
              <p className="text-amber-800 dark:text-amber-400">{transitionError.hint}</p>
            )}
            <Link
              href={`/carrier/loads/${row.loadId}`}
              className="text-xs text-amber-900 underline dark:text-amber-300"
            >
              Open load
            </Link>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setDisputeOpen(true)}
            disabled={submitting !== null}
          >
            Dispute (D)
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting !== null}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting === 'approve' ? 'Approving…' : 'Approve (A)'}
          </Button>
        </div>
      </div>

      <DisputeModal
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        onSubmit={handleDisputeSubmit}
      />
    </div>
  );
}
