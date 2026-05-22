/**
 * ColumnsMenu Component (Drag-to-Reorder) — DriveCommand Brand
 *
 * Dropdown menu for showing/hiding and reordering columns.
 * Features:
 * - Drag handles (6-dot grip) for reordering
 * - Eye icons for visibility toggle
 * - Persists order via onColumnOrderChange
 * - "Show all" / "Hide all" controls
 */

'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ExtendedColumnDef } from '../../core/types';

interface ColumnItem {
  id: string;
  name: string;
  isHidden: boolean;
  isHideable: boolean;
}

interface SortableColumnRowProps {
  column: ColumnItem;
  onToggleVisibility: (columnId: string) => void;
}

function SortableColumnRow({ column, onToggleVisibility }: SortableColumnRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded',
        'hover:bg-accent/5 transition-colors',
        isDragging && 'opacity-50 bg-accent/10'
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className={cn(
          'flex items-center justify-center h-5 w-5 cursor-grab active:cursor-grabbing',
          'text-muted-foreground hover:text-foreground transition-colors',
          !column.isHideable && 'opacity-30 cursor-not-allowed'
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* Eye toggle */}
      <button
        type="button"
        onClick={() => column.isHideable && onToggleVisibility(column.id)}
        disabled={!column.isHideable}
        className={cn(
          'flex items-center justify-center h-5 w-5 transition-colors',
          column.isHidden
            ? 'text-muted-foreground/50 hover:text-muted-foreground'
            : 'text-[var(--grid-accent,#0A21C0)] hover:text-[var(--grid-accent,#0A21C0)]/80',
          !column.isHideable && 'opacity-30 cursor-not-allowed'
        )}
        title={column.isHidden ? 'Show column' : 'Hide column'}
      >
        {column.isHidden ? (
          <EyeOff className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={1.5} />
        )}
      </button>

      {/* Column label */}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          column.isHidden ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {column.name}
      </span>

      {/* Required indicator */}
      {!column.isHideable && (
        <span className="text-[10px] text-muted-foreground">Required</span>
      )}
    </div>
  );
}

export interface ColumnsMenuProps<TData> {
  /** Column definitions */
  columns: ExtendedColumnDef<TData>[];
  /** Hidden column IDs */
  hiddenColumns: string[];
  /** Hidden columns change handler */
  onHiddenColumnsChange: (columns: string[]) => void;
  /** Column order (IDs in display order) */
  columnOrder: string[];
  /** Column order change handler */
  onColumnOrderChange: (order: string[]) => void;
  /** Additional CSS classes */
  className?: string;
}

export function ColumnsMenu<TData>({
  columns,
  hiddenColumns,
  onHiddenColumnsChange,
  columnOrder,
  onColumnOrderChange,
  className,
}: ColumnsMenuProps<TData>) {
  const [open, setOpen] = useState(false);

  // Build ordered column items (exclude select/actions)
  const columnItems: ColumnItem[] = useMemo(() => {
    const dataColumns = columns.filter(
      (col) => col.id !== 'select' && col.id !== 'actions'
    );

    // If we have a column order, sort by it; otherwise use definition order
    const orderedColumns =
      columnOrder.length > 0
        ? [...dataColumns].sort((a, b) => {
            const aIndex = columnOrder.indexOf(a.id!);
            const bIndex = columnOrder.indexOf(b.id!);
            // Put unordered columns at the end
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          })
        : dataColumns;

    return orderedColumns.map((col) => {
      const meta = col.meta as { hideable?: boolean } | undefined;
      return {
        id: col.id!,
        name: typeof col.header === 'string' ? col.header : col.id!,
        isHidden: hiddenColumns.includes(col.id!),
        isHideable: meta?.hideable !== false,
      };
    });
  }, [columns, hiddenColumns, columnOrder]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = columnItems.findIndex((item) => item.id === active.id);
      const newIndex = columnItems.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(
        columnItems.map((item) => item.id),
        oldIndex,
        newIndex
      );
      onColumnOrderChange(newOrder);
    }
  };

  // Toggle visibility
  const handleToggleVisibility = (columnId: string) => {
    if (hiddenColumns.includes(columnId)) {
      // Show column
      onHiddenColumnsChange(hiddenColumns.filter((id) => id !== columnId));
    } else {
      // Hide column
      onHiddenColumnsChange([...hiddenColumns, columnId]);
    }
  };

  // Show all hideable columns
  const handleShowAll = () => {
    const hideableIds = columnItems
      .filter((col) => col.isHideable)
      .map((col) => col.id);
    onHiddenColumnsChange(hiddenColumns.filter((id) => !hideableIds.includes(id)));
  };

  // Hide all hideable columns
  const handleHideAll = () => {
    const hideableIds = columnItems
      .filter((col) => col.isHideable)
      .map((col) => col.id);
    const newHidden = [...new Set([...hiddenColumns, ...hideableIds])];
    onHiddenColumnsChange(newHidden);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'bg-transparent hover:bg-[var(--grid-toolbar-hover)]',
            'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]',
            className
          )}
          style={{
            borderRadius: 'var(--grid-radius-button, 6px)',
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        >
          <Columns3 className="mr-2 h-4 w-4" strokeWidth={1.6} />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Show / hide and reorder columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Sortable column list */}
        <div className="max-h-[300px] overflow-y-auto py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columnItems.map((col) => col.id)}
              strategy={verticalListSortingStrategy}
            >
              {columnItems.map((column) => (
                <SortableColumnRow
                  key={column.id}
                  column={column}
                  onToggleVisibility={handleToggleVisibility}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <DropdownMenuSeparator />

        {/* Show all / Hide all controls */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <button
            type="button"
            className="text-xs hover:underline"
            style={{ color: 'var(--grid-accent, #0A21C0)' }}
            onClick={handleShowAll}
          >
            Show all
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={handleHideAll}
          >
            Hide all
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
