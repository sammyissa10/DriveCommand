'use client';

import { useActionState, useState, useCallback } from 'react';
import { getDriverPayPeriodStats } from '@/app/(owner)/actions/payroll';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface PayrollFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    driverId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    basePay?: any;
    bonuses?: any;
    deductions?: any;
    milesLogged?: number;
    loadsCompleted?: number;
    status?: string;
    notes?: string | null;
  };
  drivers: Driver[];
  submitLabel: string;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

function toDateInputValue(date?: Date): string {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}

export function PayrollForm({ action, initialData, drivers, submitLabel }: PayrollFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [basePay, setBasePay] = useState(Number(initialData?.basePay) || 0);
  const [bonuses, setBonuses] = useState(Number(initialData?.bonuses) || 0);
  const [deductions, setDeductions] = useState(Number(initialData?.deductions) || 0);

  // Hourly calculator — client-side only, feeds into basePay
  const [hourlyRate, setHourlyRate] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');

  function applyHourlyCalc() {
    const rate = parseFloat(hourlyRate);
    const hours = parseFloat(hoursWorked);
    if (!isNaN(rate) && !isNaN(hours) && rate >= 0 && hours >= 0) {
      setBasePay(parseFloat((rate * hours).toFixed(2)));
    }
  }

  // Auto-populate performance stats
  const [driverId, setDriverId] = useState(initialData?.driverId || '');
  const [periodStart, setPeriodStart] = useState(toDateInputValue(initialData?.periodStart));
  const [periodEnd, setPeriodEnd] = useState(toDateInputValue(initialData?.periodEnd));
  const [milesLogged, setMilesLogged] = useState(initialData?.milesLogged ?? 0);
  const [loadsCompleted, setLoadsCompleted] = useState(initialData?.loadsCompleted ?? 0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsSource, setStatsSource] = useState<'auto' | 'manual'>('manual');

  const fetchStats = useCallback(async (driver: string, start: string, end: string) => {
    if (!driver || !start || !end) return;
    setStatsLoading(true);
    try {
      const result = await getDriverPayPeriodStats(driver, start, end);
      if (!('error' in result)) {
        setLoadsCompleted(result.loadsCompleted);
        setMilesLogged(result.milesLogged);
        setStatsSource('auto');
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  function handleDriverChange(value: string) {
    setDriverId(value);
    fetchStats(value, periodStart, periodEnd);
  }

  function handlePeriodStartChange(value: string) {
    setPeriodStart(value);
    fetchStats(driverId, value, periodEnd);
  }

  function handlePeriodEndChange(value: string) {
    setPeriodEnd(value);
    fetchStats(driverId, periodStart, value);
  }

  const totalPay = basePay + bonuses - deductions;

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Driver */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Driver
        </h3>

        <div>
          <label htmlFor="driverId" className={labelClass}>
            Driver
          </label>
          <select
            id="driverId"
            name="driverId"
            value={driverId}
            onChange={(e) => handleDriverChange(e.target.value)}
            disabled={isPending}
            className={inputClass}
            required
          >
            <option value="">Select driver...</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.firstName} {d.lastName}
              </option>
            ))}
          </select>
          {state?.error?.driverId && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.driverId}</p>
          )}
        </div>
      </div>

      {/* Pay Period */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pay Period
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="periodStart" className={labelClass}>
              Period Start
            </label>
            <input
              type="date"
              id="periodStart"
              name="periodStart"
              value={periodStart}
              onChange={(e) => handlePeriodStartChange(e.target.value)}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.periodStart && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.periodStart}</p>
            )}
          </div>
          <div>
            <label htmlFor="periodEnd" className={labelClass}>
              Period End
            </label>
            <input
              type="date"
              id="periodEnd"
              name="periodEnd"
              value={periodEnd}
              onChange={(e) => handlePeriodEndChange(e.target.value)}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.periodEnd && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.periodEnd}</p>
            )}
          </div>
        </div>
      </div>

      {/* Compensation */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Compensation
        </h3>

        {/* Hourly calculator */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hourly Calculator <span className="font-normal normal-case">(optional — auto-fills Base Pay)</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
            <div>
              <label className={labelClass}>Hourly Rate ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={isPending}
                placeholder="e.g. 25.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Hours Worked</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                disabled={isPending}
                placeholder="e.g. 40"
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={applyHourlyCalc}
              disabled={isPending || !hourlyRate || !hoursWorked}
              className="rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Calculate
            </button>
          </div>
          {hourlyRate && hoursWorked && !isNaN(parseFloat(hourlyRate)) && !isNaN(parseFloat(hoursWorked)) && (
            <p className="text-xs text-muted-foreground">
              {parseFloat(hoursWorked)} hrs × ${parseFloat(hourlyRate).toFixed(2)}/hr ={' '}
              <span className="font-semibold text-foreground">
                ${(parseFloat(hourlyRate) * parseFloat(hoursWorked)).toFixed(2)}
              </span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="basePay" className={labelClass}>
              Base Pay ($)
            </label>
            <input
              type="number"
              id="basePay"
              name="basePay"
              step="0.01"
              min="0"
              value={basePay || ''}
              onChange={(e) => setBasePay(parseFloat(e.target.value) || 0)}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.basePay && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.basePay}</p>
            )}
          </div>
          <div>
            <label htmlFor="bonuses" className={labelClass}>
              Bonuses ($)
            </label>
            <input
              type="number"
              id="bonuses"
              name="bonuses"
              step="0.01"
              min="0"
              defaultValue={Number(initialData?.bonuses) || 0}
              onChange={(e) => setBonuses(parseFloat(e.target.value) || 0)}
              disabled={isPending}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="deductions" className={labelClass}>
              Deductions ($)
            </label>
            <input
              type="number"
              id="deductions"
              name="deductions"
              step="0.01"
              min="0"
              defaultValue={Number(initialData?.deductions) || 0}
              onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>

        {/* Calculated total */}
        <div className="flex justify-end">
          <div className="space-y-1 text-right text-sm">
            <div className="flex items-center justify-between gap-8">
              <span className="text-muted-foreground">Base Pay</span>
              <span>
                ${basePay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-muted-foreground">+ Bonuses</span>
              <span className="text-green-600">
                +${bonuses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-muted-foreground">- Deductions</span>
              <span className="text-red-600">
                -${deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 font-bold text-base border-t border-border pt-1">
              <span>Total Pay</span>
              <span>
                ${totalPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance */}
      <div className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Performance
          </h3>
          {statsLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">Loading stats...</span>
          )}
          {!statsLoading && statsSource === 'auto' && (
            <span className="text-xs text-green-600 font-medium">Auto-populated from completed loads</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="milesLogged" className={labelClass}>
              Miles Logged
            </label>
            <input
              type="number"
              id="milesLogged"
              name="milesLogged"
              min="0"
              step="1"
              value={milesLogged}
              onChange={(e) => { setMilesLogged(parseInt(e.target.value) || 0); setStatsSource('manual'); }}
              disabled={isPending}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="loadsCompleted" className={labelClass}>
              Loads Completed
            </label>
            <input
              type="number"
              id="loadsCompleted"
              name="loadsCompleted"
              min="0"
              step="1"
              value={loadsCompleted}
              onChange={(e) => { setLoadsCompleted(parseInt(e.target.value) || 0); setStatsSource('manual'); }}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>
        {!statsLoading && statsSource === 'auto' && (
          <p className="text-xs text-muted-foreground">
            Counts loads with Delivered or Invoiced status where pickup date falls within the pay period. You can edit these values manually if needed.
          </p>
        )}
        {!statsLoading && statsSource === 'manual' && driverId && periodStart && periodEnd && (
          <p className="text-xs text-muted-foreground">
            Values entered manually. Select a driver and pay period to auto-populate from completed loads.
          </p>
        )}
      </div>

      {/* Status */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </h3>
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initialData?.status || 'DRAFT'}
            disabled={isPending}
            className={inputClass}
          >
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={initialData?.notes || ''}
            disabled={isPending}
            className={inputClass}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
