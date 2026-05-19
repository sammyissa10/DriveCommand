'use client';

/**
 * FilterChip - Removable pill for displaying active filter.
 *
 * Shows: column label, operator, value summary. Click X to remove.
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';
import type { GridFilter } from '../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterChipProps {
  filter: GridFilter;
  columnLabel: string;
  onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOperatorLabel(operator: string): string {
  const labels: Record<string, string> = {
    contains: 'contains',
    equals: 'equals',
    startsWith: 'starts with',
    endsWith: 'ends with',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
    anyOf: 'is any of',
    noneOf: 'is none of',
    eq: '=',
    neq: '≠',
    gt: '>',
    lt: '<',
    between: 'between',
    is: 'is',
    before: 'before',
    after: 'after',
    inLastNDays: 'in last N days',
  };
  return labels[operator] ?? operator;
}

function formatValue(value: unknown, operator: string): string {
  // Handle empty operators
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    return '';
  }

  // Handle array values (select filters)
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.length === 1) return String(value[0]);
    return `${value.length} values`;
  }

  // Handle date values
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Date range
    if ('from' in obj || 'to' in obj) {
      const from = obj.from instanceof Date ? format(obj.from, 'MMM d, yyyy') : null;
      const to = obj.to instanceof Date ? format(obj.to, 'MMM d, yyyy') : null;
      if (from && to) return `${from} - ${to}`;
      if (from) return from;
      if (to) return to;
    }

    // Number range
    if ('min' in obj || 'max' in obj) {
      const min = obj.min != null ? String(obj.min) : null;
      const max = obj.max != null ? String(obj.max) : null;
      if (min && max) return `${min} - ${max}`;
      if (min) return min;
      if (max) return max;
    }

    // Days
    if ('days' in obj) {
      return `${obj.days} days`;
    }
  }

  // Handle string/number
  if (value != null) {
    const str = String(value);
    // Truncate long values
    return str.length > 30 ? `${str.slice(0, 30)}...` : str;
  }

  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterChip({ filter, columnLabel, onRemove }: FilterChipProps) {
  const operatorLabel = getOperatorLabel(filter.operator);
  const valueLabel = formatValue(filter.value, filter.operator);

  // Full text for tooltip
  const fullText = valueLabel
    ? `${columnLabel} ${operatorLabel} ${valueLabel}`
    : `${columnLabel} ${operatorLabel}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="pl-2 pr-1 py-1 gap-1 max-w-[200px] truncate"
          >
            <span className="truncate">
              <span className="font-medium">{columnLabel}</span>
              <span className="text-muted-foreground mx-1">{operatorLabel}</span>
              {valueLabel && <span>{valueLabel}</span>}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Remove filter"
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{fullText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
