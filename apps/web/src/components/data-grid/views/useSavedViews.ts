'use client';

/**
 * useSavedViews - Hook for managing saved grid views.
 *
 * Provides CRUD operations for grid views with TanStack Query for caching.
 * Includes dirty detection by comparing current state to selected view.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { GridViewState } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridViewDTO {
  id: string;
  gridId: string;
  userId: string;
  name: string;
  isDefault: boolean;
  schemaVersion: number;
  state: GridViewState;
  createdAt: string;
  updatedAt: string;
}

export interface CreateViewInput {
  name: string;
  isDefault?: boolean;
  state: GridViewState;
}

export interface UpdateViewInput {
  name?: string;
  isDefault?: boolean;
  state?: GridViewState;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

async function fetchViews(gridId: string): Promise<GridViewDTO[]> {
  const res = await fetch(`/api/user/grid-views/${gridId}`);
  if (!res.ok) throw new Error('Failed to fetch views');
  return res.json();
}

async function createView(
  gridId: string,
  input: CreateViewInput
): Promise<GridViewDTO> {
  const res = await fetch(`/api/user/grid-views/${gridId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message ?? 'Failed to create view');
  }
  return res.json();
}

async function updateView(
  gridId: string,
  viewId: string,
  input: UpdateViewInput
): Promise<GridViewDTO> {
  const res = await fetch(`/api/user/grid-views/${gridId}/${viewId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message ?? 'Failed to update view');
  }
  return res.json();
}

async function deleteView(gridId: string, viewId: string): Promise<void> {
  const res = await fetch(`/api/user/grid-views/${gridId}/${viewId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete view');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseSavedViewsOptions {
  gridId: string;
  currentState: GridViewState;
}

export function useSavedViews({ gridId, currentState }: UseSavedViewsOptions) {
  const queryClient = useQueryClient();

  // Fetch views
  const {
    data: views = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gridViews', gridId],
    queryFn: () => fetchViews(gridId),
  });

  // Selected view ID (local state, could be lifted to parent if needed)
  const [selectedViewId, setSelectedViewId] = React.useState<string | null>(null);

  // Find selected view
  const selectedView = useMemo(() => {
    return views.find((v) => v.id === selectedViewId) ?? null;
  }, [views, selectedViewId]);

  // Dirty detection: compare current state to selected view's state
  const isDirty = useMemo(() => {
    if (!selectedView) return false;
    return JSON.stringify(currentState) !== JSON.stringify(selectedView.state);
  }, [currentState, selectedView]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateViewInput) => createView(gridId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gridViews', gridId] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ viewId, input }: { viewId: string; input: UpdateViewInput }) =>
      updateView(gridId, viewId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gridViews', gridId] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => deleteView(gridId, viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gridViews', gridId] });
    },
  });

  // Save current state as new view
  const saveView = useCallback(
    async (name: string, isDefault?: boolean) => {
      await createMutation.mutateAsync({
        name,
        isDefault,
        state: currentState,
      });
    },
    [createMutation, currentState]
  );

  // Update selected view with current state
  const updateCurrentView = useCallback(async () => {
    if (!selectedViewId) return;
    await updateMutation.mutateAsync({
      viewId: selectedViewId,
      input: { state: currentState },
    });
  }, [updateMutation, selectedViewId, currentState]);

  // Delete view
  const deleteViewById = useCallback(
    async (viewId: string) => {
      await deleteMutation.mutateAsync(viewId);
      if (selectedViewId === viewId) {
        setSelectedViewId(null);
      }
    },
    [deleteMutation, selectedViewId]
  );

  // Select view (applies its state)
  const selectView = useCallback(
    (viewId: string | null) => {
      setSelectedViewId(viewId);
    },
    []
  );

  // Reset to default view
  const resetToDefault = useCallback(() => {
    const defaultView = views.find((v) => v.isDefault);
    setSelectedViewId(defaultView?.id ?? null);
  }, [views]);

  return {
    views,
    selectedView,
    selectedViewId,
    isDirty,
    isLoading,
    error,
    saveView,
    updateCurrentView,
    deleteView: deleteViewById,
    selectView,
    resetToDefault,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Fix missing React import
import * as React from 'react';
