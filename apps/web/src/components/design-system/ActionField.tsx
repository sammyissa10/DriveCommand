'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FormField, type FormFieldProps } from './FormField';

/**
 * ActionField — Form field with an inline action button.
 *
 * Design rules:
 * - Action button is inside the input container
 * - Shows loading state during action
 * - On failure, shows non-blocking inline message (never blocks save)
 * - Inherits all FormField props
 *
 * @example
 * <ActionField
 *   label="VIN"
 *   name="vin"
 *   actionLabel="Lookup"
 *   onAction={handleVinLookup}
 *   loading={isLookingUp}
 *   actionError="Could not decode VIN"
 *   helperText="17 characters, no I, O, or Q"
 * >
 *   <Input name="vin" maxLength={17} className="pr-24" />
 * </ActionField>
 */

export interface ActionFieldProps extends Omit<FormFieldProps, 'children'> {
  /** The input element */
  children: React.ReactElement<{ className?: string }>;
  /** Label for the action button */
  actionLabel: string;
  /** Handler when action button is clicked */
  onAction: () => void;
  /** Whether the action is in progress */
  loading?: boolean;
  /** Whether the action button is disabled */
  actionDisabled?: boolean;
  /** Non-blocking error message from the action (shown as warning, not error) */
  actionError?: string;
  /** Success message from the action */
  actionSuccess?: string;
}

export function ActionField({
  children,
  actionLabel,
  onAction,
  loading = false,
  actionDisabled = false,
  actionError,
  actionSuccess,
  helperText,
  ...formFieldProps
}: ActionFieldProps) {
  // Combine helper text with action feedback
  let displayHelperText = helperText;
  if (actionError) {
    displayHelperText = actionError;
  } else if (actionSuccess) {
    displayHelperText = actionSuccess;
  }

  // Get the existing className from child props
  const childClassName = children.props.className ?? '';

  return (
    <FormField {...formFieldProps} helperText={displayHelperText}>
      <div className="relative flex items-center">
        {/* Clone child with padding for button */}
        {React.cloneElement(children, {
          className: cn(childClassName, 'pr-24'),
        })}

        {/* Action button */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAction}
            disabled={loading || actionDisabled}
            className="h-8 px-3"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                <span>Loading</span>
              </>
            ) : (
              actionLabel
            )}
          </Button>
        </div>
      </div>

      {/* Action feedback messages */}
      {actionError && (
        <p className="text-xs text-status-warning-foreground mt-1">
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p className="text-xs text-status-success-foreground mt-1">
          {actionSuccess}
        </p>
      )}
    </FormField>
  );
}
