'use client';

/**
 * TextFilter - Filter UI for text columns.
 *
 * Supports: contains, equals, startsWith, endsWith, isEmpty, isNotEmpty operators.
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
import type { TextFilterOperator } from '../../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TextFilterProps {
  value: string;
  onChange: (value: string) => void;
  operator: TextFilterOperator;
  onOperatorChange: (operator: TextFilterOperator) => void;
}

// ---------------------------------------------------------------------------
// Operator Labels
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<TextFilterOperator, string> = {
  contains: 'Contains',
  equals: 'Equals',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  isEmpty: 'Is empty',
  isNotEmpty: 'Is not empty',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextFilter({
  value,
  onChange,
  operator,
  onOperatorChange,
}: TextFilterProps) {
  // Hide input for isEmpty/isNotEmpty operators
  const showInput = operator !== 'isEmpty' && operator !== 'isNotEmpty';

  return (
    <div className="space-y-2">
      {/* Operator selector */}
      <Select value={operator} onValueChange={onOperatorChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(OPERATOR_LABELS) as TextFilterOperator[]).map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {showInput && (
        <Input
          type="text"
          placeholder="Enter value..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full"
        />
      )}
    </div>
  );
}
