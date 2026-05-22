/**
 * GridCard Component (Mobile) — iOS HIG Compliant
 *
 * Card-based display for single row on mobile devices.
 * Follows Apple Human Interface Guidelines for lists:
 * - Grouped inset style (like iOS Settings/Health)
 * - 16px side margins, rounded-xl (12px), subtle border
 * - Primary line + StatusBadge on same row
 * - Metadata as quiet "value · code" format
 * - Trailing chevron for tap affordance
 * - Swipe-left to reveal Edit/Delete actions
 * - Long-press (500ms) for multi-select with haptic
 */

'use client';

import { type Row } from '@tanstack/react-table';
import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '../shared/StatusBadge';
import { useLongPress } from '../../hooks/useLongPress';
import { cn } from '@/lib/utils';

export interface GridCardProps<TData> {
  row: Row<TData>;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  primaryColumn?: string;
  metadataColumns?: string[];
  statusColumn?: string;
  className?: string;
}

// iOS action button widths
const ACTION_WIDTH = 72;

/**
 * GridCard displays a single row as a card on mobile devices.
 *
 * Design (iOS HIG - Grouped Inset Style):
 * - Container: bg-surface (Paper white), rounded-xl (12px), 1px border at border/30
 * - Internal padding: 16px
 * - TOP ROW: primary identifier (17px font-medium, truncate) + StatusBadge inline right
 * - SECONDARY ROW: metadata as "value · code" format (text-muted-foreground, text-sm)
 * - TRAILING: chevron-right (›) icon, 16px, muted
 * - Touch target: min-height 44px
 *
 * Interactions:
 * - Tap → onPress (navigate to detail)
 * - Swipe LEFT → reveal Edit (Signal Blue) + Delete (red) actions
 * - Long-press (500ms) → enter multi-select mode
 * - In multi-select: checkbox replaces chevron
 */
