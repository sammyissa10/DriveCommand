'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StepType, AssigneeRole } from '@drivecommand/validation';
import type { PlaybookStepItem } from './BuilderClient';

interface BuilderStepRowProps {
  step: PlaybookStepItem;
  playbookId: string;
  isSelected: boolean;
  onSelect: (stepId: string) => void;
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  DOCUMENT_UPLOAD: 'Document',
  FORM_FILL: 'Form',
  INSPECTION_ITEM: 'Inspection',
  SIGNATURE: 'Signature',
  TRAINING_ACK: 'Training',
  APPROVAL: 'Approval',
  THIRD_PARTY: 'External',
  CUSTOM_NOTE: 'Note',
};

const ASSIGNEE_ROLE_LABELS: Record<AssigneeRole, string> = {
  DRIVER: 'Driver',
  DISPATCHER: 'Dispatcher',
  MECHANIC: 'Mechanic',
  SAFETY_MANAGER: 'Safety Manager',
  THIRD_PARTY: 'Third Party',
};

export function BuilderStepRow({
  step,
  playbookId,
  isSelected,
  onSelect,
}: BuilderStepRowProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: step.id,
    data: { type: 'step', phase: step.playbookPhase },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const removeStepMutation = useMutation(
    trpc.workflows.playbook.removeStep.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.workflows.playbook.getById.queryKey({ id: playbookId }),
        });
      },
    }),
  );

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    removeStepMutation.mutate({ playbookId, stepId: step.id });
  }

  return (
    <div
      ref={setNodeRef}
      style={style as React.CSSProperties}
      onClick={() => onSelect(step.id)}
      className={[
        'group flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer',
        'border transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:bg-muted/50 hover:border-border/80',
        isDragging ? 'shadow-lg' : '',
      ].join(' ')}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0 touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {/* Step info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {step.stepTemplate.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {STEP_TYPE_LABELS[step.stepTemplate.stepType]}
          </Badge>
          {/*
            quick-544 — visible at a glance, not one click deep.

            A control an owner has to open eight step editors to audit is a
            control they will not audit. Amber rather than red: this is a
            deliberate setting doing its job, not an error, and Section 15
            reserves red for errors and destructive actions.
          */}
          {step.isDispatchBlocker && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            >
              Blocks dispatch
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {ASSIGNEE_ROLE_LABELS[step.stepTemplate.assigneeRole]}
          </span>
        </div>
      </div>

      {/* Action buttons — visible on hover / when selected */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(step.id);
          }}
          aria-label="Edit step"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleRemove}
          disabled={removeStepMutation.isPending}
          aria-label="Remove step"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
