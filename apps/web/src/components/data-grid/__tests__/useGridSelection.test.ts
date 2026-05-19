/**
 * Unit tests for DataGrid selection utilities.
 */

import { describe, it, expect } from 'vitest';
import { computeSelectionRange } from '../core/useGridSelection';
import { parseSortString, formatSortString } from '../core/useGridUrlState';
import { DEFAULT_GRID_PREFERENCES } from '../core/types';
import type { GridPreferences } from '../core/types';

describe('computeSelectionRange', () => {
  const allRowIds = ['a', 'b', 'c', 'd', 'e'];

  it('should return range from start to end (inclusive)', () => {
    const result = computeSelectionRange('b', 'd', allRowIds);
    expect(result).toEqual(new Set(['b', 'c', 'd']));
  });

  it('should work with reversed order (end before start)', () => {
    const result = computeSelectionRange('d', 'b', allRowIds);
    expect(result).toEqual(new Set(['b', 'c', 'd']));
  });

  it('should return single item when start equals end', () => {
    const result = computeSelectionRange('c', 'c', allRowIds);
    expect(result).toEqual(new Set(['c']));
  });

  it('should return first and last when selecting full range', () => {
    const result = computeSelectionRange('a', 'e', allRowIds);
    expect(result).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
  });

  it('should fallback to endId when startId not found', () => {
    const result = computeSelectionRange('x', 'c', allRowIds);
    expect(result).toEqual(new Set(['c']));
  });

  it('should fallback to endId when endId not found', () => {
    const result = computeSelectionRange('b', 'x', allRowIds);
    expect(result).toEqual(new Set(['x']));
  });
});

describe('parseSortString', () => {
  it('should parse ascending sort', () => {
    expect(parseSortString('name:asc')).toEqual({ field: 'name', direction: 'asc' });
  });

  it('should parse descending sort', () => {
    expect(parseSortString('createdAt:desc')).toEqual({ field: 'createdAt', direction: 'desc' });
  });

  it('should return null for null input', () => {
    expect(parseSortString(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseSortString('')).toBeNull();
  });

  it('should return null for invalid direction', () => {
    expect(parseSortString('name:invalid')).toBeNull();
  });

  it('should return null for missing direction', () => {
    expect(parseSortString('name')).toBeNull();
  });

  it('should handle field names with special characters', () => {
    expect(parseSortString('user_name:asc')).toEqual({ field: 'user_name', direction: 'asc' });
  });
});

describe('formatSortString', () => {
  it('should format ascending sort', () => {
    expect(formatSortString({ field: 'name', direction: 'asc' })).toBe('name:asc');
  });

  it('should format descending sort', () => {
    expect(formatSortString({ field: 'createdAt', direction: 'desc' })).toBe('createdAt:desc');
  });

  it('should return null for null input', () => {
    expect(formatSortString(null)).toBeNull();
  });
});

describe('DEFAULT_GRID_PREFERENCES', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_GRID_PREFERENCES).toEqual({
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
      frozenColumns: [],
      density: 'normal',
      pageSize: 25,
    });
  });

  it('should merge with custom preferences', () => {
    const custom: Partial<GridPreferences> = {
      pageSize: 50,
      density: 'compact',
    };
    const merged: GridPreferences = { ...DEFAULT_GRID_PREFERENCES, ...custom };

    expect(merged.pageSize).toBe(50);
    expect(merged.density).toBe('compact');
    expect(merged.columnOrder).toEqual([]);
    expect(merged.hiddenColumns).toEqual([]);
  });
});
