'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpenseFormProps {
  dispatchId?: string;
  loadId?: string;
  stopId?: string;
  onSuccess: () => void;
}

interface DriverOption {
  id: string;
  name: string;
}

const EXPENSE_TYPE_OPTIONS = [
  { value: '', label: 'Select expense type…' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'toll', label: 'Toll' },
  { value: 'repair', label: 'Repair' },
  { value: 'driver_cash', label: 'Driver Cash' },
  { value: 'lumper', label: 'Lumper' },
  { value: 'detention', label: 'Detention' },
  { value: 'parking', label: 'Parking' },
  { value: 'other', label: 'Other' },
];

const PAID_BY_OPTIONS = [
  { value: '', label: 'Select who paid…' },
  { value: 'driver_cash', label: 'Driver Cash' },
  { value: 'company_card', label: 'Company Card' },
  { value: 'owner_advance', label: 'Owner Advance' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseForm({ dispatchId, loadId, stopId, onSuccess }: ExpenseFormProps) {
  const [expenseType, setExpenseType] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [reimbursable, setReimbursable] = useState(false);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Fetch active drivers on mount
  useEffect(() => {
    async function loadDrivers() {
      try {
        const res = await fetch('/api/v1/carrier/drivers?status=active');
        if (!res.ok) throw new Error('Failed to load drivers');
        const data = await res.json() as { drivers: DriverOption[] };
        setDrivers(data.drivers ?? []);
      } catch {
        // Non-critical — driver select will show empty
      } finally {
        setDriversLoading(false);
      }
    }
    void loadDrivers();
  }, []);

  // Auto-set reimbursable based on paid_by
  function handlePaidByChange(value: string) {
    setPaidBy(value);
    if (value === 'driver_cash') {
      setReimbursable(true);
    } else if (value === 'company_card') {
      setReimbursable(false);
    }
    // owner_advance: leave unchanged for manual override
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);

    // Validate dispatch/load linkage
    if (!dispatchId && !loadId) {
      setLinkError('Must be linked to a dispatch or load.');
      return;
    }

    // Validate required fields
    if (!expenseType) {
      toast.error('Please select an expense type');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    if (!paidBy) {
      toast.error('Please select who paid');
      return;
    }
    if (!driverId) {
      toast.error('Please select a driver');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/carrier/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_type: expenseType,
          amount: parsedAmount,
          paid_by: paidBy,
          driver_id: driverId,
          notes: notes.trim() || null,
          reimbursable,
          dispatch_id: dispatchId || null,
          load_id: loadId || null,
          stop_id: stopId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to log expense');
      }

      toast.success('Expense logged');
      // Reset form
      setExpenseType('');
      setAmount('');
      setPaidBy('');
      setDriverId('');
      setNotes('');
      setReimbursable(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Link error */}
      {linkError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
          <p className="text-sm text-red-600 dark:text-red-400">{linkError}</p>
        </div>
      )}

      {/* Expense type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Expense Type <span className="text-red-500">*</span>
        </label>
        <select
          value={expenseType}
          onChange={(e) => setExpenseType(e.target.value)}
          disabled={submitting}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        >
          {EXPENSE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Amount ($) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={submitting}
          placeholder="0.00"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        />
      </div>

      {/* Paid by */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Paid By <span className="text-red-500">*</span>
        </label>
        <select
          value={paidBy}
          onChange={(e) => handlePaidByChange(e.target.value)}
          disabled={submitting}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        >
          {PAID_BY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Driver select */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Driver <span className="text-red-500">*</span>
        </label>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          disabled={submitting || driversLoading}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          required
        >
          <option value="" disabled>
            {driversLoading ? 'Loading drivers…' : 'Select a driver…'}
          </option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>

      {/* Reimbursable toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={reimbursable}
          onClick={() => setReimbursable((prev) => !prev)}
          disabled={submitting}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            ${reimbursable ? 'bg-primary' : 'bg-muted-foreground/30'}
            disabled:opacity-50
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
              ${reimbursable ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
        <label className="text-sm font-medium text-foreground cursor-pointer" onClick={() => !submitting && setReimbursable((prev) => !prev)}>
          Reimbursable
        </label>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          rows={2}
          placeholder="Additional details about this expense…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Logging…' : 'Log Expense'}
        </Button>
      </div>
    </form>
  );
}
