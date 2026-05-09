'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { StopCard } from './StopCard';
import { StopBuilderAddModal } from './StopBuilderAddModal';

// Re-export StopBuilderStop so consumers import from StopBuilder
export type { StopBuilderStop } from './StopCard';
import type { StopBuilderStop } from './StopCard';

interface StopBuilderProps {
  stops: StopBuilderStop[];
  onChange: (stops: StopBuilderStop[]) => void;
  mode: 'template' | 'load';
  /** Per-stop validation errors keyed by stop id */
  stopErrors?: Record<string, string>;
}

function resequence(stops: StopBuilderStop[]): StopBuilderStop[] {
  return stops.map((s, i) => ({ ...s, sequence_order: i + 1 }));
}

export function StopBuilder({ stops, onChange, mode, stopErrors }: StopBuilderProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = stops.findIndex((s) => s.id === active.id);
    const newIndex = stops.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(stops, oldIndex, newIndex);
    onChange(resequence(reordered));
  }

  function handleUpdate(id: string, updated: StopBuilderStop) {
    onChange(stops.map((s) => (s.id === id ? updated : s)));
  }

  function handleRemove(id: string) {
    onChange(resequence(stops.filter((s) => s.id !== id)));
  }

  function handleAdd(stop: StopBuilderStop) {
    const newStops = [...stops, stop];
    onChange(resequence(newStops));
  }

  const activeStop = activeId ? stops.find((s) => s.id === activeId) : null;
  const activeIndex = activeStop ? stops.indexOf(activeStop) : 0;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-2">
          {stops.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">No stops added yet</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Stop
              </Button>
            </div>
          ) : (
            <>
              <SortableContext
                items={stops.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {stops.map((stop, index) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    index={index}
                    mode={mode}
                    onUpdate={(updated) => handleUpdate(stop.id, updated)}
                    onRemove={() => handleRemove(stop.id)}
                    error={stopErrors?.[stop.id]}
                  />
                ))}
              </SortableContext>

              <Button
                type="button"
                variant="outline"
                className="w-full mt-2"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Stop
              </Button>
            </>
          )}
        </div>

        {/* DragOverlay for smooth visual feedback */}
        <DragOverlay>
          {activeStop ? (
            <StopCard
              stop={activeStop}
              index={activeIndex}
              mode={mode}
              onUpdate={() => {}}
              onRemove={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <StopBuilderAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onAdd={handleAdd}
        mode={mode}
      />
    </>
  );
}
