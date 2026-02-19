'use client';

import { useActionState, useEffect, useState } from 'react';
import { createPayment, updatePayment } from '@/app/(owner)/actions/payments';

interface PaymentFormProps {
  routeId: string;
  payment?: {
    id: string;
    amount: string;
    status: string;
    paidAt: string | null;
    notes: string | null;
  };
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function PaymentForm({
  routeId,
  payment,
  onCancel,
  onSuccess,
}: PaymentFormProps) {
  // Track status to conditionally show paidAt field
  const [selectedStatus, setSelectedStatus] = useState(
    payment?.status || 'PENDING'
  );

  // Bind paymentId for edit mode
  const action = payment
    ? updatePayment.bind(null, payment.id)
    : createPayment;

  const [state, formAction, isPending] = useActionState(action, null);

  // Call onSuccess when state.success is true
  useEffect(() => {
    if (state?.success && onSuccess) {
      onSuccess();
    }
  }, [state?.success, onSuccess]);

  // Format datetime-local value from ISO date
  const formatDateTimeLocal = (isoDate: string | null) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden routeId for create mode */}
      {!payment && <input type="hidden" name="routeId" value={routeId} />}

      {/* Amount Input */}
      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Amount
        </label>
        <input
          type="number"
          id="amount"
          name="amount"
          step="0.01"
          min="0"
          max="9999999.99"
          defaultValue={payment?.amount || ''}
          placeholder="0.00"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          required
        />
      </div>

      {/* Status Select */}
      <div>
        <label
          htmlFor="status"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        >
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      {/* Paid Date (only show when status is PAID) */}
      {selectedStatus === 'PAID' && (
        <div>
          <label
            htmlFor="paidAt"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Paid Date (optional)
          </label>
          <input
            type="datetime-local"
            id="paidAt"
            name="paidAt"
            defaultValue={formatDateTimeLocal(payment?.paidAt || null)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave blank to use current date/time
          </p>
        </div>
      )}

      {/* Notes Textarea */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={1000}
          defaultValue={payment?.notes || ''}
          placeholder="Additional details..."
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Generic Error Message */}
      {typeof state?.error === 'string' && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{state.error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? payment
              ? 'Saving...'
              : 'Adding...'
            : payment
              ? 'Save Changes'
              : 'Add Payment'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
