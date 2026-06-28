'use client';

import * as React from 'react';
import { useState, useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@drivecommand/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  FormField,
  FormSection,
  FormRow,
  CompletenessIndicator,
  getFieldErrors,
} from '@/components/design-system';
import { cn } from '@/lib/utils';

/**
 * ClientCreateForm — Sectioned form for creating a new client.
 *
 * Sections:
 * 1. Company Information — Name (required), DBA, MC#, DOT#
 * 2. Contact Information — Primary contact, email, phone, website
 * 3. Billing Address — Full address
 * 4. Account Settings — Payment terms, credit limit, notes
 */

interface ClientCreateFormProps {
  action: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

// Payment terms presets
const PAYMENT_TERM_PRESETS = [15, 30, 45, 60];

export function ClientCreateForm({ action }: ClientCreateFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Form values
  const [name, setName] = useState('');
  const [dbaName, setDbaName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateProv, setStateProv] = useState('');
  const [zip, setZip] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [creditLimit, setCreditLimit] = useState('');
  const [notes, setNotes] = useState('');

  // Completeness indicator state
  const [showCompleteness, setShowCompleteness] = useState(true);

  // Parse errors from action state
  const fieldErrors = getFieldErrors(
    typeof state?.error === 'object' ? state.error : undefined
  );

  // Calculate completeness
  const allFields = [
    name,
    dbaName,
    mcNumber,
    dotNumber,
    primaryContact,
    email,
    phone,
    website,
    addressLine1,
    city,
    stateProv,
    zip,
    creditLimit,
    notes,
  ];
  const filledFields = allFields.filter(
    (f) => f !== null && f !== undefined && f !== ''
  ).length;

  // Format credit limit with commas
  const handleCreditLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setCreditLimit(raw);
  };

  const formatCreditLimitDisplay = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-status-danger-bg border border-status-danger-foreground/20 p-4">
          <p className="text-sm text-status-danger-foreground">{state.error}</p>
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

      {/* Section 1: Company Information */}
      <FormSection
        title="Company Information"
        description="Basic company details. Only the company name is required."
      >
        <FormField
          label="Company Name"
          name="name"
          required
          error={fieldErrors?.name}
        >
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            placeholder="e.g. ABC Logistics Inc."
          />
        </FormField>

        <FormField
          label="DBA Name"
          name="dbaName"
          helperText="If different from company name"
        >
          <Input
            name="dbaName"
            value={dbaName}
            onChange={(e) => setDbaName(e.target.value)}
            disabled={isPending}
            placeholder="Doing Business As"
          />
        </FormField>

        <FormRow>
          <FormField
            label="MC Number"
            name="mcNumber"
            helperText="Motor Carrier number"
          >
            <Input
              name="mcNumber"
              value={mcNumber}
              onChange={(e) => setMcNumber(e.target.value)}
              disabled={isPending}
              placeholder="MC-123456"
            />
          </FormField>
          <FormField
            label="DOT Number"
            name="dotNumber"
            helperText="DOT registration number"
          >
            <Input
              name="dotNumber"
              value={dotNumber}
              onChange={(e) => setDotNumber(e.target.value)}
              disabled={isPending}
              placeholder="1234567"
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* Section 2: Contact Information */}
      <FormSection
        title="Contact Information"
        description="Primary contact for this account."
        divider
      >
        <FormField label="Contact Name" name="primaryContact">
          <Input
            name="primaryContact"
            value={primaryContact}
            onChange={(e) => setPrimaryContact(e.target.value)}
            disabled={isPending}
            placeholder="John Smith"
          />
        </FormField>

        <FormRow>
          <FormField label="Email" name="email" error={fieldErrors?.email}>
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              placeholder="contact@example.com"
            />
          </FormField>
          <FormField label="Phone" name="phone">
            <Input
              type="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
              placeholder="(555) 123-4567"
            />
          </FormField>
        </FormRow>

        <FormField
          label="Website"
          name="website"
          helperText="Include https://"
          error={fieldErrors?.website}
        >
          <Input
            type="url"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={isPending}
            placeholder="https://example.com"
          />
        </FormField>
      </FormSection>

      {/* Section 3: Billing Address */}
      <FormSection
        title="Billing Address"
        description="Where to send invoices."
        divider
      >
        <FormField label="Address Line 1" name="addressLine1">
          <Input
            name="addressLine1"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            disabled={isPending}
            placeholder="123 Main Street"
          />
        </FormField>

        <FormField label="Address Line 2" name="addressLine2">
          <Input
            name="addressLine2"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            disabled={isPending}
            placeholder="Suite 100"
          />
        </FormField>

        <FormRow>
          <FormField label="City" name="city">
            <Input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={isPending}
              placeholder="Chicago"
            />
          </FormField>
          <FormField label="State" name="state">
            <Input
              name="state"
              value={stateProv}
              onChange={(e) => setStateProv(e.target.value)}
              disabled={isPending}
              placeholder="IL"
              maxLength={2}
              className="uppercase"
            />
          </FormField>
          <FormField label="ZIP" name="zip">
            <Input
              name="zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              disabled={isPending}
              placeholder="60601"
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* Section 4: Account Settings */}
      <FormSection
        title="Account Settings"
        description="Payment and credit terms."
        divider
      >
        <FormField
          label="Payment Terms"
          name="paymentTerms-field"
          helperText="Days until payment due"
        >
          <div className="space-y-2">
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-2">
              {PAYMENT_TERM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPaymentTerms(preset.toString())}
                  disabled={isPending}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    'border border-border hover:bg-muted',
                    paymentTerms === preset.toString() &&
                      'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                  )}
                >
                  Net {preset}
                </button>
              ))}
            </div>
            <Input
              type="number"
              name="paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              disabled={isPending}
              min={0}
              max={365}
              className="w-32"
            />
          </div>
        </FormField>

        <FormField
          label="Credit Limit"
          name="creditLimit-field"
          helperText="Leave blank for no limit"
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              type="text"
              inputMode="decimal"
              value={formatCreditLimitDisplay(creditLimit)}
              onChange={handleCreditLimitChange}
              disabled={isPending}
              placeholder="0.00"
              className="pl-7"
            />
            <input type="hidden" name="creditLimit" value={creditLimit} />
          </div>
        </FormField>

        <FormField
          label="Notes"
          name="notes"
          helperText="Internal notes, not visible to customer"
        >
          <Textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            placeholder="Additional information about this client..."
            rows={3}
          />
        </FormField>
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
              Creating Client...
            </>
          ) : (
            'Create Client'
          )}
        </Button>
      </div>
    </form>
  );
}
