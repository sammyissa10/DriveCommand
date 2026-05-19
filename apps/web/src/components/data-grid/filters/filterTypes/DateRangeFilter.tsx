'use client';

/**
 * DateRangeFilter - Filter UI for date columns.
 *
 * Supports: is, before, after, between, inLastNDays, isEmpty operators.
 * Uses native date input for simplicity (MVP).
 */

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DateFilterOperator } from '../../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DateRangeFilterProps {
  value: { from?: Date; to?: Date; days?: number };
  onChange: (value: { from?: Date; to?: Date; days?: number }) => void;
  operator: DateFilterOperator;
  onOperatorChange: (operator: DateFilterOperator) => void;
}

// ---------------------------------------------------------------------------
// Operator Labels
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<DateFilterOperator, string> = {
  is: 'Is',
  before: 'Before',
  after: 'After',
  between: 'Between',
  inLastNDays: 'In last N days',
  isEmpty: 'Is empty',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DateRangeFilter({
  value,
  onChange,
  operator,
  onOperatorChange,
}: DateRangeFilterProps) {
  // Determine which UI to show based on operator
  const showSingleDate = operator === 'is' || operator === 'before' || operator === 'after';
  const showDateRange = operator === 'between';
  const showDaysInput = operator === 'inLastNDays';

  // Convert Date to yyyy-MM-dd format for input
  const dateToInputValue = (date?: Date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  };

  // Convert input value to Date
  const inputValueToDate = (value: string) => {
    return value ? new Date(value) : undefined;
  };

  return (
    <div className="space-y-2">
      {/* Operator selector */}
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(OPERATOR_LABELS) as DateFilterOperator[]).map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Single date input */}
      {showSingleDate && (
        <div className="space-y-1">
          <Label htmlFor="date-input" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Input
            id="date-input"
            type="date"
            value={dateToInputValue(value.from)}
            onChange={(e) => onChange({ from: inputValueToDate(e.target.value) })}
            className="w-full"
          />
        </div>
      )}

      {/* Date range inputs */}
      {showDateRange && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="from-date" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="from-date"
              type="date"
              value={dateToInputValue(value.from)}
              onChange={(e) => onChange({ ...value, from: inputValueToDate(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to-date" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="to-date"
              type="date"
              value={dateToInputValue(value.to)}
              onChange={(e) => onChange({ ...value, to: inputValueToDate(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Days input */}
      {showDaysInput && (
        <div className="space-y-1">
          <Label htmlFor="days-input" className="text-xs text-muted-foreground">
            Number of days
          </Label>
          <Input
            id="days-input"
            type="number"
            min="1"
            placeholder="e.g., 30"
            value={value.days ?? ''}
            onChange={(e) => {
              const days = parseInt(e.target.value, 10);
              onChange({ days: isNaN(days) ? undefined : days });
            }}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
