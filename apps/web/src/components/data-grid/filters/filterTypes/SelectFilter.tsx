'use client';

/**
 * SelectFilter - Filter UI for select/enum columns.
 *
 * Supports: anyOf, noneOf, isEmpty operators with multi-select dropdown.
 */

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SelectFilterOperator } from '../../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SelectFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
  operator: SelectFilterOperator;
  onOperatorChange: (operator: SelectFilterOperator) => void;
  options: Array<{ value: string; label: string }>;
}

// ---------------------------------------------------------------------------
// Operator Labels
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<SelectFilterOperator, string> = {
  anyOf: 'Is any of',
  noneOf: 'Is none of',
  isEmpty: 'Is empty',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SelectFilter({
  value,
  onChange,
  operator,
  onOperatorChange,
  options,
}: SelectFilterProps) {
  const [open, setOpen] = React.useState(false);

  // Hide selector for isEmpty operator
  const showSelector = operator !== 'isEmpty';

  // Toggle value selection
  const toggleValue = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  // Get label for value
  const getLabel = (val: string) => {
    return options.find((opt) => opt.value === val)?.label ?? val;
  };

  return (
    <div className="space-y-2">
      {/* Operator selector */}
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(OPERATOR_LABELS) as SelectFilterOperator[]).map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value selector */}
      {showSelector && (
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {value.length === 0 ? (
                  <span className="text-muted-foreground">Select values...</span>
                ) : (
                  <span>{value.length} selected</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandEmpty>No options found.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => toggleValue(option.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value.includes(option.value) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Selected badges */}
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {value.map((val) => (
                <Badge key={val} variant="secondary" className="text-xs">
                  {getLabel(val)}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
