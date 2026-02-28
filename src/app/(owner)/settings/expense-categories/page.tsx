import { listCategories } from '@/app/(owner)/actions/expense-categories';
import { CategoryManager } from './category-manager';

export default async function ExpenseCategoriesPage() {
  const categories = await listCategories().catch((err: unknown) => {
    console.error('[expense-categories] listCategories failed:', err);
    return [] as Awaited<ReturnType<typeof listCategories>>;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Expense Categories</h1>
        <p className="text-muted-foreground mt-1">Manage expense categories for route cost tracking.</p>
      </div>
      <CategoryManager initialCategories={categories} />
    </div>
  );
}
