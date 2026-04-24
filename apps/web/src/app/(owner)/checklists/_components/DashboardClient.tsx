'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { PlaybookCard } from './PlaybookCard';
import { CreatePlaybookCard } from './CreatePlaybookCard';
import { CreatePlaybookDialog } from './CreatePlaybookDialog';
import { EntityTypeFilterTabs, type EntityTypeFilter } from './EntityTypeFilterTabs';
import { WorkBoardSection } from './WorkBoardSection';
import { StartChecklistDialog } from './StartChecklistDialog';

export function DashboardClient() {
  const trpc = useTRPC();
  const [filter, setFilter] = useState<EntityTypeFilter>('ALL');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);

  const { data: playbooks, isLoading: playbooksLoading } = useQuery(
    trpc.workflows.playbook.list.queryOptions({
      entityType: filter === 'ALL' ? undefined : filter,
    }),
  );

  const { data: instanceData, isLoading: instancesLoading } = useQuery(
    trpc.workflows.instance.list.queryOptions({ take: 20 }),
  );

  return (
    <>
      {/* Active Work Board */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Active Work Board</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track active checklists by status
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setStartDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Start Checklist
          </Button>
        </div>

        <WorkBoardSection
          instances={instanceData?.instances ?? []}
          isLoading={instancesLoading}
        />
      </div>

      {/* Playbook library */}
      <div>
        <h2 className="text-base font-semibold mb-4">Playbook Library</h2>
        <EntityTypeFilterTabs value={filter} onChange={setFilter} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
          <CreatePlaybookCard onClick={() => setCreateDialogOpen(true)} />

          {playbooksLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
              ))}
            </>
          )}

          {playbooks?.map((pb) => (
            <PlaybookCard key={pb.id} playbook={pb} />
          ))}

          {!playbooksLoading && playbooks?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No checklists yet. Click &ldquo;Create new&rdquo; to build your first.
            </div>
          )}
        </div>
      </div>

      <CreatePlaybookDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <StartChecklistDialog open={startDialogOpen} onOpenChange={setStartDialogOpen} />
    </>
  );
}
