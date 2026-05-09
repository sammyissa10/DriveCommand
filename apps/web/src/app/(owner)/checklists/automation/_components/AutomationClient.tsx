'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { RecipeCard } from './RecipeCard';
import { CustomRulesTable } from './CustomRulesTable';
import { CreateCustomRuleDialog } from './CreateCustomRuleDialog';
import { AutomationActivityLog } from './AutomationActivityLog';

export function AutomationClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch all 7 recipes with per-tenant enabled state
  const { data: recipes = [], isLoading: recipesLoading } = useQuery(
    trpc.workflows.trigger.listRecipes.queryOptions(),
  );

  // Fetch custom rules
  const { data: customRules = [], isLoading: rulesLoading } = useQuery(
    trpc.workflows.trigger.listCustomRules.queryOptions(),
  );

  // Delete custom rule
  const deleteMutation = useMutation(
    trpc.workflows.trigger.deleteRule.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.workflows.trigger.listCustomRules.queryKey() });
      },
    }),
  );

  return (
    <div className="space-y-10">
      {/* Section 1: Recipes */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Recipes</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pre-built automations — enable a recipe and pick the checklist it should start.
          </p>
        </div>

        {recipesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-40 rounded-lg border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.key} recipe={recipe} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Custom Rules */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Custom Rules</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Build your own auto-start triggers beyond the pre-built recipes.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Create Custom Rule
          </Button>
        </div>

        <CustomRulesTable
          rules={customRules}
          isLoading={rulesLoading}
          onDelete={(triggerId) => deleteMutation.mutate({ triggerId })}
          deletingId={deleteMutation.isPending ? (deleteMutation.variables as { triggerId: string })?.triggerId : null}
        />
      </section>

      {/* Section 3: Automation Activity Log */}
      <AutomationActivityLog />

      {/* Create Custom Rule Dialog */}
      <CreateCustomRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: trpc.workflows.trigger.listCustomRules.queryKey() });
        }}
      />
    </div>
  );
}
