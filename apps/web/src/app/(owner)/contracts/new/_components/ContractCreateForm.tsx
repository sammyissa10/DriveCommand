'use client';

import * as React from 'react';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormField,
  FormSection,
  FormRow,
  ActionField,
  CompletenessIndicator,
} from '@/components/design-system';
import type { ActionState } from '@drivecommand/types';
import { generateContractNumber } from '@/app/(owner)/actions/contracts';

interface ContractCreateFormProps {
  createAction: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

interface ClientItem {
  id: string;
  name: string;
}

export function ContractCreateForm({ createAction }: ContractCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [clients, setClients] = useState<ClientItem[]>([]);

  const [formValues, setFormValues] = useState({
    contractNumber: '',
    contractName: '',
    clientId: '',
    contractType: 'spot',
    effectiveDate: '',
    expirationDate: '',
    rateType: 'per_mile',
    baseRate: '',
    autoRenew: false,
    notes: '',
  });

  const [actionState, setActionState] = useState<ActionState | null>(null);

  // Fetch clients on mount
  useEffect(() => {
    async function loadClients() {
      try {
        const res = await fetch('/api/v1/carrier/clients?pageSize=200');
        if (!res.ok) return;
        const data = await res.json();
        setClients((data.data?.items ?? []) as ClientItem[]);
      } catch {
        // Ignore - user can still create contract without picker
      }
    }
    loadClients();
  }, []);

  // Handle field changes
  const handleChange = (field: keyof typeof formValues, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  // Generate contract number
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const number = await generateContractNumber();
      handleChange('contractNumber', number);
    } catch (error) {
      console.error('Failed to generate contract number:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createAction(null, formData);
      setActionState(result);

      if (!result.error) {
        // Success - redirect handled by action
        router.refresh();
      }
    });
  };

  // Field errors from action state
  const fieldErrors =
    typeof actionState?.error === 'object' ? actionState.error : undefined;

  // Compute completeness (required fields: contractNumber, clientId)
  const requiredFieldsFilled = [
    formValues.contractNumber,
    formValues.clientId,
  ].every((v) => v);

  const optionalFieldsFilled = [
    formValues.contractName,
    formValues.effectiveDate,
    formValues.expirationDate,
    formValues.baseRate,
  ].filter((v) => v).length;

  const completeness = {
    filled: (requiredFieldsFilled ? 2 : 0) + optionalFieldsFilled,
    total: 6,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* General error message */}
      {actionState?.error && typeof actionState.error === 'string' && (
        <div className="rounded-lg bg-status-danger-bg border border-status-danger-foreground/20 p-4">
          <p className="text-sm text-status-danger-foreground">
            {actionState.error}
          </p>
        </div>
      )}

      {/* Completeness Indicator */}
      <CompletenessIndicator
        completed={completeness.filled}
        total={completeness.total}
      />

      {/* Section 1: Contract Identity */}
      <FormSection
        title="Contract Identity"
        description="Basic contract identification"
      >
        <ActionField
          label="Contract Number"
          name="contractNumber"
          required
          error={fieldErrors?.contractNumber?.[0]}
          actionLabel="Generate"
          onAction={handleGenerate}
          actionDisabled={isGenerating}
        >
          <Input
            name="contractNumber"
            value={formValues.contractNumber}
            onChange={(e) => handleChange('contractNumber', e.target.value)}
            placeholder="CNT-20260621-XXXX"
            className="font-mono"
            disabled={isPending}
          />
        </ActionField>

        <FormField
          label="Contract Name"
          name="contractName"
          helperText="Optional friendly name for this contract"
          error={fieldErrors?.contractName?.[0]}
        >
          <Input
            name="contractName"
            value={formValues.contractName}
            onChange={(e) => handleChange('contractName', e.target.value)}
            placeholder="e.g., Q2 2026 Spot Agreement"
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Client"
          name="clientId"
          required
          error={fieldErrors?.clientId?.[0]}
        >
          <Select
            name="clientId"
            value={formValues.clientId}
            onValueChange={(v) => handleChange('clientId', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>

      {/* Section 2: Contract Terms */}
      <FormSection
        title="Contract Terms"
        description="Effective dates and contract type"
      >
        <FormField
          label="Contract Type"
          name="contractType"
          error={fieldErrors?.contractType?.[0]}
        >
          <Select
            name="contractType"
            value={formValues.contractType}
            onValueChange={(v) => handleChange('contractType', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot</SelectItem>
              <SelectItem value="dedicated">Dedicated</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormRow>
          <FormField
            label="Effective Date"
            name="effectiveDate"
            helperText="When contract becomes active"
            error={fieldErrors?.effectiveDate?.[0]}
          >
            <Input
              type="date"
              name="effectiveDate"
              value={formValues.effectiveDate}
              onChange={(e) => handleChange('effectiveDate', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormField
            label="Expiration Date"
            name="expirationDate"
            helperText="When contract expires"
            error={fieldErrors?.expirationDate?.[0]}
          >
            <Input
              type="date"
              name="expirationDate"
              value={formValues.expirationDate}
              onChange={(e) => handleChange('expirationDate', e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>

        <div className="flex items-center gap-3">
          <Switch
            id="autoRenew"
            name="autoRenew"
            checked={formValues.autoRenew}
            onCheckedChange={(checked) => handleChange('autoRenew', checked)}
            disabled={isPending}
          />
          <Label htmlFor="autoRenew" className="cursor-pointer">
            Auto-renew contract
          </Label>
        </div>
      </FormSection>

      {/* Section 3: Rate Information */}
      <FormSection
        title="Rate Information"
        description="Base rate and calculation method"
      >
        <FormField
          label="Rate Type"
          name="rateType"
          error={fieldErrors?.rateType?.[0]}
        >
          <Select
            name="rateType"
            value={formValues.rateType}
            onValueChange={(v) => handleChange('rateType', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_mile">Per Mile</SelectItem>
              <SelectItem value="flat">Flat Rate</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Base Rate"
          name="baseRate"
          helperText={
            formValues.rateType === 'per_mile'
              ? 'Rate per mile (e.g., 2.50)'
              : formValues.rateType === 'percentage'
                ? 'Percentage (e.g., 15 for 15%)'
                : formValues.rateType === 'hourly'
                  ? 'Hourly rate (e.g., 50.00)'
                  : 'Flat rate amount'
          }
          error={fieldErrors?.baseRate?.[0]}
        >
          <Input
            type="number"
            step="0.01"
            name="baseRate"
            value={formValues.baseRate}
            onChange={(e) => handleChange('baseRate', e.target.value)}
            placeholder="0.00"
            disabled={isPending}
          />
        </FormField>
      </FormSection>

      {/* Section 4: Notes */}
      <FormSection title="Notes" description="Internal notes (optional)">
        <FormField label="Notes" name="notes" error={fieldErrors?.notes?.[0]}>
          <Textarea
            name="notes"
            value={formValues.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Add any additional notes or terms..."
            rows={4}
            disabled={isPending}
          />
        </FormField>
      </FormSection>

      {/* Submit button */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/contracts')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !requiredFieldsFilled}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Creating Contract...
            </>
          ) : (
            'Create Contract'
          )}
        </Button>
      </div>
    </form>
  );
}
