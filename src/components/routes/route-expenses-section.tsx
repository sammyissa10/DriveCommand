'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ExpenseForm } from './expense-form';
import { deleteExpense } from '@/app/(owner)/actions/expenses';

interface RouteExpensesSectionProps {
  routeId: string;
  routeStatus: string;
  categories: Array<{ id: string; name: string }>;
  initialExpenses: Array<{
    id: string;
    categoryId: string;
    amount: any; // Prisma Decimal, serialized as string
    description: string;
    notes: string | null;
    createdAt: Date;
    category: { id: string; name: string };
  }>;
}

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
}

export function RouteExpensesSection({
  routeId,
  routeStatus,
  categories,
  initialExpenses,
}: RouteExpensesSectionProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const isCompleted = routeStatus === 'COMPLETED';

  const handleAddSuccess = () => {
    setShowAddForm(false);
    router.refresh();
  };

  const handleEditSuccess = () => {
    setEditingExpenseId(null);
    router.refresh();
  };

  const handleDelete = async (expenseId: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }

    setDeletingExpenseId(expenseId);
    const result = await deleteExpense(expenseId);
    setDeletingExpenseId(null);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  // Calculate total operating cost
  const totalCost = initialExpenses.reduce((sum, expense) => {
    return sum + parseFloat(expense.amount.toString());
  }, 0);

  return (
    <div className="space-y-4">
      {/* Completed Route Notice */}
      {isCompleted && (
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <p className="text-sm text-muted-foreground">
            Expenses are locked for completed routes.
          </p>
        </div>
      )}

      {/* Add Expense Button */}
      {!isCompleted && !showAddForm && !editingExpenseId && (
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </button>
      )}

      {/* Add Expense Form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-card-foreground mb-3">
            Add New Expense
          </h3>
          <ExpenseForm
            routeId={routeId}
            categories={categories}
            onCancel={() => setShowAddForm(false)}
            onSuccess={handleAddSuccess}
          />
        </div>
      )}

      {/* Expenses List */}
      {initialExpenses.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No expenses recorded yet. Add your first expense to start tracking costs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialExpenses.map((expense) => {
            const isEditing = editingExpenseId === expense.id;
            const isDeleting = deletingExpenseId === expense.id;

            return (
              <div
                key={expense.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                {isEditing ? (
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground mb-3">
                      Edit Expense
                    </h3>
                    <ExpenseForm
                      routeId={routeId}
                      categories={categories}
                      expense={{
                        id: expense.id,
                        categoryId: expense.categoryId,
                        amount: expense.amount.toString(),
                        description: expense.description,
                        notes: expense.notes,
                      }}
                      onCancel={() => setEditingExpenseId(null)}
                      onSuccess={handleEditSuccess}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {expense.category.name}
                        </span>
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(expense.amount.toString())}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mb-1">
                        {expense.description}
                      </p>
                      {expense.notes && (
                        <p className="text-sm text-muted-foreground">
                          {expense.notes}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {!isCompleted && (
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setEditingExpenseId(expense.id)}
                          disabled={isDeleting}
                          className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                          title="Edit expense"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          disabled={isDeleting}
                          className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          title="Delete expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Total Operating Cost */}
      {initialExpenses.length > 0 && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Total Operating Cost
            </span>
            <span className="text-xl font-bold text-foreground">
              {formatCurrency(totalCost)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
