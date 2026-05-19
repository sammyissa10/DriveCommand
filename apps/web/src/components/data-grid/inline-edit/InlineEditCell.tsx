'use client';

/**
 * InlineEditCell - Inline editing component for grid cells.
 *
 * Supports text, select, and date edit types with optimistic updates.
 * Shows visual feedback: spinner (saving), green flash (success), red flash (error).
 */

import * as React from 'react';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InlineEditCellProps<TData> {
  row: TData;
  rowId: string;
  columnId: string;
  value: unknown;
  onCellEdit?: (
    rowId: string,
    columnId: string,
    newValue: unknown,
    oldValue: unknown
  ) => Promise<void>;
  editType?: 'text' | 'select' | 'date';
  selectOptions?: Array<{ value: string; label: string }>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Save states
// ---------------------------------------------------------------------------

type SaveState = 'idle' | 'saving' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineEditCell<TData>({
  row,
  rowId,
  columnId,
  value: initialValue,
  onCellEdit,
  editType = 'text',
  selectOptions = [],
  className,
}: InlineEditCellProps<TData>) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState<string>('');
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Display value
  const displayValue = React.useMemo(() => {
    if (initialValue == null) return '';
    if (editType === 'date' && initialValue instanceof Date) {
      return initialValue.toLocaleDateString();
    }
    return String(initialValue);
  }, [initialValue, editType]);

  // Start editing
  const startEdit = React.useCallback(() => {
    if (!onCellEdit) return;
    setEditValue(displayValue);
    setIsEditing(true);
  }, [onCellEdit, displayValue]);

  // Cancel editing
  const cancelEdit = React.useCallback(() => {
    setIsEditing(false);
    setEditValue('');
    setSaveState('idle');
  }, []);

  // Commit edit
  const commitEdit = React.useCallback(async () => {
    if (!isEditing || !onCellEdit) return;

    // No change, just cancel
    if (editValue === displayValue) {
      cancelEdit();
      return;
    }

    setSaveState('saving');

    try {
      await onCellEdit(rowId, columnId, editValue, initialValue);
      setSaveState('success');

      // Show success flash for 300ms then exit edit mode
      setTimeout(() => {
        setIsEditing(false);
        setEditValue('');
        setSaveState('idle');
      }, 300);
    } catch (error) {
      setSaveState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to save');

      // Show error flash for 300ms then revert
      setTimeout(() => {
        setEditValue(displayValue);
        setSaveState('idle');
      }, 300);
    }
  }, [isEditing, editValue, displayValue, onCellEdit, rowId, columnId, initialValue, cancelEdit]);

  // Handle keyboard events
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isEditing) {
        if (e.key === 'Enter') {
          startEdit();
          e.preventDefault();
        }
      } else {
        if (e.key === 'Enter') {
          commitEdit();
          e.preventDefault();
        } else if (e.key === 'Escape') {
          cancelEdit();
          e.preventDefault();
        }
      }
    },
    [isEditing, startEdit, commitEdit, cancelEdit]
  );

  // Auto-focus input when editing starts
  React.useEffect(() => {
    if (isEditing && inputRef.current && editType === 'text') {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, editType]);

  // Render view mode
  if (!isEditing) {
    return (
      <div
        className={cn(
          'group relative flex items-center w-full h-full cursor-pointer',
          className
        )}
        onDoubleClick={startEdit}
        onKeyDown={handleKeyDown}
        tabIndex={onCellEdit ? 0 : -1}
      >
        <span className="truncate">{displayValue}</span>
        {onCellEdit && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg
              className="h-3 w-3 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </span>
        )}
      </div>
    );
  }

  // Render edit mode
  return (
    <div className="relative flex items-center w-full h-full">
      {/* Text input */}
      {editType === 'text' && (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          disabled={saveState === 'saving'}
          className={cn(
            'h-full w-full border-0 focus-visible:ring-1',
            saveState === 'success' && 'ring-2 ring-green-500',
            saveState === 'error' && 'ring-2 ring-red-500'
          )}
        />
      )}

      {/* Select dropdown */}
      {editType === 'select' && (
        <Select
          value={editValue}
          onValueChange={(val) => {
            setEditValue(val);
            // Auto-save on selection
            setTimeout(() => {
              onCellEdit?.(rowId, columnId, val, initialValue)
                .then(() => {
                  setSaveState('success');
                  setTimeout(() => {
                    setIsEditing(false);
                    setSaveState('idle');
                  }, 300);
                })
                .catch((error) => {
                  setSaveState('error');
                  toast.error(error instanceof Error ? error.message : 'Failed to save');
                  setTimeout(() => {
                    setEditValue(displayValue);
                    setSaveState('idle');
                  }, 300);
                });
            }, 0);
          }}
          disabled={saveState === 'saving'}
        >
          <SelectTrigger
            className={cn(
              'h-full w-full border-0 focus:ring-1',
              saveState === 'success' && 'ring-2 ring-green-500',
              saveState === 'error' && 'ring-2 ring-red-500'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Date input */}
      {editType === 'date' && (
        <Input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          disabled={saveState === 'saving'}
          className={cn(
            'h-full w-full border-0 focus-visible:ring-1',
            saveState === 'success' && 'ring-2 ring-green-500',
            saveState === 'error' && 'ring-2 ring-red-500'
          )}
        />
      )}

      {/* Save state indicator */}
      {saveState === 'saving' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {saveState === 'success' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Check className="h-4 w-4 text-green-500" />
        </div>
      )}
      {saveState === 'error' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <XIcon className="h-4 w-4 text-red-500" />
        </div>
      )}
    </div>
  );
}
