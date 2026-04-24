'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PlaybookCard } from './PlaybookCard';
import { CreatePlaybookCard } from './CreatePlaybookCard';
import { CreatePlaybookDialog } from './CreatePlaybookDialog';
import { EntityTypeFilterTabs, type EntityTypeFilter } from './EntityTypeFilterTabs';

export function DashboardClient() {
  const trpc = useTRPC();
  const [filter, setFilter] = useState<EntityTypeFilter>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: playbooks, isLoading } = useQuery(
    trpc.workflows.playbook.list.queryOptions({
      entityType: filter === 'ALL' ? undefined : filter,
    }),
  );

  return (
    <>
      <EntityTypeFilterTabs value={filter} onChange={setFilter} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        <CreatePlaybookCard onClick={() => setDialogOpen(true)} />

        {isLoading && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </>
        )}

        {playbooks?.map((pb) => (
          <PlaybookCard key={pb.id} playbook={pb} />
        ))}

        {!isLoading && playbooks?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No checklists yet. Click &ldquo;Create new&rdquo; to build your first.
          </div>
        )}
      </div>

      <CreatePlaybookDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
