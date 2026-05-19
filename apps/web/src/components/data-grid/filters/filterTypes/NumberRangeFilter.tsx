'use client';

/**
 * NumberRangeFilter - Filter UI for number columns.
 *
 * Supports: eq, neq, gt, lt, between, isEmpty operators.
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
import type { NumberFilterOperator } from '../../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NumberRangeFilterProps {
  value: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number }) => void;
  operator: NumberFilterOperator;
  onOperatorChange: (operator: NumberFilterOperator) => void;
}

// ---------------------------------------------------------------------------
// Operator Labels
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<NumberFilterOperator, string> = {
  eq: 'Equals',
  neq: 'Not equals',
  gt: 'Greater than',
  lt: 'Less than',
  between: 'Between',
  isEmpty: 'Is empty',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NumberRangeFilter({
  value,
  onChange,
  operator,
  onOperatorChange,
}: NumberRangeFilterProps) {
  // Show single input for eq/neq/gt/lt, two inputs for between, none for isEmpty
  const showSingleInput = ['eq', 'neq', 'gt', 'lt'].includes(operator);
  const showRangeInputs = operator === 'between';

  return (
    <div className="space-y-2">
      {/* Operator selector */}
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(OPERATOR_LABELS) as NumberFilterOperator[]).map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Single value input */}
      {showSingleInput && (
        <Input
          type="number"
          placeholder="Enter value..."
          value={value.min ?? ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            onChange({ min: isNaN(num) ? undefined : num });
          }}
          className="w-full"
        />
      )}

      {/* Range inputs */}
      {showRangeInputs && (
        <div className="space-y-2">
          <Input
            type="number"
            placeholder="Min value..."
            value={value.min ?? ''}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              onChange({ ...value, min: isNaN(num) ? undefined : num });
            }}
            className="w-full"
          />
          <Input
            type="number"
            placeholder="Max value..."
            value={value.max ?? ''}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              onChange({ ...value, max: isNaN(num) ? undefined : num });
            }}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
