/**
 * GridCard Component (Mobile)
 *
 * Card-based display for single row on mobile devices.
 * Supports swipe-to-reveal actions, long-press for multi-select.
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '../shared/StatusBadge';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { useLongPress } from '../../hooks/useLongPress';
import { cn } from '@/lib/utils';

export interface GridCardProps<TData> {
  row: Row<TData>;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onSelect?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  primaryColumn?: string;
  metadataColumns?: string[];
  statusColumn?: string;
  className?: string;
}

/**
 * GridCard displays a single row as a card on mobile devices.
 *
 * Design:
 * - Container: bg-card border border-border rounded-lg p-4 mb-2
 * - Title row: primary column value, text-sm font-medium
 * - Metadata rows: label-value pairs, text-xs text-muted-foreground
 * - StatusBadge: integrated for status columns
 * - Swipe-left: reveals action drawer (3 icons max)
 * - Selection: checkbox in top-right, visible in multi-select mode
 * - Tap: navigate to detail view
 * - Long-press: enter multi-select mode
 * - Selected state: ring-2 ring-primary bg-b-050
 *
 * @example
 * <GridCard
 *   row={row}
 *   isSelected={isSelected}
 *   onPress={() => {}}
 *   onLongPress={() => {}}
 *   primaryColumn="name"
 *   metadataColumns={['email', 'createdAt']}
 *   statusColumn="status"
 * />
 */
export function GridCard<TData>({
  row,
  isSelected,
  isMultiSelectMode,
  onPress,
  onLongPress,
  onSelect,
  onSwipeLeft,
  onSwipeRight,
  primaryColumn = 'name',
  metadataColumns = [],
  statusColumn,
  className,
}: GridCardProps<TData>) {
  const swipeRef = useSwipeGesture({
    onSwipeLeft,
    onSwipeRight,
    threshold: 50,
  });

  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress?.(),
    delay: 500,
  });

  const { original } = row;
  const primaryValue = (original as any)[primaryColumn] || '';
  const statusValue = statusColumn ? (original as any)[statusColumn] : null;

  return (
    <div
      ref={swipeRef}
      {...longPressHandlers}
      className={cn(
        'relative rounded-lg border border-border bg-card p-4 transition-all',
        'motion-safe:duration-200',
        isSelected && 'ring-2 ring-primary bg-b-050',
        'cursor-pointer',
        className
      )}
      onClick={onPress}
    >
      {/* Checkbox (visible in multi-select mode) */}
      {isMultiSelectMode && (
        <div className="absolute right-4 top-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Title row */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground line-clamp-1">
          {primaryValue}
        </h3>
        {statusValue && (
          <StatusBadge
            variant={
              statusValue === 'active' ? 'success' :
              statusValue === 'pending' ? 'warning' :
              statusValue === 'expired' ? 'danger' :
              'neutral'
            }
          >
            {statusValue}
          </StatusBadge>
        )}
      </div>

      {/* Metadata rows */}
      {metadataColumns.length > 0 && (
        <div className="space-y-1">
          {metadataColumns.map((columnId) => {
            const column = row.getAllCells().find((cell) => cell.column.id === columnId);
            if (!column) return null;

            const label = typeof column.column.columnDef.header === 'string'
              ? column.column.columnDef.header
              : columnId;
            const value = column.getValue();

            return (
              <div key={columnId} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs text-foreground">
                  {value ? String(value) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
