'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/**
 * FormField — Wrapper for form inputs with label, error, and helper text.
 *
 * Design rules:
 * - Label always above input
 * - Required fields marked with red asterisk
 * - Error text in red below field (replaces helper when present)
 * - Helper text in muted color below field
 *
 * @example
 * <FormField label="Email" name="email" required error={errors.email}>
 *   <Input name="email" type="email" />
 * </FormField>
 */

export interface FormFieldProps {
  /** Field label displayed above the input */
  label: string;
  /** HTML name attribute (used for htmlFor on label) */
  name: string;
  /** Whether the field is required (shows red asterisk) */
  required?: boolean;
  /** Error message to display (takes precedence over helperText) */
  error?: string | string[];
  /** Helper text displayed below the input when no error */
  helperText?: string;
  /** The input element (Input, Select, Textarea, etc.) */
  children: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
}

export function FormField({
  label,
  name,
  required = false,
  error,
  helperText,
  children,
  className,
}: FormFieldProps) {
  // Normalize error to string
  const errorMessage = Array.isArray(error) ? error[0] : error;
  const hasError = Boolean(errorMessage);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label
        htmlFor={name}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {children}

      {hasError ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : helperText ? (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

/**
 * Utility to extract field error from ActionState error object.
 *
 * @example
 * const errors = getFieldErrors(state?.error);
 * <FormField error={errors?.email} ... />
 */
export function getFieldErrors(
  error: Record<string, string[] | undefined> | string | undefined
): Record<string, string | undefined> | undefined {
  if (!error || typeof error === 'string') return undefined;

  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(error)) {
    result[key] = Array.isArray(value) ? value[0] : undefined;
  }
  return result;
}
