'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Truck,
  Package,
  ClipboardCheck,
  Building2,
  Zap,
} from 'lucide-react';

// Map trigger events to icons
const EVENT_ICONS: Record<string, React.ElementType> = {
  ON_DRIVER_CREATE: Users,
  ON_VEHICLE_CREATE: Truck,
  ON_DISPATCH_CREATE: Package,
  ON_DISPATCH_DELIVER: ClipboardCheck,
  ON_PARTNER_CREATE: Building2,
};

interface RecipeData {
  key: string;
  displayName: string;
  sentence: string;
  triggerEvent: string;
  conditions: Record<string, unknown> | null;
  suggestedCategory?: string | null;
  enabled: boolean;
  playbookId: string | null;
  playbookName: string | null;
  activeCount: number;
}

interface Playbook {
  id: string;
  name: string;
  category?: string;
}

interface RecipeCardProps {
  recipe: RecipeData;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Local state for the selected playbook (before committing via toggle)
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(recipe.playbookId ?? '');

  // Sync if parent data changes (e.g. after enable/disable)
  useEffect(() => {
    setSelectedPlaybookId(recipe.playbookId ?? '');
  }, [recipe.playbookId]);

  // Load all playbooks for the dropdown
  const { data: playbooksData } = useQuery(
    trpc.workflows.playbook.list.queryOptions({ entityType: undefined }),
  );
  const playbooks: Playbook[] = playbooksData ?? [];

  // Filter by suggestedCategory when present
  const filteredPlaybooks = recipe.suggestedCategory
    ? playbooks.filter(
        (p) => !p.category || p.category === recipe.suggestedCategory || p.category === 'CUSTOM'
      )
    : playbooks;

  // Show all playbooks if none match the category filter (fallback)
  const dropdownPlaybooks =
    filteredPlaybooks.length > 0 ? filteredPlaybooks : playbooks;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enableMutation = useMutation<any, Error, any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trpc.workflows.trigger.enableRecipe.mutationOptions() as any,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disableMutation = useMutation<any, Error, any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trpc.workflows.trigger.disableRecipe.mutationOptions() as any,
  );

  const isPending = enableMutation.isPending || disableMutation.isPending;

  async function handleToggle(checked: boolean) {
    if (checked) {
      if (!selectedPlaybookId) return; // Guard: no playbook selected
      try {
        await enableMutation.mutateAsync({ recipeKey: recipe.key, playbookId: selectedPlaybookId });
        await queryClient.invalidateQueries({ queryKey: trpc.workflows.trigger.listRecipes.queryKey() });
        toast.success(`Recipe "${recipe.displayName}" enabled`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to enable recipe';
        toast.error(msg);
      }
    } else {
      try {
        await disableMutation.mutateAsync({ recipeKey: recipe.key });
        await queryClient.invalidateQueries({ queryKey: trpc.workflows.trigger.listRecipes.queryKey() });
        toast.success(`Recipe "${recipe.displayName}" disabled`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to disable recipe';
        toast.error(msg);
      }
    }
  }

  const Icon = EVENT_ICONS[recipe.triggerEvent] ?? Zap;
  const canToggleOn = Boolean(selectedPlaybookId);

  return (
    <Card className="flex flex-col h-full border border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug line-clamp-2">{recipe.displayName}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-1 px-4 pb-4 flex-1">
        {/* Plain-English sentence */}
        <p className="text-sm text-muted-foreground leading-snug">{recipe.sentence}</p>

        {/* Playbook dropdown */}
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            Checklist
          </label>
          <Select
            value={selectedPlaybookId}
            onValueChange={setSelectedPlaybookId}
            disabled={isPending}
          >
            <SelectTrigger className="h-8 text-xs" aria-label="Select checklist for this recipe">
              <SelectValue placeholder="Pick a checklist..." />
            </SelectTrigger>
            <SelectContent>
              {dropdownPlaybooks.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
              {dropdownPlaybooks.length === 0 && (
                <div className="py-2 px-3 text-xs text-muted-foreground">No checklists yet</div>
              )}
            </SelectContent>
          </Select>
          {!canToggleOn && (
            <p className="text-xs text-muted-foreground mt-1">
              Select a checklist to enable this recipe.
            </p>
          )}
        </div>

        {/* Toggle row */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-xs text-muted-foreground">
            Active {recipe.activeCount} time{recipe.activeCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 min-h-[44px]">
            <span className="text-xs text-muted-foreground">
              {recipe.enabled ? 'On' : 'Off'}
            </span>
            <Switch
              checked={recipe.enabled}
              onCheckedChange={(v) => void handleToggle(v)}
              disabled={isPending || (!recipe.enabled && !canToggleOn)}
              aria-label={`${recipe.enabled ? 'Disable' : 'Enable'} recipe: ${recipe.displayName}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
