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
  useCommandState,
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
// What the search took away
// ---------------------------------------------------------------------------

/**
 * Shown when the list has nothing in it AT ALL, as opposed to nothing matching.
 *
 * Those two states used to render the same sentence: `emptyMessage` is the
 * caller's, and it is written for a search that found nothing ("No drivers
 * found."), so an empty roster borrowed it and read as though a search had
 * happened. This component does not know whether its options are drivers,
 * trucks or trips, so it does not name a noun.
 */
export const NO_OPTIONS_MESSAGE = 'Nothing to choose from.';

/**
 * Which of the two empty states this is.
 *
 * `CommandEmpty` fires whenever cmdk's filtered count is zero, which is true
 * BOTH when a search matched nothing and when there was never anything to
 * match. Exported so the distinction is pinned by a test rather than living as
 * an inline ternary nobody can assert.
 */
export function emptyMessageFor(total: number, emptyMessage: string): string {
  return total === 0 ? NO_OPTIONS_MESSAGE : emptyMessage;
}

/**
 * The footer's whole sentence, or `null` when there should be no footer.
 *
 * Pure and exported because this is the actual decision — when to speak, and
 * what to say — and there is no jsdom or testing-library in this app, so a
 * mounted cmdk assertion is not available. Same shape as `assignment-options.ts`:
 * the judgement lives in a function a test can drive, the component is a thin
 * consumer.
 *
 * ONE STRING PER SENTENCE, never assembled from JSX children — quick-517.
 * `<p>{n} of {m} hidden</p>` is five children, three of them whitespace
 * sensitive, and that shape rendered "4 stopswill" on screen across two
 * investigations that both blamed JSX trimming and were both wrong.
 */
export function hiddenBySearchText(
  search: string,
  shown: number,
  total: number,
): string | null {
  const hidden = total - shown;
  // Nothing typed, or nothing removed: say nothing. A footer permanently
  // reading "0 of 14 hidden" is noise that teaches people to stop reading it.
  if (!search.trim() || hidden <= 0) return null;
  return `${hidden} of ${total} hidden by your search`;
}

/**
 * The count of options the search removed.
 *
 * WHY THIS EXISTS. cmdk hides a non-matching item outright, leaving no trace of
 * it. On the assignment screen the truck list carries three BLOCKED trucks
 * sorted last, so a term that excludes them gives a dispatcher no signal they
 * were ever there — and blocked options are exactly the ones worth knowing
 * about. Silently omitting them is this component's worst failure mode.
 *
 * WHY IT IS A SUBCOMPONENT AND NOT A PROP. `useCommandState` reads Command's
 * context, so this must render inside `<Command>` — and that is the point: the
 * filter term stays where the filtering happens. Lifting it into a prop would
 * hand every caller a piece of state they neither own nor should re-implement.
 *
 * WHERE IT SITS. Outside `<CommandList>`, which is `max-h-[300px]
 * overflow-y-auto`. Inside it, the count would scroll away from the results it
 * describes on any list long enough to need it — which is every list long
 * enough to need it.
 *
 * `role="status"` announces the change to a screen reader, which is chatty by
 * keystroke but is the only signal a non-sighted user gets that the list is
 * incomplete. Silence was judged the worse trade.
 */
function HiddenCount({ total }: { total: number }) {
  const search = useCommandState((state) => state.search);
  const shown = useCommandState((state) => state.filtered.count);

  const text = hiddenBySearchText(search, shown, total);
  if (text === null) return null;

  return (
    <div
      role="status"
      className="border-t border-border px-3 py-2 text-xs text-muted-foreground"
    >
      {text}
    </div>
  );
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
            {/*
              Two states that used to look identical. `CommandEmpty` fires
              whenever cmdk's filtered count is zero, which happens BOTH when a
              search matched nothing and when there was never anything to match.
              `emptyMessage` is the caller's and is written for the first.
            */}
            <CommandEmpty>{emptyMessageFor(options.length, emptyMessage)}</CommandEmpty>
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
          {/* Outside the scroll area on purpose — see `HiddenCount`. */}
          <HiddenCount total={options.length} />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
