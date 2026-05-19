'use client';

/**
 * GridHeader - Sticky header row for DataGrid.
 *
 * Renders column headers with sort indicators, resize handles, column menus,
 * and drag handles for reordering using @dnd-kit.
 */

import * as React from 'react';
import { flexRender } from '@tanstack/react-table';
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
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronUp,
  ChevronDown,
  MoreVertical,
  GripVertical,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Snowflake,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDataGridContext } from '../core/DataGrid';
import { Checkbox } from '@/components/ui/checkbox';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridHeaderProps {
  onColumnResize?: (columnId: string, width: number) => void;
  onColumnReorder?: (columnIds: string[]) => void;
  enableSelection?: boolean;
}

// ---------------------------------------------------------------------------
// Sortable Header Cell
// ---------------------------------------------------------------------------

interface SortableHeaderCellProps {
  columnId: string;
  children: React.ReactNode;
  width?: number;
  canSort: boolean;
  isSorted: false | 'asc' | 'desc';
  onSort: () => void;
  onHide: () => void;
  onFreeze: () => void;
  onResize: (width: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
}

function SortableHeaderCell({
  columnId,
  children,
  width,
  canSort,
  isSorted,
  onSort,
  onHide,
  onFreeze,
  onResize,
  isResizing,
  setIsResizing,
}: SortableHeaderCellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: width ?? 150,
    minWidth: 80,
    opacity: isDragging ? 0.5 : 1,
  };

  // Resize handler
  const handleResizeStart = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width ?? 150;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(80, startWidth + delta);
        onResize(newWidth);
      };

      const handlePointerUp = () => {
        setIsResizing(false);
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [width, onResize, setIsResizing]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-center h-10 px-3 border-r border-border bg-muted/50',
        'text-xs font-medium uppercase tracking-wider text-muted-foreground',
        isDragging && 'z-10'
      )}
      role="columnheader"
      aria-sort={isSorted ? (isSorted === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          'mr-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity',
          'focus:opacity-100 focus:outline-none',
          isDragging && 'cursor-grabbing'
        )}
        aria-label="Drag to reorder column"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
      </button>

      {/* Column header content */}
      <div
        className={cn(
          'flex-1 truncate',
          canSort && 'cursor-pointer select-none'
        )}
        onClick={canSort ? onSort : undefined}
      >
        {children}
      </div>

      {/* Sort indicator */}
      {canSort && (
        <span className="ml-1">
          {isSorted === 'asc' && <ChevronUp className="h-3.5 w-3.5" />}
          {isSorted === 'desc' && <ChevronDown className="h-3.5 w-3.5" />}
          {!isSorted && (
            <span className="w-3.5 h-3.5 opacity-0 group-hover:opacity-30">
              <ChevronUp className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      )}

      {/* Column menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 ml-1 opacity-0 group-hover:opacity-100 transition-opacity',
              'focus:opacity-100'
            )}
            aria-label="Column options"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canSort && (
            <>
              <DropdownMenuItem onClick={onSort}>
                <ArrowUp className="mr-2 h-4 w-4" />
                Sort Ascending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSort}>
                <ArrowDown className="mr-2 h-4 w-4" />
                Sort Descending
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onHide}>
            <EyeOff className="mr-2 h-4 w-4" />
            Hide Column
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onFreeze}>
            <Snowflake className="mr-2 h-4 w-4" />
            Freeze Column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Resize handle */}
      <div
        onPointerDown={handleResizeStart}
        className={cn(
          'absolute right-0 top-0 h-full w-1 cursor-col-resize',
          'hover:bg-primary/50 transition-colors',
          isResizing && 'bg-primary'
        )}
        aria-hidden="true"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection Header Cell
// ---------------------------------------------------------------------------

interface SelectionHeaderCellProps {
  enableSelection: boolean;
}

function SelectionHeaderCell({ enableSelection }: SelectionHeaderCellProps) {
  const { table, selection } = useDataGridContext();

  if (!enableSelection) return null;

  const rows = table.getRowModel().rows;
  const allSelected = rows.length > 0 && rows.every((row) => selection.isSelected(row.id));
  const someSelected = rows.some((row) => selection.isSelected(row.id)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      selection.clearSelection();
    } else {
      selection.selectAll();
    }
  };

  return (
    <div
      className="flex items-center justify-center h-10 w-12 px-3 border-r border-border bg-muted/50"
      role="columnheader"
    >
      <Checkbox
        checked={someSelected ? 'indeterminate' : allSelected}
        onCheckedChange={handleSelectAll}
        aria-label="Select all rows"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridHeader({
  onColumnResize,
  onColumnReorder,
  enableSelection = false,
}: GridHeaderProps) {
  const { table, preferences } = useDataGridContext();
  const [isResizing, setIsResizing] = React.useState(false);

  const headerGroups = table.getHeaderGroups();
  const columns = table.getVisibleLeafColumns();
  const columnIds = columns.map((col) => col.id);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = columnIds.indexOf(active.id as string);
      const newIndex = columnIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...columnIds];
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, active.id as string);
        onColumnReorder?.(newOrder);
      }
    }
  };

  // Handle column hide
  const handleHideColumn = (columnId: string) => {
    const hiddenColumns = [...preferences.hiddenColumns, columnId];
    // Note: This would call a preference setter from context
    // For now we'll leave it as a callback
    console.log('Hide column:', columnId, hiddenColumns);
  };

  // Handle column freeze
  const handleFreezeColumn = (columnId: string) => {
    const frozenColumns = preferences.frozenColumns.includes(columnId)
      ? preferences.frozenColumns.filter((id) => id !== columnId)
      : [...preferences.frozenColumns, columnId];
    console.log('Toggle freeze column:', columnId, frozenColumns);
  };

  return (
    <div className="sticky top-0 z-20 flex bg-muted/50 border-b border-border" role="rowgroup">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="flex" role="row">
            <SelectionHeaderCell enableSelection={enableSelection} />
            {headerGroups.map((headerGroup) =>
              headerGroup.headers.map((header) => {
                const column = header.column;
                const canSort = column.getCanSort();
                const isSorted = column.getIsSorted();
                const width = column.getSize();

                return (
                  <SortableHeaderCell
                    key={header.id}
                    columnId={header.id}
                    width={width}
                    canSort={canSort}
                    isSorted={isSorted}
                    onSort={() => column.toggleSorting()}
                    onHide={() => handleHideColumn(header.id)}
                    onFreeze={() => handleFreezeColumn(header.id)}
                    onResize={(newWidth) => {
                      onColumnResize?.(header.id, newWidth);
                    }}
                    isResizing={isResizing}
                    setIsResizing={setIsResizing}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </SortableHeaderCell>
                );
              })
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
