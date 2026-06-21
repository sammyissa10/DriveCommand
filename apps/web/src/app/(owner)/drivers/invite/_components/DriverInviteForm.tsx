'use client';

import * as React from 'react';
import { useState, useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@drivecommand/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FormField,
  FormSection,
  FormRow,
  CompletenessIndicator,
  getFieldErrors,
} from '@/components/design-system';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import { cn } from '@/lib/utils';

/**
 * DriverInviteForm — Sectioned form for inviting a new driver.
 *
 * Sections:
 * 1. Basic Information — Email, First Name, Last Name, Middle Name, Full Name Preview
 * 2. Contact & Personal — Phone, Date of Birth, Address
 * 3. License & Compliance — License Number, License Expiration Date
 */

interface DriverInviteFormProps {
  action: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

export function DriverInviteForm({ action }: DriverInviteFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Form values
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('');

  // Completeness indicator state
  const [showCompleteness, setShowCompleteness] = useState(true);

  // Parse errors from action state
  const fieldErrors = getFieldErrors(
    typeof state?.error === 'object' ? state.error : undefined
  );

  // Calculate completeness (required + optional fields)
  const allFields = [
    email,
    firstName,
    lastName,
    middleName,
    phoneNumber,
    dateOfBirth,
    address,
    licenseNumber,
    licenseExpirationDate,
  ];
  const filledFields = allFields.filter(
    (f) => f !== null && f !== undefined && f !== ''
  ).length;

  // Compute full name preview
  const fullNamePreview =
    [firstName, middleName, lastName].filter(Boolean).join(' ') ||
    'Full name will appear here';

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-status-danger-bg border border-status-danger-foreground/20 p-4">
          <p className="text-sm text-status-danger-foreground">{state.error}</p>
        </div>
      )}

      {/* Success message */}
      {state?.success && state.message && (
        <div className="rounded-lg bg-status-success-bg border border-status-success-foreground/20 p-4">
          <p className="text-sm text-status-success-foreground">{state.message}</p>
        </div>
      )}

      {/* Warning message */}
      {state?.warning && (
        <div className="rounded-lg bg-status-warning-bg border border-status-warning-foreground/20 p-4">
          <p className="text-sm text-status-warning-foreground">{state.warning}</p>
        </div>
      )}

      {/* Completeness Indicator */}
      {showCompleteness && (
        <CompletenessIndicator
          completed={filledFields}
          total={allFields.length}
          onDismiss={() => setShowCompleteness(false)}
        />
      )}

      {/* Section 1: Basic Information */}
      <FormSection
        title="Basic Information"
        description="Required information for the driver invitation."
      >
        <FormField
          label="Email"
          name="email"
          required
          error={fieldErrors?.email}
          helperText="Invitation will be sent to this address"
        >
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            placeholder="driver@example.com"
          />
        </FormField>

        <FormRow>
          <FormField
            label="First Name"
            name="firstName"
            required
            error={fieldErrors?.firstName}
          >
            <Input
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isPending}
              placeholder="John"
            />
          </FormField>
          <FormField
            label="Last Name"
            name="lastName"
            required
            error={fieldErrors?.lastName}
          >
            <Input
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isPending}
              placeholder="Smith"
            />
          </FormField>
        </FormRow>

        <FormField
          label="Middle Name"
          name="middleName"
          helperText="Optional"
        >
          <Input
            name="middleName"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            disabled={isPending}
          />
        </FormField>

        {/* Full Name Preview */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Full Name Preview
          </p>
          <p className={cn(
            'text-sm',
            fullNamePreview === 'Full name will appear here'
              ? 'text-muted-foreground italic'
              : 'text-foreground font-medium'
          )}>
            {fullNamePreview}
          </p>
        </div>
      </FormSection>

      {/* Section 2: Contact & Personal */}
      <FormSection
        title="Contact & Personal"
        description="Contact information and personal details."
        divider
      >
        <FormRow>
          <FormField
            label="Phone Number"
            name="phoneNumber"
            helperText="Optional"
          >
            <Input
              type="tel"
              name="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isPending}
              placeholder="(555) 123-4567"
            />
          </FormField>
          <FormField
            label="Date of Birth"
            name="dateOfBirth"
            helperText="Optional"
          >
            <Input
              type="date"
              name="dateOfBirth"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>

        <FormField
          label="Address"
          name="address"
          helperText="Optional — start typing for suggestions"
        >
          <AddressAutocomplete
            id="address"
            name="address"
            defaultValue={address}
            disabled={isPending}
            placeholder="123 Main St, City, State"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            onPlaceSelect={(place) => setAddress(place.displayName)}
          />
        </FormField>
      </FormSection>

      {/* Section 3: License & Compliance */}
      <FormSection
        title="License & Compliance"
        description="Driver license information for compliance tracking."
        divider
      >
        <FormRow>
          <FormField
            label="License Number"
            name="licenseNumber"
            error={fieldErrors?.licenseNumber}
            helperText="Optional — CDL number"
          >
            <Input
              name="licenseNumber"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
              disabled={isPending}
              className="uppercase font-mono"
              placeholder="AB1234567"
            />
          </FormField>
          <FormField
            label="License Expiration"
            name="licenseExpirationDate"
            helperText="Optional — for compliance alerts"
          >
            <Input
              type="date"
              name="licenseExpirationDate"
              value={licenseExpirationDate}
              onChange={(e) => setLicenseExpirationDate(e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
          size="lg"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending Invitation...
            </>
          ) : (
            'Send Invitation'
          )}
        </Button>
      </div>
    </form>
  );
}
