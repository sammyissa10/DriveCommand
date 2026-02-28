import { listTemplates } from '@/app/(owner)/actions/expense-templates';
import { listCategories } from '@/app/(owner)/actions/expense-categories';
import { TemplateManager } from './template-manager';

export default async function ExpenseTemplatesPage() {
  const [templates, categories] = await Promise.all([
    listTemplates().catch((err: unknown) => {
      console.error('[expense-templates] listTemplates failed:', err);
      return [] as Awaited<ReturnType<typeof listTemplates>>;
    }),
    listCategories().catch((err: unknown) => {
      console.error('[expense-templates] listCategories failed:', err);
      return [] as Awaited<ReturnType<typeof listCategories>>;
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Expense Templates</h1>
        <p className="text-muted-foreground mt-1">Create templates to quickly add common expenses to routes.</p>
      </div>
      <TemplateManager initialTemplates={templates} categories={categories} />
    </div>
  );
}
