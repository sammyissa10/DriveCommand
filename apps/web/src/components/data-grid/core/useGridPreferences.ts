'use client';

/**
 * Hook for managing grid preferences (column order, widths, visibility, frozen, density, pageSize).
 *
 * Fetches from DB first (/api/user/grid-preferences/[gridId]), falls back to localStorage
 * for anonymous users. Debounced saves (500ms) to avoid excessive API calls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { DensityMode, GridPreferences, UseGridPreferencesReturn } from './types';
import { DEFAULT_GRID_PREFERENCES } from './types';

// ---------------------------------------------------------------------------
// Zustand Store Factory
// ---------------------------------------------------------------------------

interface GridPreferencesState {
  preferences: GridPreferences;
  isLoading: boolean;
  setPreferences: (prefs: Partial<GridPreferences>) => void;
  resetPreferences: () => void;
}

const stores = new Map<string, ReturnType<typeof createPreferencesStore>>();

function createPreferencesStore(gridId: string) {
  return create<GridPreferencesState>((set) => ({
    preferences: DEFAULT_GRID_PREFERENCES,
    isLoading: true,
    setPreferences: (prefs) =>
      set((state) => ({
        preferences: { ...state.preferences, ...prefs },
      })),
    resetPreferences: () =>
      set({
        preferences: DEFAULT_GRID_PREFERENCES,
      }),
  }));
}

function getStore(gridId: string) {
  if (!stores.has(gridId)) {
    stores.set(gridId, createPreferencesStore(gridId));
  }
  return stores.get(gridId)!;
}

// ---------------------------------------------------------------------------
// LocalStorage Helpers
// ---------------------------------------------------------------------------

function getLocalStorageKey(gridId: string): string {
  return `grid-prefs-${gridId}`;
}

function loadFromLocalStorage(gridId: string): GridPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(getLocalStorageKey(gridId));
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GridPreferences>;
      return { ...DEFAULT_GRID_PREFERENCES, ...parsed };
    }
  } catch {
    // Invalid JSON or localStorage not available
  }
  return null;
}

function saveToLocalStorage(gridId: string, prefs: GridPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getLocalStorageKey(gridId), JSON.stringify(prefs));
  } catch {
    // localStorage quota exceeded or not available
  }
}

function clearLocalStorage(gridId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getLocalStorageKey(gridId));
  } catch {
    // localStorage not available
  }
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

type FetchPreferencesResult =
  | { authed: true; prefs: GridPreferences | null }
  | { authed: false };

async function fetchPreferencesFromApi(gridId: string): Promise<FetchPreferencesResult> {
  try {
    const res = await fetch(`/api/user/grid-preferences/${encodeURIComponent(gridId)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        preferences?: null;
        columnOrder?: string[];
        columnWidths?: Record<string, number>;
        hiddenColumns?: string[];
        frozenColumns?: string[];
        density?: DensityMode;
        pageSize?: number;
      };
      // Authenticated with no saved prefs yet — route returns { preferences: null }.
      if (data.preferences === null) {
        return { authed: true, prefs: null };
      }
      return {
        authed: true,
        prefs: {
          columnOrder: data.columnOrder ?? DEFAULT_GRID_PREFERENCES.columnOrder,
          columnWidths: data.columnWidths ?? DEFAULT_GRID_PREFERENCES.columnWidths,
          hiddenColumns: data.hiddenColumns ?? DEFAULT_GRID_PREFERENCES.hiddenColumns,
          frozenColumns: data.frozenColumns ?? DEFAULT_GRID_PREFERENCES.frozenColumns,
          density: data.density ?? DEFAULT_GRID_PREFERENCES.density,
          pageSize: data.pageSize ?? DEFAULT_GRID_PREFERENCES.pageSize,
        },
      };
    }
    // 401 (not authenticated) or other non-ok status — fall back to localStorage
    return { authed: false };
  } catch {
    // Network error — fall back to localStorage
    return { authed: false };
  }
}

async function savePreferencesToApi(gridId: string, prefs: GridPreferences): Promise<boolean> {
  try {
    const res = await fetch(`/api/user/grid-preferences/${encodeURIComponent(gridId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridPreferences(
  gridId: string,
  enabled: boolean = true
): UseGridPreferencesReturn {
  const store = getStore(gridId);
  const { preferences, isLoading, setPreferences, resetPreferences: resetStore } = store();
  const [localIsLoading, setLocalIsLoading] = useState(true);

  // Track whether we're authenticated (API returned 200)
  const isAuthenticatedRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences on mount
  useEffect(() => {
    if (!enabled) {
      setLocalIsLoading(false);
      return;
    }

    let isMounted = true;

    async function load() {
      // Try API first
      const result = await fetchPreferencesFromApi(gridId);
      if (!isMounted) return;

      if (result.authed) {
        isAuthenticatedRef.current = true;
        if (result.prefs) {
          setPreferences(result.prefs);
        }
        // else: leave DEFAULT_GRID_PREFERENCES; future saves go to DB (PUT upserts the row)
        setLocalIsLoading(false);
        return;
      }

      // Unauthenticated — fall back to localStorage (existing behavior)
      isAuthenticatedRef.current = false;
      const localPrefs = loadFromLocalStorage(gridId);
      if (localPrefs && isMounted) {
        setPreferences(localPrefs);
      }
      if (isMounted) {
        setLocalIsLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [gridId, enabled, setPreferences]);

  // Debounced save
  const savePreferences = useCallback(
    (newPrefs: GridPreferences) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (isAuthenticatedRef.current) {
          const success = await savePreferencesToApi(gridId, newPrefs);
          // If API save failed, also save to localStorage as backup
          if (!success) {
            saveToLocalStorage(gridId, newPrefs);
          }
        } else {
          saveToLocalStorage(gridId, newPrefs);
        }
      }, 500);
    },
    [gridId]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Individual setters
  const setColumnOrder = useCallback(
    (order: string[]) => {
      const newPrefs = { ...preferences, columnOrder: order };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const setColumnWidth = useCallback(
    (columnId: string, width: number) => {
      const newPrefs = {
        ...preferences,
        columnWidths: { ...preferences.columnWidths, [columnId]: width },
      };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const setHiddenColumns = useCallback(
    (columns: string[]) => {
      const newPrefs = { ...preferences, hiddenColumns: columns };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const setFrozenColumns = useCallback(
    (columns: string[]) => {
      const newPrefs = { ...preferences, frozenColumns: columns };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const setDensity = useCallback(
    (density: DensityMode) => {
      const newPrefs = { ...preferences, density };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const setPageSize = useCallback(
    (size: number) => {
      const newPrefs = { ...preferences, pageSize: size };
      setPreferences(newPrefs);
      savePreferences(newPrefs);
    },
    [preferences, setPreferences, savePreferences]
  );

  const handleResetPreferences = useCallback(() => {
    resetStore();
    // Clear from both API and localStorage
    if (isAuthenticatedRef.current) {
      savePreferencesToApi(gridId, DEFAULT_GRID_PREFERENCES);
    }
    clearLocalStorage(gridId);
  }, [gridId, resetStore]);

  return {
    preferences,
    setColumnOrder,
    setColumnWidth,
    setHiddenColumns,
    setFrozenColumns,
    setDensity,
    setPageSize,
    resetPreferences: handleResetPreferences,
    isLoading: isLoading || localIsLoading,
  };
}
