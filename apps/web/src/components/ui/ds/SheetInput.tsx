'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SheetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Spells out "Required" after the label — never an asterisk. */
  required?: boolean;
  /** Inline error under the field; the input keeps its value. */
  error?: string;
}

/**
 * Labelled text input for sheets and edit-mode field groups. 46-high, `ds.input`
 * fill, radius 12. Keyboard type / return key pass straight through; errors
 * render inline and never clear the value.
 */
export const SheetInput = forwardRef<HTMLInputElement, SheetInputProps>(function SheetInput(
  { label, required = false, error, className, ...props },
  ref,
) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-ds-txt2">{label}</span>
          {required ? <span className="text-[13px] text-ds-txt3">Required</span> : null}
        </div>
      ) : null}
      <input
        ref={ref}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-[46px] w-full rounded-[12px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3',
          className,
        )}
        {...props}
      />
      {error ? <p className="text-[13px] text-ds-danger">{error}</p> : null}
    </div>
  );
});
