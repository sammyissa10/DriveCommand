'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pencil, Loader2 } from 'lucide-react';
import type { WizardFormState } from '@/app/(owner)/carrier/fleet/drivers/[id]/compensation/wizard/page';

const PAY_TYPE_LABELS: Record<WizardFormState['payType'], string> = {
  CPM: 'Cost Per Mile (CPM)',
  HOURLY: 'Hourly',
  FLAT_PER_LOAD: 'Flat Per Load',
  PERCENTAGE: 'Percentage of Gross',
  DAILY: 'Daily',
  SALARY: 'Annual Salary',
};

const RATE_UNIT_LABELS: Record<WizardFormState['rateUnit'], string> = {
  PER_MILE: 'per mile',
  PER_HOUR: 'per hour',
  PER_LOAD: 'per load',
  PERCENTAGE: '% of gross',
  PER_DAY: 'per day',
  ANNUAL: 'annually',
};

const EMPLOYMENT_TYPE_LABELS: Record<WizardFormState['employmentType'], string> = {
  W2_EMPLOYEE: 'W-2 Employee',
  OWNER_OPERATOR_1099: 'Owner-Operator (1099)',
  LEASE_OPERATOR: 'Lease Operator',
};

interface ConfirmationCardProps {
  state: WizardFormState;
  goToStep: (step: 1 | 2 | 3) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

function formatRate(payType: WizardFormState['payType'], baseRate: string): string {
  if (payType === 'PERCENTAGE') {
    return `${(Number(baseRate) * 100).toFixed(1)}%`;
  }
  const n = Number(baseRate);
  if (isNaN(n)) return baseRate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: payType === 'CPM' ? 3 : 2,
    maximumFractionDigits: payType === 'CPM' ? 4 : 2,
  }).format(n);
}

interface SectionRowProps {
  label: string;
  value: React.ReactNode;
}

function SectionRow({ label, value }: SectionRowProps) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-card-foreground text-right">{value}</dd>
    </div>
  );
}

export function ConfirmationCard({ state, goToStep, onSave, saving }: ConfirmationCardProps) {
  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground mb-1">Review &amp; Save</h2>
        <p className="text-sm text-muted-foreground">
          Confirm the details below. Saving will replace the current active template.
        </p>
      </div>

      {/* Pay model section */}
      <Card className="p-5 border-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-card-foreground uppercase tracking-wide">
            Pay Model
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(1)}
            className="h-7 px-2 text-xs"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
        <dl>
          <SectionRow label="Pay type" value={PAY_TYPE_LABELS[state.payType]} />
        </dl>
      </Card>

      {/* Rate & details section */}
      <Card className="p-5 border-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-card-foreground uppercase tracking-wide">
            Rate &amp; Details
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(2)}
            className="h-7 px-2 text-xs"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
        <dl>
          <SectionRow
            label="Base rate"
            value={`${formatRate(state.payType, state.baseRate)} ${RATE_UNIT_LABELS[state.rateUnit]}`}
          />
          <SectionRow label="Employment type" value={EMPLOYMENT_TYPE_LABELS[state.employmentType]} />
          <SectionRow label="Currency" value={state.currency} />
          <SectionRow label="Effective from" value={formatDate(state.effectiveFrom)} />
          {state.payType === 'CPM' && (
            <SectionRow
              label="Loaded miles only"
              value={state.loadedMilesOnly ? 'Yes' : 'No'}
            />
          )}
        </dl>
      </Card>

      {/* Add-ons section */}
      <Card className="p-5 border-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-card-foreground uppercase tracking-wide">
            Add-ons
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(3)}
            className="h-7 px-2 text-xs"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
        <dl>
          <SectionRow
            label="Overtime"
            value={
              state.overtimeEligible
                ? `After ${state.overtimeThresholdHours}h/week @ ${state.overtimeMultiplier}x`
                : 'Not enabled'
            }
          />
          {state.overtimeEligible && state.dailyOvertimeThreshold && (
            <SectionRow
              label="Daily OT threshold"
              value={`${state.dailyOvertimeThreshold}h`}
            />
          )}
          <SectionRow
            label="Per diem"
            value={
              state.perDiemEnabled
                ? `$${state.perDiemRate}/day`
                : 'Not enabled'
            }
          />
          <SectionRow
            label="Fuel surcharge"
            value={
              state.fuelSurchargeEnabled
                ? `$${state.fuelSurchargeRate}/mile`
                : 'Not enabled'
            }
          />
          {state.weeklyEarningGoal && (
            <SectionRow
              label="Weekly goal"
              value={`$${Number(state.weeklyEarningGoal).toLocaleString()}`}
            />
          )}
          {state.notes && (
            <SectionRow label="Notes" value={<span className="italic">{state.notes}</span>} />
          )}
        </dl>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" onClick={() => goToStep(3)}>
          Back
        </Button>
        <Button type="button" disabled={saving} onClick={onSave} className="min-w-[130px]">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Template'
          )}
        </Button>
      </div>
    </div>
  );
}
