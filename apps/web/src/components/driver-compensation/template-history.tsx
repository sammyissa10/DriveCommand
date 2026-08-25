import type { SerializedTemplate } from '@/app/(owner)/actions/driver-compensation-templates';
import { formatDateOnlyShort } from '@/lib/utils/date';

const PAY_TYPE_LABELS: Record<string, string> = {
  CPM: 'Cost Per Mile',
  HOURLY: 'Hourly',
  FLAT_PER_LOAD: 'Flat Per Load',
  PERCENTAGE: 'Percentage',
  DAILY: 'Daily',
  SALARY: 'Salary',
};

const RATE_UNIT_LABELS: Record<string, string> = {
  PER_MILE: '/mi',
  PER_HOUR: '/hr',
  PER_LOAD: '/load',
  PERCENTAGE: '% gross',
  PER_DAY: '/day',
  ANNUAL: '/yr',
};

interface TemplateHistoryProps {
  templates: SerializedTemplate[];
}

// `effective_from` / `effective_to` are `@db.Date` — see lib/utils/date.ts.
const formatDate = formatDateOnlyShort;

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

export function TemplateHistory({ templates }: TemplateHistoryProps) {
  // Show all templates — including active (effectiveTo === null) shown as "present"
  // Templates already sorted desc by effectiveFrom from server action
  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-card-foreground">Template History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {templates.length} template{templates.length !== 1 ? 's' : ''} on record
        </p>
      </div>

      <div className="divide-y divide-border">
        {templates.map((t) => {
          const isActive = t.effectiveTo === null;
          const rateStr = `${formatRate(t.payType, t.baseRate, t.currency)} ${RATE_UNIT_LABELS[t.rateUnit] ?? ''}`.trim();
          const rangeStr = isActive
            ? `${formatDate(t.effectiveFrom)} — present`
            : `${formatDate(t.effectiveFrom)} — ${formatDate(t.effectiveTo!)}`;

          return (
            <div key={t.id} className="flex items-start justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-card-foreground">
                    {PAY_TYPE_LABELS[t.payType] ?? t.payType}
                  </span>
                  {isActive && (
                    <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{rangeStr}</p>
                {t.notes && (
                  <p className="text-xs text-muted-foreground italic mt-1 truncate max-w-xs">
                    {t.notes}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-card-foreground tabular-nums">{rateStr}</p>
              </div>
            </div>
          );
        })}
      </div>

      {templates.length === 0 && (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No prior templates.</p>
        </div>
      )}
    </div>
  );
}
