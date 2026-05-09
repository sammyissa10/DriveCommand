'use client';

import Decimal from 'decimal.js';
import { Card } from '@/components/ui/card';
import type { WizardFormState } from '@/app/(owner)/drivers/[id]/compensation/wizard/page';

const SAMPLE_MILES = 412;
const SAMPLE_HOURS = 8;
const SAMPLE_LOAD_REVENUE = 1500;
const SAMPLE_DAYS = 1;

interface LivePreviewPanelProps {
  state: WizardFormState;
}

function computeBaseEarnings(state: WizardFormState): Decimal {
  const rate = new Decimal(state.baseRate || '0');
  if (rate.lte(0)) return new Decimal(0);

  switch (state.payType) {
    case 'CPM':
      return rate.mul(SAMPLE_MILES);
    case 'HOURLY':
      return rate.mul(SAMPLE_HOURS);
    case 'FLAT_PER_LOAD':
      return rate;
    case 'PERCENTAGE':
      return rate.mul(SAMPLE_LOAD_REVENUE);
    case 'DAILY':
      return rate.mul(SAMPLE_DAYS);
    case 'SALARY':
      // Per-day estimate from annual salary
      return rate.div(52).div(5);
    default:
      return new Decimal(0);
  }
}

function formatCurrency(amount: Decimal, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount.toNumber());
}

export function LivePreviewPanel({ state }: LivePreviewPanelProps) {
  const baseEarnings = computeBaseEarnings(state);

  // Per diem addition: rate * 1 day sample
  const perDiemAmount =
    state.perDiemEnabled && state.perDiemRate && !isNaN(Number(state.perDiemRate))
      ? new Decimal(state.perDiemRate)
      : new Decimal(0);

  // FSC addition: rate * 412 miles sample
  const fscAmount =
    state.fuelSurchargeEnabled &&
    state.fuelSurchargeRate &&
    !isNaN(Number(state.fuelSurchargeRate))
      ? new Decimal(state.fuelSurchargeRate).mul(SAMPLE_MILES)
      : new Decimal(0);

  const totalEarnings = baseEarnings.add(perDiemAmount).add(fscAmount);
  const hasValidRate = baseEarnings.gt(0);

  const currency = state.currency || 'USD';

  function payModelLabel(payType: WizardFormState['payType']): string {
    const labels: Record<WizardFormState['payType'], string> = {
      CPM: `$${state.baseRate || '0'}/mile × ${SAMPLE_MILES} miles`,
      HOURLY: `$${state.baseRate || '0'}/hr × ${SAMPLE_HOURS} hrs`,
      FLAT_PER_LOAD: `Flat rate per load`,
      PERCENTAGE: `${Number(state.baseRate || 0) * 100}% of $${SAMPLE_LOAD_REVENUE.toLocaleString()} gross`,
      DAILY: `$${state.baseRate || '0'}/day × ${SAMPLE_DAYS} day`,
      SALARY: `$${state.baseRate || '0'}/yr ÷ 260 days`,
    };
    return labels[payType] ?? '';
  }

  return (
    <Card className="sticky top-6 p-5 space-y-4 border-border shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Live Preview
        </p>
        <p className="text-sm text-muted-foreground">
          On a typical {SAMPLE_MILES}-mile load, this driver earns:
        </p>
      </div>

      {hasValidRate ? (
        <>
          <div>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {formatCurrency(totalEarnings, currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">estimated gross per load</p>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            {/* Base pay breakdown */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{payModelLabel(state.payType)}</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(baseEarnings, currency)}
              </span>
            </div>

            {/* Per diem line */}
            {state.perDiemEnabled && perDiemAmount.gt(0) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Per diem ({formatCurrency(perDiemAmount, currency)}/day × 1 day)
                </span>
                <span className="font-medium text-green-700 dark:text-green-400 tabular-nums">
                  +{formatCurrency(perDiemAmount, currency)}
                </span>
              </div>
            )}

            {/* FSC line */}
            {state.fuelSurchargeEnabled && fscAmount.gt(0) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  FSC (${ state.fuelSurchargeRate}/mi × {SAMPLE_MILES} mi)
                </span>
                <span className="font-medium text-green-700 dark:text-green-400 tabular-nums">
                  +{formatCurrency(fscAmount, currency)}
                </span>
              </div>
            )}

            {/* Total */}
            {(perDiemAmount.gt(0) || fscAmount.gt(0)) && (
              <div className="flex justify-between text-sm font-semibold border-t border-border pt-2 mt-1">
                <span>Total estimated</span>
                <span className="tabular-nums">{formatCurrency(totalEarnings, currency)}</span>
              </div>
            )}
          </div>

          {/* Add-on chips */}
          <div className="flex flex-wrap gap-1.5">
            {state.overtimeEligible && (
              <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                OT after {state.overtimeThresholdHours || '?'}h @ {state.overtimeMultiplier || '?'}x
              </span>
            )}
            {state.perDiemEnabled && perDiemAmount.gt(0) && (
              <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                Per diem {formatCurrency(perDiemAmount, currency)}/day
              </span>
            )}
            {state.fuelSurchargeEnabled && fscAmount.gt(0) && (
              <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                FSC ${state.fuelSurchargeRate}/mi
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="py-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">—</p>
          <p className="text-xs text-muted-foreground mt-1">Enter a base rate to see preview</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Sample assumes {SAMPLE_MILES} miles, {SAMPLE_HOURS}h drive time, $
        {SAMPLE_LOAD_REVENUE.toLocaleString()} gross revenue. Actual earnings will vary.
      </p>
    </Card>
  );
}
