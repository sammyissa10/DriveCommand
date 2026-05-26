'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional status for display - e.g., 'available', 'on_trip', 'off_duty' */
  status?: string;
  /** Optional secondary label - e.g., truck make/model */
  secondaryLabel?: string;
  /** Whether this option should be disabled */
  disabled?: boolean;
  /** Sort priority - higher numbers appear first */
  sortPriority?: number;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Show status badges next to options */
  showStatus?: boolean;
  /** Auto-sort options by status (available first) */
  sortByStatus?: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string; priority: number }> = {
  available: {
    label: 'Available',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    priority: 100,
  },
  dispatch_ready: {
    label: 'Ready',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    priority: 100,
  },
  on_trip: {
    label: 'On Trip',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    priority: 50,
  },
  in_transit: {
    label: 'In Transit',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    priority: 50,
  },
  off_duty: {
    label: 'Off Duty',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    priority: 30,
  },
  not_ready: {
    label: 'Not Ready',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    priority: 20,
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    priority: 10,
  },
  // Truck statuses
  ready_to_use: {
    label: 'Ready',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    priority: 100,
  },
  in_use: {
    label: 'In Use',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    priority: 50,
  },
  in_maintenance: {
    label: 'Maintenance',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    priority: 20,
  },
  expired_docs: {
    label: 'Expired Docs',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    priority: 10,
  },
};

function getStatusConfig(status: string | undefined) {
  if (!status) return null;
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_CONFIG[normalized] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    priority: 0,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  disabled = false,
  className,
  showStatus = false,
  sortByStatus = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

  // Sort options by status priority if enabled
  const sortedOptions = React.useMemo(() => {
    if (!sortByStatus) return options;
    return [...options].sort((a, b) => {
      const priorityA = a.sortPriority ?? getStatusConfig(a.status)?.priority ?? 0;
      const priorityB = b.sortPriority ?? getStatusConfig(b.status)?.priority ?? 0;
      return priorityB - priorityA;
    });
  }, [options, sortByStatus]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {sortedOptions.map((option) => {
                const statusConfig = showStatus ? getStatusConfig(option.status) : null;
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value === value ? '' : option.value);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          value === option.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="truncate">{option.label}</span>
                        {option.secondaryLabel && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {option.secondaryLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {statusConfig && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0',
                          statusConfig.className
                        )}
                      >
                        {statusConfig.label}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
