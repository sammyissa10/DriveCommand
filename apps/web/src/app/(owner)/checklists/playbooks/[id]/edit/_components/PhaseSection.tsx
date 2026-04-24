'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { PhaseType } from '@drivecommand/validation';

interface PhaseSectionProps {
  phase: PhaseType;
  label: string;
  stepIds: string[];
  children: React.ReactNode;
}

export function PhaseSection({ phase, label, stepIds, children }: PhaseSectionProps) {
  const count = stepIds.length;

  // Make the empty zone droppable when there are no steps
  const { setNodeRef, isOver } = useDroppable({
    id: phase,
    data: { phase },
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Phase header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40 rounded-t-lg">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">
          {count === 0 ? 'No steps' : count === 1 ? '1 step' : `${count} steps`}
        </span>
      </div>

      {/* Step list */}
      <div className="p-2 min-h-[80px]">
        <SortableContext
          id={phase}
          items={stepIds}
          strategy={verticalListSortingStrategy}
        >
          {count > 0 ? (
            <div className="space-y-1">{children}</div>
          ) : (
            <div
              ref={setNodeRef}
              className={[
                'h-16 flex items-center justify-center rounded-md border-2 border-dashed',
                'text-xs text-muted-foreground transition-colors',
                isOver
                  ? 'border-primary/60 bg-primary/5 text-primary'
                  : 'border-border/60',
              ].join(' ')}
            >
              Drop steps here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
