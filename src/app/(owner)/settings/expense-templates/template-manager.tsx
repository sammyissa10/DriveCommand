'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, X } from 'lucide-react';
import { createTemplate, deleteTemplate } from '@/app/(owner)/actions/expense-templates';

interface TemplateManagerProps {
  initialTemplates: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      categoryId: string;
      amount: any;
      description: string;
      category: {
        id: string;
        name: string;
      };
    }>;
  }>;
  categories: Array<{
    id: string;
    name: string;
  }>;
}

interface TemplateItem {
  categoryId: string;
  amount: string;
  description: string;
}

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
}

export function TemplateManager({ initialTemplates, categories }: TemplateManagerProps) {
  const router = useRouter();
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [state, formAction, isPending] = useActionState(createTemplate, null);

  // Template creation form state
  const [templateName, setTemplateName] = useState('');
  const [items, setItems] = useState<TemplateItem[]>([
    { categoryId: '', amount: '', description: '' }
  ]);

  const handleAddItem = () => {
    setItems([...items, { categoryId: '', amount: '', description: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof TemplateItem, value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
      return;
    }

    setDeletingTemplateId(templateId);
    const result = await deleteTemplate(templateId);
    setDeletingTemplateId(null);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  const toggleExpanded = (templateId: string) => {
    const newSet = new Set(expandedTemplates);
    if (newSet.has(templateId)) {
      newSet.delete(templateId);
    } else {
      newSet.add(templateId);
    }
    setExpandedTemplates(newSet);
  };

  return (
    <div className="space-y-6">
      {/* Create Template Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Create Template</h2>
        <form action={formAction} className="space-y-4">
          {/* Template Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
              Template Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g., Standard Route, City Delivery, Long Haul"
            />
            {state?.error && typeof state.error !== 'string' && state.error.name && (
              <p className="text-sm text-destructive mt-1">{state.error.name[0]}</p>
            )}
          </div>

          {/* Template Items */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Expense Items
            </label>
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <select
                    value={item.categoryId}
                    onChange={(e) => handleItemChange(index, 'categoryId', e.target.value)}
                    required
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999999.99"
                    value={item.amount}
                    onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                    required
                    placeholder="Amount"
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    required
                    maxLength={200}
                    placeholder="Description"
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="p-2 text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {state?.error && typeof state.error !== 'string' && state.error.items && (
              <p className="text-sm text-destructive">{state.error.items[0]}</p>
            )}
          </div>

          {/* Hidden field for JSON items */}
          <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

          {/* Add Item Button */}
          <button
            type="button"
            onClick={handleAddItem}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            + Add Item
          </button>

          {state?.error && typeof state.error === 'string' && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{state.error}</p>
            </div>
          )}

          {state?.success && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">Template created successfully!</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {isPending ? 'Creating...' : 'Create Template'}
          </button>
        </form>
      </div>

      {/* Templates List */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Templates</h2>
        {initialTemplates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No templates found. Create your first template above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {initialTemplates.map((template) => {
              const isExpanded = expandedTemplates.has(template.id);
              const isDeleting = deletingTemplateId === template.id;
              return (
                <div
                  key={template.id}
                  className="rounded-lg border border-border bg-background"
                >
                  <div className="flex items-center justify-between p-4">
                    <button
                      onClick={() => toggleExpanded(template.id)}
                      className="flex items-center gap-2 text-left flex-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-foreground">{template.name}</span>
                      <span className="text-sm text-muted-foreground">
                        ({template.items.length} {template.items.length === 1 ? 'item' : 'items'})
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(template.id, template.name)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-2">
                      {template.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-foreground">{item.category.name}</span>
                            <span className="text-muted-foreground">{item.description}</span>
                          </div>
                          <span className="font-medium text-foreground">
                            {formatCurrency(item.amount.toString())}
                          </span>
                        </div>
                      ))}
                    </div>
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
