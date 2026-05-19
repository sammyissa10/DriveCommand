'use client';

/**
 * Hook for managing grid row selection with shift-range and cmd/ctrl-toggle support.
 *
 * Uses Zustand store scoped by gridId for cross-component reactivity.
 */

import { useCallback } from 'react';
import { create } from 'zustand';
import type { UseGridSelectionReturn } from './types';

// ---------------------------------------------------------------------------
// Zustand Store Factory
// ---------------------------------------------------------------------------

interface GridSelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  setSelectedIds: (ids: Set<string>) => void;
  setLastSelectedId: (id: string | null) => void;
}

const stores = new Map<string, ReturnType<typeof createSelectionStore>>();

function createSelectionStore() {
  return create<GridSelectionState>((set) => ({
    selectedIds: new Set<string>(),
    lastSelectedId: null,
    setSelectedIds: (ids) => set({ selectedIds: ids }),
    setLastSelectedId: (id) => set({ lastSelectedId: id }),
  }));
}

function getStore(gridId: string) {
  if (!stores.has(gridId)) {
    stores.set(gridId, createSelectionStore());
  }
  return stores.get(gridId)!;
}

// ---------------------------------------------------------------------------
// Selection Range Helper
// ---------------------------------------------------------------------------

/**
 * Compute the range of IDs between startId and endId (inclusive).
 * Returns the IDs in the order they appear in allRowIds.
 */
export function computeSelectionRange(
  startId: string,
  endId: string,
  allRowIds: string[]
): Set<string> {
  const startIndex = allRowIds.indexOf(startId);
  const endIndex = allRowIds.indexOf(endId);

  if (startIndex === -1 || endIndex === -1) {
    return new Set([endId]); // Fallback to just the end ID
  }

  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);

  return new Set(allRowIds.slice(minIndex, maxIndex + 1));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridSelection(gridId: string): UseGridSelectionReturn {
  const store = getStore(gridId);
  const { selectedIds, lastSelectedId, setSelectedIds, setLastSelectedId } = store();

  /**
   * Select a row, handling shift-range and cmd/ctrl-toggle modifiers.
   */
  const selectRow = useCallback(
    (id: string, event: React.MouseEvent | React.KeyboardEvent, allRowIds?: string[]) => {
      const isShiftKey = event.shiftKey;
      const isMetaKey = event.metaKey || event.ctrlKey;

      if (isShiftKey && lastSelectedId && allRowIds) {
        // Shift-click: select range from last selected to current
        const rangeIds = computeSelectionRange(lastSelectedId, id, allRowIds);
        // Add range to existing selection
        const newSelection = new Set([...Array.from(selectedIds), ...Array.from(rangeIds)]);
        setSelectedIds(newSelection);
        // Don't update lastSelectedId on shift-click
      } else if (isMetaKey) {
        // Cmd/Ctrl-click: toggle single selection
        const newSelection = new Set(selectedIds);
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        setSelectedIds(newSelection);
        setLastSelectedId(id);
      } else {
        // Normal click: replace selection with single item
        setSelectedIds(new Set([id]));
        setLastSelectedId(id);
      }
    },
    [selectedIds, lastSelectedId, setSelectedIds, setLastSelectedId]
  );

  /**
   * Select a range of rows programmatically (for shift-click support).
   */
  const selectRange = useCallback(
    (startId: string, endId: string, allRowIds: string[]) => {
      const rangeIds = computeSelectionRange(startId, endId, allRowIds);
      // Merge with existing selection
      const newSelection = new Set([...Array.from(selectedIds), ...Array.from(rangeIds)]);
      setSelectedIds(newSelection);
      setLastSelectedId(endId);
    },
    [selectedIds, setSelectedIds, setLastSelectedId]
  );

  /**
   * Select all rows.
   */
  const selectAll = useCallback(
    (allRowIds: string[]) => {
      setSelectedIds(new Set(allRowIds));
      setLastSelectedId(allRowIds[allRowIds.length - 1] ?? null);
    },
    [setSelectedIds, setLastSelectedId]
  );

  /**
   * Clear all selections.
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, [setSelectedIds, setLastSelectedId]);

  /**
   * Check if a row is selected.
   */
  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id);
    },
    [selectedIds]
  );

  return {
    selectedIds,
    selectRow,
    selectRange,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount: selectedIds.size,
  };
}
