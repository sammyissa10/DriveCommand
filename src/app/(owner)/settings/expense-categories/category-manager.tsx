'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createCategory, deleteCategory } from '@/app/(owner)/actions/expense-categories';

interface CategoryManagerProps {
  initialCategories: Array<{
    id: string;
    name: string;
    isSystemDefault: boolean;
  }>;
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const router = useRouter();
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(createCategory, null);

  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (!window.confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      return;
    }

    setDeletingCategoryId(categoryId);
    const result = await deleteCategory(categoryId);
    setDeletingCategoryId(null);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Category Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Add Category</h2>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
              Category Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              maxLength={50}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g., Parking, Supplies, Cleaning"
            />
            {state?.error && typeof state.error !== 'string' && state.error.name && (
              <p className="text-sm text-destructive mt-1">{state.error.name[0]}</p>
            )}
          </div>

          {state?.error && typeof state.error === 'string' && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{state.error}</p>
            </div>
          )}

          {state?.success && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">Category created successfully!</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {isPending ? 'Adding...' : 'Add Category'}
          </button>
        </form>
      </div>

      {/* Categories List */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">All Categories</h2>
        {initialCategories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No categories found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {initialCategories.map((category) => {
              const isDeleting = deletingCategoryId === category.id;
              return (
                <div
                  key={category.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">{category.name}</span>
                    {category.isSystemDefault ? (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        System Default
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20">
                        Custom
                      </span>
                    )}
                  </div>
                  {!category.isSystemDefault && (
                    <button
                      onClick={() => handleDelete(category.id, category.name)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
