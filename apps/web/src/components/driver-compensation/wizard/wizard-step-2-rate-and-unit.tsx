'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { WizardFormState } from '@/app/(owner)/drivers/[id]/compensation/wizard/page';

const RATE_UNIT_OPTIONS: Record<WizardFormState['payType'], { value: WizardFormState['rateUnit']; label: string }[]> = {
  CPM: [{ value: 'PER_MILE', label: 'Per mile' }],
  HOURLY: [{ value: 'PER_HOUR', label: 'Per hour' }],
  FLAT_PER_LOAD: [{ value: 'PER_LOAD', label: 'Per load' }],
  PERCENTAGE: [{ value: 'PERCENTAGE', label: '% of gross' }],
  DAILY: [{ value: 'PER_DAY', label: 'Per day' }],
  SALARY: [{ value: 'ANNUAL', label: 'Annual' }],
};

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'W2_EMPLOYEE', label: 'W-2 Employee' },
  { value: 'OWNER_OPERATOR_1099', label: 'Owner-Operator (1099)' },
  { value: 'LEASE_OPERATOR', label: 'Lease Operator' },
] as const;

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
];

interface WizardStep2Props {
  state: WizardFormState;
  setState: React.Dispatch<React.SetStateAction<WizardFormState>>;
  goNext: () => void;
  goBack: () => void;
}

export function WizardStep2RateAndUnit({ state, setState, goNext, goBack }: WizardStep2Props) {
  const isPercentage = state.payType === 'PERCENTAGE';
  const isCPM = state.payType === 'CPM';

  // Inline validation
  function validateBaseRate(value: string): string | null {
    const n = Number(value);
    if (!value || isNaN(n) || n <= 0) return 'Rate must be a number greater than 0';
    if (isPercentage && n > 1) return 'Percentage must be between 0 and 1 (e.g. 0.80 for 80%)';
    return null;
  }

  const rateError = state.baseRate !== '' ? validateBaseRate(state.baseRate) : null;
  const canContinue = !rateError && state.baseRate !== '' && state.effectiveFrom !== '';

  const ratePrefix = isPercentage ? '' : '$';
  const rateSuffix = isPercentage ? '(e.g. 0.80 for 80%)' : '';
  const ratePlaceholder = isPercentage ? '0.80' : '0.00';

  function handleRateChange(value: string) {
    setState((prev) => ({ ...prev, baseRate: value }));
  }

  const rateUnitOptions = RATE_UNIT_OPTIONS[state.payType] ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground mb-1">Rate & Details</h2>
        <p className="text-sm text-muted-foreground">
          Set the base pay rate and effective date for this template.
        </p>
      </div>

      {/* Base rate */}
      <div className="space-y-1.5">
        <Label htmlFor="baseRate">
          Base rate
          {rateSuffix && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">{rateSuffix}</span>
          )}
        </Label>
        <div className="relative">
          {ratePrefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              {ratePrefix}
            </span>
          )}
          <Input
            id="baseRate"
            type="number"
            min="0"
            step={isPercentage ? '0.01' : '0.01'}
            value={state.baseRate}
            onChange={(e) => handleRateChange(e.target.value)}
            placeholder={ratePlaceholder}
            className={ratePrefix ? 'pl-7' : ''}
          />
        </div>
        {rateError && <p className="text-xs text-red-600 dark:text-red-400">{rateError}</p>}
      </div>

      {/* Rate unit */}
      <div className="space-y-1.5">
        <Label htmlFor="rateUnit">Rate unit</Label>
        <Select
          value={state.rateUnit}
          onValueChange={(v) =>
            setState((prev) => ({ ...prev, rateUnit: v as WizardFormState['rateUnit'] }))
          }
        >
          <SelectTrigger id="rateUnit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rateUnitOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employment type */}
      <div className="space-y-1.5">
        <Label htmlFor="employmentType">Employment type</Label>
        <Select
          value={state.employmentType}
          onValueChange={(v) =>
            setState((prev) => ({
              ...prev,
              employmentType: v as WizardFormState['employmentType'],
            }))
          }
        >
          <SelectTrigger id="employmentType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Currency */}
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Select
          value={state.currency}
          onValueChange={(v) => setState((prev) => ({ ...prev, currency: v }))}
        >
          <SelectTrigger id="currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Effective from */}
      <div className="space-y-1.5">
        <Label htmlFor="effectiveFrom">Effective from</Label>
        <Input
          id="effectiveFrom"
          type="date"
          value={state.effectiveFrom}
          onChange={(e) => setState((prev) => ({ ...prev, effectiveFrom: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          The previous active template will be closed the day before this date.
        </p>
      </div>

      {/* Loaded miles only (CPM only) */}
      {isCPM && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 p-4">
          <div>
            <p className="text-sm font-medium text-card-foreground">Loaded miles only</p>
            <p className="text-xs text-muted-foreground">
              Pay is calculated only for miles driven with a loaded trailer
            </p>
          </div>
          <Switch
            checked={state.loadedMilesOnly}
            onCheckedChange={(checked) =>
              setState((prev) => ({ ...prev, loadedMilesOnly: checked }))
            }
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button type="button" disabled={!canContinue} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
