'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTRPC } from '@/trpc/client';
import type { PhaseType } from '@drivecommand/validation';
import { BuilderCanvas } from './BuilderCanvas';
import { StepLibraryPanel } from './StepLibraryPanel';
import { StepDetailEditor } from './StepDetailEditor';

interface BuilderClientProps {
  playbookId: string;
}

export interface PlaybookStepItem {
  id: string;
  playbookId: string;
  playbookPhase: PhaseType;
  sequence: number;
  overrideConfig: Record<string, unknown> | null;
  stepTemplate: {
    id: string;
    name: string;
    stepType: 'DOCUMENT_UPLOAD' | 'FORM_FILL' | 'INSPECTION_ITEM' | 'SIGNATURE' | 'TRAINING_ACK' | 'APPROVAL' | 'THIRD_PARTY' | 'CUSTOM_NOTE';
    assigneeRole: 'DRIVER' | 'DISPATCHER' | 'MECHANIC' | 'SAFETY_MANAGER' | 'THIRD_PARTY';
    description: string | null;
  };
}

const PHASE_ORDER: PhaseType[] = ['PRE_START', 'DAY_1', 'WEEK_1', 'ONGOING', 'NONE'];

/** Normalise the raw Prisma/tRPC step shape into PlaybookStepItem to avoid deep type instantiation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseSteps(raw: any[]): PlaybookStepItem[] {
  return raw.map((s) => ({
    id: String(s.id),
    playbookId: String(s.playbookId),
    playbookPhase: s.playbookPhase as PhaseType,
    sequence: Number(s.sequence),
    overrideConfig: s.overrideConfig as Record<string, unknown> | null,
    stepTemplate: {
      id: String(s.stepTemplate.id),
      name: String(s.stepTemplate.name),
      stepType: s.stepTemplate.stepType as PlaybookStepItem['stepTemplate']['stepType'],
      assigneeRole: s.stepTemplate.assigneeRole as PlaybookStepItem['stepTemplate']['assigneeRole'],
      description: s.stepTemplate.description as string | null,
    },
  }));
}

export function BuilderClient({ playbookId }: BuilderClientProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: playbook, isLoading } = useQuery(
    trpc.workflows.playbook.getById.queryOptions({ id: playbookId }),
  );

  // Normalise server steps once per fetch
  const serverSteps = useMemo(
    () => (playbook?.steps ? normaliseSteps(playbook.steps) : []),
    [playbook?.steps],
  );

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // Local step order for optimistic cross-phase moves
  const [localSteps, setLocalSteps] = useState<PlaybookStepItem[] | null>(null);

  const steps: PlaybookStepItem[] = localSteps ?? serverSteps;

  const addStepMutation = useMutation(
    trpc.workflows.playbook.addStep.mutationOptions({
      onSuccess: () => {
        setLocalSteps(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.workflows.playbook.getById.queryKey({ id: playbookId }),
        });
      },
      onError: () => setLocalSteps(null),
    }),
  );

  const reorderStepsMutation = useMutation(
    trpc.workflows.playbook.reorderSteps.mutationOptions({
      onSuccess: () => {
        setLocalSteps(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.workflows.playbook.getById.queryKey({ id: playbookId }),
        });
      },
      onError: () => setLocalSteps(null),
    }),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
    // Snapshot current steps for optimistic update base
    if (!localSteps && serverSteps.length > 0) {
      setLocalSteps([...serverSteps]);
    }
  }

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeType = active.data.current?.type;
      // Only handle step-to-step cross-phase moves here (library drag handled at dragEnd)
      if (activeType !== 'step') return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      setLocalSteps((prev) => {
        const base = prev ?? serverSteps;
        const activeStep = base.find((s) => s.id === activeId);
        if (!activeStep) return prev;

        // Determine target phase: over.id could be a phase string or another step id
        let targetPhase: PhaseType = activeStep.playbookPhase;
        const PHASE_SET = new Set<string>(PHASE_ORDER);
        if (PHASE_SET.has(overId)) {
          targetPhase = overId as PhaseType;
        } else {
          const overStep = base.find((s) => s.id === overId);
          if (overStep) targetPhase = overStep.playbookPhase;
        }

        if (targetPhase === activeStep.playbookPhase) return prev;

        // Move step to target phase
        return base.map((s) =>
          s.id === activeId ? { ...s, playbookPhase: targetPhase } : s,
        );
      });
    },
    [serverSteps],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) {
      setLocalSteps(null);
      return;
    }

    const activeType = active.data.current?.type;
    const overId = String(over.id);

    // CASE 1: Library item dropped on canvas
    if (activeType === 'library') {
      const stepTemplateId = active.data.current?.stepTemplateId as string | undefined;
      if (!stepTemplateId) { setLocalSteps(null); return; }

      // Determine target phase from over
      const PHASE_SET = new Set<string>(PHASE_ORDER);
      let targetPhase: PhaseType = 'NONE';
      if (PHASE_SET.has(overId)) {
        targetPhase = overId as PhaseType;
      } else {
        const overStep = steps.find((s) => s.id === overId);
        if (overStep) targetPhase = overStep.playbookPhase;
      }

      setLocalSteps(null);
      addStepMutation.mutate({
        playbookId,
        stepTemplateId,
        playbookPhase: targetPhase,
      });
      return;
    }

    // CASE 2: Existing step reordered or moved across phases
    if (activeType === 'step') {
      const currentSteps = localSteps ?? serverSteps;
      if (currentSteps.length === 0) { setLocalSteps(null); return; }

      const activeId = String(active.id);
      const activeStep = currentSteps.find((s) => s.id === activeId);
      if (!activeStep) { setLocalSteps(null); return; }

      // Figure out drop target phase and new position
      const PHASE_SET = new Set<string>(PHASE_ORDER);
      let targetPhase: PhaseType = activeStep.playbookPhase;
      if (PHASE_SET.has(overId)) {
        targetPhase = overId as PhaseType;
      } else {
        const overStep = currentSteps.find((s) => s.id === overId);
        if (overStep) targetPhase = overStep.playbookPhase;
      }

      // Move the active step to the target phase
      let reordered = currentSteps.map((s) =>
        s.id === activeId ? { ...s, playbookPhase: targetPhase } : s,
      );

      // If dropped on another step, reorder within that phase
      if (!PHASE_SET.has(overId)) {
        const activeIdx = reordered.findIndex((s) => s.id === activeId);
        if (activeIdx !== -1) {
          const [moved] = reordered.splice(activeIdx, 1);
          const insertAt = reordered.findIndex((s) => s.id === overId);
          reordered.splice(insertAt >= 0 ? insertAt : reordered.length, 0, moved);
        }
      }

      // Assign global sequences in phase order
      const payload: Array<{ stepId: string; sequence: number; playbookPhase: PhaseType }> = [];
      let seq = 0;
      PHASE_ORDER.forEach((phase) => {
        reordered
          .filter((s) => s.playbookPhase === phase)
          .forEach((s) => {
            payload.push({ stepId: s.id, sequence: seq++, playbookPhase: phase });
          });
      });

      setLocalSteps(
        reordered.map((s) => {
          const found = payload.find((p) => p.stepId === s.id);
          return found ? { ...s, sequence: found.sequence } : s;
        }),
      );

      reorderStepsMutation.mutate({ playbookId, steps: payload });
    }
  }

  // Active drag item (for DragOverlay)
  const activeDragStep = activeDragId
    ? steps.find((s) => s.id === activeDragId)
    : null;

  const selectedStep = selectedStepId
    ? steps.find((s) => s.id === selectedStepId) ?? null
    : null;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground">
        Checklist not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background flex-shrink-0">
        <Link
          href="/checklists"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Checklists
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <h1 className="text-sm font-semibold text-foreground truncate max-w-xs">
          {playbook.name}
        </h1>
        {(reorderStepsMutation.isPending || addStepMutation.isPending) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
        )}
      </div>

      {/* 3-column layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Step Library (280px) */}
          <div className="w-[280px] flex-shrink-0 border-r border-border overflow-y-auto bg-muted/20">
            <StepLibraryPanel playbookId={playbookId} />
          </div>

          {/* Center: Builder canvas (flex-1) */}
          <div className="flex-1 overflow-y-auto p-4">
            <BuilderCanvas
              steps={steps}
              playbookId={playbookId}
              selectedStepId={selectedStepId}
              onSelectStep={(id) =>
                setSelectedStepId((prev) => (prev === id ? null : id))
              }
            />
          </div>

          {/* Right: Step Detail Editor (360px, slide-in) */}
          {selectedStep && (
            <div className="w-[360px] flex-shrink-0 border-l border-border overflow-y-auto bg-background">
              <StepDetailEditor
                playbookId={playbookId}
                step={selectedStep}
                onClose={() => setSelectedStepId(null)}
              />
            </div>
          )}
        </div>

        {/* Drag overlay — ghost for existing steps */}
        <DragOverlay>
          {activeDragStep ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-primary bg-background shadow-xl opacity-90 text-sm font-medium max-w-[240px]">
              {activeDragStep.stepTemplate.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
