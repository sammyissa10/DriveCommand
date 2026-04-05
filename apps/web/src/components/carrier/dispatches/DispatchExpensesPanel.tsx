'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const EXPENSE_TYPES = [
  'fuel', 'toll', 'lumper', 'scale', 'parking', 'repair', 'meal', 'lodging', 'other',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpenseItem {
  id: string;
  expenseType: string;
  amount: number;
  paidBy: string;
  driverId: string | null;
  notes: string | null;
  approvedAt: string | null;
}

interface DriverOption {
  id: string;
  name: string;
}

interface DispatchExpensesPanelProps {
  expenses: ExpenseItem[];
  dispatchId: string;
  drivers: DriverOption[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchExpensesPanel({ expenses, dispatchId, drivers }: DispatchExpensesPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [expenseType, setExpenseType] = useState('fuel');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('company');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');

  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = d.name;

  function resetForm() {
    setExpenseType('fuel');
    setAmount('');
    setPaidBy('company');
    setDriverId('');
    setNotes('');
  }

  function handleSubmit() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }

    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          dispatchId,
          expenseType,
          amount: amountNum,
          paidBy,
        };
        if (driverId) body.driverId = driverId;
        if (notes.trim()) body.notes = notes.trim();

        const res = await fetch('/api/v1/carrier/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to create expense');
        }

        toast.success('Expense added');
        resetForm();
        setShowForm(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add expense');
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Expenses
          <span className="text-sm font-normal text-muted-foreground">({expenses.length})</span>
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? (
            <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide Form</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Add Expense</>
          )}
        </Button>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="rounded-md border bg-background p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-6 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Paid By</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="company">Company</option>
                <option value="driver">Driver</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Driver (optional)</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { resetForm(); setShowForm(false); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending || !amount}
              onClick={handleSubmit}
            >
              {isPending ? 'Saving…' : 'Add Expense'}
            </Button>
          </div>
        </div>
      )}

      {/* Expense list */}
      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses recorded for this dispatch.</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const driverName = expense.driverId ? driverMap[expense.driverId] : null;
            const isApproved = expense.approvedAt != null;
            return (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-md border bg-background px-3 py-2.5 gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground capitalize">
                    {expense.expenseType}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {expense.paidBy === 'driver' ? 'Driver-paid' : 'Company-paid'}
                    {driverName ? ` · ${driverName}` : ''}
                    {expense.notes ? ` · ${expense.notes}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isApproved
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {isApproved ? 'Approved' : 'Pending'}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