export function GridCard<TData>({
  row,
  isSelected,
  isMultiSelectMode,
  onPress,
  onLongPress,
  onSelect,
  onEdit,
  onDelete,
  primaryColumn = 'name',
  metadataColumns = [],
  statusColumn,
  className,
}: GridCardProps<TData>) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Long press for multi-select with haptic feedback
  const longPressHandlers = useLongPress({
    onLongPress: () => {
      // Trigger haptic feedback if available
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      onLongPress?.();
    },
    delay: 500,
  });

  // Data extraction
  const { original } = row;
  const primaryValue = (original as Record<string, unknown>)[primaryColumn] || '';
  const statusValue = statusColumn
    ? (original as Record<string, unknown>)[statusColumn] as string | null
    : null;

  // Build metadata string in "value · code" format
  const metadataString = metadataColumns
    .slice(0, 2) // Max 2 metadata items on mobile
    .map((columnId) => {
      if (columnId === statusColumn) return null; // Skip status (shown as badge)
      const cell = row.getAllCells().find((c) => c.column.id === columnId);
      if (!cell) return null;
      const value = cell.getValue();
      return value ? String(value) : null;
    })
    .filter(Boolean)
    .join(' · ');

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMultiSelectMode) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = startXRef.current;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || isMultiSelectMode) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = startXRef.current - currentXRef.current;

    // Only allow left swipe (positive diff), with resistance
    if (diff > 0) {
      const maxSwipe = ACTION_WIDTH * 2; // Two actions
      const clampedDiff = Math.min(diff, maxSwipe + 20); // Slight overscroll
      setSwipeOffset(clampedDiff);
    } else {
      // Allow closing swipe (negative diff)
      setSwipeOffset(Math.max(0, swipeOffset + diff / 3));
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const maxSwipe = ACTION_WIDTH * 2;
    const threshold = maxSwipe / 2;

    // Snap to open or closed
    if (swipeOffset > threshold) {
      setSwipeOffset(maxSwipe);
    } else {
      setSwipeOffset(0);
    }
  };

  // Reset swipe when multi-select mode changes
  useEffect(() => {
    if (isMultiSelectMode) {
      setSwipeOffset(0);
    }
  }, [isMultiSelectMode]);

  // Close swipe on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setSwipeOffset(0);
      }
    };
    if (swipeOffset > 0) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [swipeOffset]);

  const handleCardClick = () => {
    if (swipeOffset > 0) {
      setSwipeOffset(0);
      return;
    }
    if (isMultiSelectMode) {
      onSelect?.();
    } else {
      onPress?.();
    }
  };

  // Determine status badge variant
  const getStatusVariant = (status: string | null): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    if (!status) return 'neutral';
    const s = status.toLowerCase();
    if (s === 'active' || s === 'delivered' || s === 'completed' || s === 'on-time') return 'success';
    if (s === 'pending' || s === 'at-risk' || s === 'warning') return 'warning';
    if (s === 'expired' || s === 'terminated' || s === 'delayed' || s === 'blocked' || s === 'inactive') return 'danger';
    if (s === 'in-transit' || s === 'in_transit') return 'info';
    return 'neutral';
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative overflow-hidden',
        // Container: rounded-xl (12px), subtle border
        'rounded-xl',
        className
      )}
    >
      {/* Swipe action background (revealed when swiping) */}
      <div className="absolute inset-0 flex justify-end">
        {/* Edit action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSwipeOffset(0);
            onEdit?.();
          }}
          className="flex h-full items-center justify-center text-white transition-opacity"
          style={{
            width: ACTION_WIDTH,
            backgroundColor: 'var(--grid-accent, #0A21C0)',
            opacity: swipeOffset > ACTION_WIDTH / 2 ? 1 : swipeOffset / ACTION_WIDTH,
          }}
          aria-label="Edit"
        >
          <Pencil className="h-5 w-5" strokeWidth={1.6} />
        </button>
        {/* Delete action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSwipeOffset(0);
            onDelete?.();
          }}
          className="flex h-full items-center justify-center text-white transition-opacity"
          style={{
            width: ACTION_WIDTH,
            backgroundColor: '#FF3B30', // iOS red
            opacity: swipeOffset > ACTION_WIDTH ? 1 : Math.max(0, (swipeOffset - ACTION_WIDTH / 2) / ACTION_WIDTH),
          }}
          aria-label="Delete"
        >
          <Trash2 className="h-5 w-5" strokeWidth={1.6} />
        </button>
      </div>

      {/* Main card content */}
      <div
        {...longPressHandlers}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
        className={cn(
          'relative z-10',
          // Surface: Paper white, border
          'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
          'border border-[var(--grid-n200,#D0D1D7)]/30',
          'dark:border-[var(--grid-n200,#374151)]/30',
          'rounded-xl',
          // Padding: 16px internal
          'p-4',
          // Selection state
          isSelected && 'ring-2 ring-[var(--grid-accent,#0A21C0)] bg-[var(--grid-selected)]',
          // Touch feedback
          'active:bg-[var(--grid-hover)] transition-colors',
          // Cursor
          'cursor-pointer select-none',
          // Touch target min height
          'min-h-[44px]'
        )}
        style={{
          transform: `translateX(-${swipeOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* TOP ROW: Primary + Status + Chevron/Checkbox */}
        <div className="flex items-center gap-3">
          {/* Checkbox (multi-select mode) - slides in from left */}
          {isMultiSelectMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect?.()}
              onClick={(e) => e.stopPropagation()}
              aria-label="Select row"
              className="shrink-0"
            />
          )}

          {/* Primary value */}
          <h3
            className="flex-1 truncate text-[17px] font-medium leading-tight"
            style={{
              color: 'var(--grid-ink, #141619)',
              fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
            }}
          >
            {String(primaryValue)}
          </h3>

          {/* Status badge */}
          {statusValue && (
            <StatusBadge variant={getStatusVariant(statusValue)} className="shrink-0">
              {statusValue}
            </StatusBadge>
          )}

          {/* Chevron (hidden in multi-select mode) */}
          {!isMultiSelectMode && (
            <ChevronRight
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--grid-n400, #8E909A)' }}
              strokeWidth={1.6}
            />
          )}
        </div>

        {/* SECONDARY ROW: Metadata in "value · code" format */}
        {metadataString && (
          <p
            className="mt-1 truncate text-sm"
            style={{
              color: 'var(--grid-n500, #6B6E78)',
              fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
            }}
          >
            {metadataString}
          </p>
        )}
      </div>
    </div>
  );
}
