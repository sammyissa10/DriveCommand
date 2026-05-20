/**
 * ColumnDragHandle Component
 *
 * Minimal drag handle for column reordering.
 * Vercel/Apple crisp-minimal aesthetic with subtle visual presence.
 */

'use client';

import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColumnDragHandleProps {
  /** Whether the handle is currently being dragged */
  isDragging?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ColumnDragHandle provides a subtle drag affordance for column reordering.
 *
 * Design:
 * - Icon: GripVertical with strokeWidth={1.5}
 * - Size: h-4 w-4
 * - Color: text-muted-foreground/50 (very subtle)
 * - Hover: text-muted-foreground
 * - Cursor: grab (grabbing when dragging)
 * - Minimal visual presence until hover
 *
 * @example
 * <ColumnDragHandle isDragging={isDragging} />
 */
export function ColumnDragHandle({
  isDragging,
  className,
}: ColumnDragHandleProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        'text-muted-foreground/50 hover:text-muted-foreground',
        'transition-colors duration-150',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
    >
      <GripVertical className="h-4 w-4" strokeWidth={1.5} />
    </div>
  );
}
