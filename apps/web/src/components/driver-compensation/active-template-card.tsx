import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { SerializedTemplate } from '@/app/(owner)/actions/driver-compensation-templates';

const PAY_TYPE_LABELS: Record<string, string> = {
  CPM: 'Cost Per Mile',
  HOURLY: 'Hourly',
  FLAT_PER_LOAD: 'Flat Per Load',
  PERCENTAGE: 'Percentage of Gross',
  DAILY: 'Daily',
  SALARY: 'Annual Salary',
};

const RATE_UNIT_LABELS: Record<string, string> = {
  PER_MILE: '/ mile',
  PER_HOUR: '/ hour',
  PER_LOAD: '/ load',
  PERCENTAGE: '% of gross',
  PER_DAY: '/ day',
  ANNUAL: '/ year',
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  W2_EMPLOYEE: 'W-2 Employee',
  OWNER_OPERATOR_1099: 'Owner-Operator (1099)',
  LEASE_OPERATOR: 'Lease Operator',
};

interface ActiveTemplateCardProps {
  template: SerializedTemplate | null;
  driverId: string;
}

function formatRate(payType: string, baseRate: string, currency: string): string {
  if (payType === 'PERCENTAGE') {
    return `${(Number(baseRate) * 100).toFixed(1)}%`;
  }
  const n = Number(baseRate);
  if (isNaN(n)) return baseRate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: payType === 'CPM' ? 3 : 2,
    maximumFractionDigits: payType === 'CPM' ? 4 : 2,
  }).format(n);
}

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

function isEndingSoon(effectiveTo: string | null): boolean {
  if (!effectiveTo) return false;
  const diff = new Date(effectiveTo).getTime() - Date.now();
  return diff > 0 && diff <= 7 * 86400000;
}

export function ActiveTemplateCard({ template, driverId }: ActiveTemplateCardProps) {
  if (!template) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <span className="text-xl">💵</span>
        </div>
        <div>
          <p className="font-semibold text-card-foreground">No compensation template set</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            This driver has no active compensation template.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/drivers/${driverId}/compensation/wizard`}>Create template</Link>
        </Button>
      </div>
    );
  }

  const rateDisplay =
    template.payType === 'PERCENTAGE'
      ? `${(Number(template.baseRate) * 100).toFixed(1)}% ${RATE_UNIT_LABELS[template.rateUnit] ?? ''}`
      : `${formatRate(template.payType, template.baseRate, template.currency)} ${RATE_UNIT_LABELS[template.rateUnit] ?? ''}`;

  const ending = isEndingSoon(template.effectiveTo);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-card-foreground">
            {PAY_TYPE_LABELS[template.payType] ?? template.payType}
          </h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {EMPLOYMENT_TYPE_LABELS[template.employmentType] ?? template.employmentType}
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/drivers/${driverId}/compensation/wizard`}>
            End and replace
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      {/* Rate display */}
      <div>
        <p className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
          {rateDisplay.trim()}
        </p>
        {template.loadedMilesOnly && template.payType === 'CPM' && (
          <p className="text-xs text-muted-foreground mt-1">Loaded miles only</p>
        )}
      </div>

      {/* Add-on chips */}
      {(template.overtimeEligible ||
        template.perDiemEnabled ||
        template.fuelSurchargeRate) && (
        <div className="flex flex-wrap gap-2">
          {template.overtimeEligible && (
            <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
              OT after {template.overtimeThresholdHours}h @ {template.overtimeMultiplier}x
            </span>
          )}
          {template.perDiemEnabled && template.perDiemRate && (
            <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
              Per diem ${template.perDiemRate}/day
            </span>
          )}
          {template.fuelSurchargeRate && (
            <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
              FSC ${template.fuelSurchargeRate}/mi
            </span>
          )}
        </div>
      )}

      {/* Effective dates */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400">
          Effective since {formatDate(template.effectiveFrom)}
        </span>
        {ending && template.effectiveTo && (
          <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            Ending soon — {formatDate(template.effectiveTo)}
          </span>
        )}
        {template.effectiveTo && !ending && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Ends {formatDate(template.effectiveTo)}
          </span>
        )}
      </div>

      {/* Notes */}
      {template.notes && (
        <p className="text-sm text-muted-foreground italic border-t border-border pt-3">
          {template.notes}
        </p>
      )}
    </div>
  );
}
