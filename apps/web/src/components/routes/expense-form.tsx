'use client';

import { useActionState, useEffect } from 'react';
import { createExpense, updateExpense } from '@/app/(owner)/actions/expenses';

interface ExpenseFormProps {
  routeId: string;
  categories: Array<{ id: string; name: string }>;
  expense?: {
    id: string;
    categoryId: string;
    amount: string;
    description: string;
    notes: string | null;
  };
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function ExpenseForm({
  routeId,
  categories,
  expense,
  onCancel,
  onSuccess,
}: ExpenseFormProps) {
  // Bind expenseId for edit mode
  const action = expense
    ? updateExpense.bind(null, expense.id)
    : createExpense;

  const [state, formAction, isPending] = useActionState(action, null);

  // Call onSuccess when state.success is true
  useEffect(() => {
    if (state?.success && onSuccess) {
      onSuccess();
    }
  }, [state?.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden routeId for create mode */}
      {!expense && (
        <input type="hidden" name="routeId" value={routeId} />
      )}

      {/* Category Select */}
      <div>
        <label
          htmlFor="categoryId"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={expense?.categoryId || ''}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {state?.error && typeof state.error !== 'string' && state.error.categoryId && (
          <p className="text-sm text-destructive mt-1">
            {state.error.categoryId[0]}
          </p>
        )}
      </div>

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
          max="999999.99"
          defaultValue={expense?.amount || ''}
          placeholder="0.00"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          required
        />
        {state?.error && typeof state.error !== 'string' && state.error.amount && (
          <p className="text-sm text-destructive mt-1">
            {state.error.amount[0]}
          </p>
        )}
      </div>

      {/* Description Input */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Description
        </label>
        <input
          type="text"
          id="description"
          name="description"
          maxLength={200}
          defaultValue={expense?.description || ''}
          placeholder="e.g., Fuel at Flying J"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          required
        />
        {state?.error && typeof state.error !== 'string' && state.error.description && (
          <p className="text-sm text-destructive mt-1">
            {state.error.description[0]}
          </p>
        )}
      </div>

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
          defaultValue={expense?.notes || ''}
          placeholder="Additional details..."
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
        {state?.error && typeof state.error !== 'string' && state.error.notes && (
          <p className="text-sm text-destructive mt-1">
            {state.error.notes[0]}
          </p>
        )}
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
          {isPending ? (expense ? 'Saving...' : 'Adding...') : (expense ? 'Save Changes' : 'Add Expense')}
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
