/**
 * SelectAllCheckbox Component
 *
 * Tri-state checkbox for select-all functionality.
 * Shows unchecked/indeterminate/checked states.
 */

'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SelectAllCheckboxProps {
  /** Current checked state */
  checked: 'unchecked' | 'indeterminate' | 'checked';
  /** Checked change handler */
  onCheckedChange: (checked: boolean) => void;
  /** Number of rows on current page */
  currentPageCount: number;
  /** Total number of rows across all pages */
  totalRows: number;
  /** Page size */
  pageSize: number;
  /** Callback when user clicks "Select all X rows" */
  onSelectAllPages?: () => void;
}

/**
 * SelectAllCheckbox provides tri-state selection with banner for "select all pages".
 *
 * States:
 * - unchecked: No rows selected
 * - indeterminate: Some rows selected (shows horizontal bar)
 * - checked: All rows on current page selected
 *
 * Behavior:
 * - When indeterminate → click → select all on current page
 * - When checked and totalRows > pageSize → show banner "All X on this page selected. Select all Y?"
 *
 * @example
 * <SelectAllCheckbox
 *   checked="indeterminate"
 *   onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
 *   currentPageCount={25}
 *   totalRows={150}
 *   pageSize={25}
 * />
 */
export function SelectAllCheckbox({
  checked,
  onCheckedChange,
  currentPageCount,
  totalRows,
  pageSize,
  onSelectAllPages,
}: SelectAllCheckboxProps) {
  const [showAllPagesBanner, setShowAllPagesBanner] = useState(false);

  const handleCheckedChange = (value: boolean | 'indeterminate') => {
    const isChecked = value === true;
    onCheckedChange(isChecked);

    // Show banner when all on current page selected and there are more pages
    if (isChecked && totalRows > pageSize) {
      setShowAllPagesBanner(true);
    } else {
      setShowAllPagesBanner(false);
    }
  };

  const handleSelectAllPages = () => {
    onSelectAllPages?.();
    setShowAllPagesBanner(false);
  };

  return (
    <div className="relative">
      <Checkbox
        checked={
          checked === 'checked' ? true : checked === 'indeterminate' ? 'indeterminate' : false
        }
        onCheckedChange={handleCheckedChange}
        aria-label={`Select all ${currentPageCount} rows on this page`}
      />

      {/* Banner for "Select all pages" */}
      {showAllPagesBanner && onSelectAllPages && (
        <div className="absolute left-0 top-8 z-20 whitespace-nowrap rounded-md border border-border bg-background px-3 py-2 text-xs shadow-lg">
          All {currentPageCount} on this page selected.{' '}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs font-medium text-primary"
            onClick={handleSelectAllPages}
          >
            Select all {totalRows}?
          </Button>
        </div>
      )}
    </div>
  );
}
