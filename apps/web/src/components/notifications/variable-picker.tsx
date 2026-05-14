'use client';

import type { VariableDef } from '@/lib/notifications/types';

interface VariablePickerProps {
  variables: VariableDef[];
  onInsert: (name: string) => void;
}

/**
 * Renders a list of clickable variable chips.
 * Each row: pill with {{name}} + description text + sample value in gray.
 * Clicking a row calls onInsert(variable.name).
 */
export function VariablePicker({ variables, onInsert }: VariablePickerProps) {
  if (variables.length === 0) {
    return (
      <div className="text-xs text-gray-400 p-2">No variables available</div>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 px-1">
        Variables
      </p>
      {variables.map((variable) => (
        <button
          key={variable.name}
          type="button"
          onClick={() => onInsert(variable.name)}
          className="text-left rounded-md px-2 py-1.5 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors group"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-700 group-hover:bg-blue-200">
              {`{{${variable.name}}}`}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-tight">{variable.description}</p>
          <p className="text-xs text-gray-400 leading-tight mt-0.5 truncate">
            e.g. {variable.sampleValue}
          </p>
        </button>
      ))}
    </div>
  );
}
