'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus } from 'lucide-react';
import { useTRPC } from '@/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StepType } from '@drivecommand/validation';
import { NewStepTemplateButton } from './NewStepTemplateButton';

interface StepLibraryPanelProps {
  playbookId: string;
}

type FilterOption = 'ALL' | StepType;

const FILTER_OPTIONS: Array<{ value: FilterOption; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DOCUMENT_UPLOAD', label: 'Document' },
  { value: 'FORM_FILL', label: 'Form' },
  { value: 'INSPECTION_ITEM', label: 'Inspection' },
  { value: 'SIGNATURE', label: 'Signature' },
  { value: 'TRAINING_ACK', label: 'Training' },
  { value: 'APPROVAL', label: 'Approval' },
  { value: 'THIRD_PARTY', label: 'External' },
  { value: 'CUSTOM_NOTE', label: 'Note' },
];

interface StepTemplateItem {
  id: string;
  name: string;
  stepType: StepType;
  description: string | null;
}

function DraggableTemplateCard({ template }: { template: StepTemplateItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-${template.id}`,
    data: { type: 'library', stepTemplateId: template.id },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group flex items-start gap-2 p-3 rounded-md border border-border bg-background',
        'cursor-grab active:cursor-grabbing transition-all',
        isDragging ? 'opacity-40 shadow-md' : 'hover:bg-muted/50 hover:border-border/80',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      {/* Drag handle */}
      <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 mt-0.5 transition-colors" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{template.name}</p>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {template.description}
          </p>
        )}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 mt-1.5">
          {FILTER_OPTIONS.find((f) => f.value === template.stepType)?.label ?? template.stepType}
        </Badge>
      </div>
    </div>
  );
}

export function StepLibraryPanel({ playbookId }: StepLibraryPanelProps) {
  const trpc = useTRPC();
  const [filter, setFilter] = useState<FilterOption>('ALL');
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const { data: templates, isLoading } = useQuery(
    trpc.workflows.stepTemplate.list.queryOptions({
      stepType: filter === 'ALL' ? undefined : filter,
    }),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Step Library</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag steps onto the canvas
        </p>
      </div>

      {/* Filter chips */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={[
                'px-2 py-0.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                filter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Templates list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
            ))}
          </>
        )}

        {!isLoading && templates?.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No steps found. Create one below.
          </div>
        )}

        {(templates as StepTemplateItem[] | undefined)?.map((template) => (
          <DraggableTemplateCard key={template.id} template={template} />
        ))}
      </div>

      {/* Footer: New Step button */}
      <div className="px-3 py-3 border-t border-border flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => setNewDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New Step
        </Button>
      </div>

      <NewStepTemplateButton
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
      />
    </div>
  );
}
