'use client';

/**
 * ColumnDragHandle - Drag handle for column reordering.
 *
 * Uses @dnd-kit/sortable for drag-and-drop functionality.
 * Only visible on header hover.
 */

import * as React from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ColumnDragHandleProps {
  /** Column ID being dragged */
  columnId: string;
  /** DnD listeners from useSortable */
  listeners?: SyntheticListenerMap;
  /** DnD attributes from useSortable */
  attributes?: DraggableAttributes;
  /** Whether column is currently being dragged */
  isDragging?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ColumnDragHandle({
  listeners,
  attributes,
  isDragging = false,
  className,
}: ColumnDragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center justify-center',
        'opacity-0 group-hover:opacity-100 transition-opacity',
        'focus:opacity-100 focus:outline-none',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      aria-label="Drag to reorder column"
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
    </button>
  );
}
