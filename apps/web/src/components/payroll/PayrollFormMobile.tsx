'use client';

import type { ActionState } from '@drivecommand/types';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  PrimaryButton,
} from '@/components/ui/ds';
import { getDriverPayPeriodStats } from '@/app/(owner)/actions/payroll';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface PayrollFormMobileProps {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  title: string;
  backHref: string;
  submitLabel: string;
  drivers: Driver[];
  initialData?: {
    driverId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    basePay?: unknown;
    bonuses?: unknown;
    deductions?: unknown;
    milesLogged?: number;
    loadsCompleted?: number;
    status?: string;
    notes?: string | null;
  };
}

const dsInput =
  'h-11 w-full rounded-[10px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3';
const dsLabel = 'mb-1.5 block text-[13px] text-ds-txt2';

function toDateInputValue(date?: Date): string {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}
function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={dsLabel}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Payroll create/edit form — mobile-web design system view. Mirrors the desktop
 * PayrollForm's fields, the hourly calculator, and the auto-populate of
 * miles/loads from completed loads. Submits explicitly (preventDefault +
 * startTransition) rather than via <form action>, which doesn't fire reliably
 * in the mobile webview — same approach as InvoiceFormMobile.
 */
export function PayrollFormMobile({
  action,
  title,
  backHref,
  submitLabel,
  drivers,
  initialData,
}: PayrollFormMobileProps) {
  const router = useRouter();
  const [state, setState] = useState<ActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  const [driverId, setDriverId] = useState(initialData?.driverId || '');
  const [periodStart, setPeriodStart] = useState(toDateInputValue(initialData?.periodStart));
  const [periodEnd, setPeriodEnd] = useState(toDateInputValue(initialData?.periodEnd));

  const [basePay, setBasePay] = useState(Number(initialData?.basePay) || 0);
  const [bonuses, setBonuses] = useState(Number(initialData?.bonuses) || 0);
  const [deductions, setDeductions] = useState(Number(initialData?.deductions) || 0);

  // Hourly calculator — client-side only, feeds Base Pay.
  const [hourlyRate, setHourlyRate] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');

  const [milesLogged, setMilesLogged] = useState(initialData?.milesLogged ?? 0);
  const [loadsCompleted, setLoadsCompleted] = useState(initialData?.loadsCompleted ?? 0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsSource, setStatsSource] = useState<'auto' | 'manual'>('manual');

  const totalPay = basePay + bonuses - deductions;

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  const navLabel = isPending ? 'Saving…' : submitLabel.toLowerCase().includes('update') ? 'Save' : 'Create';

  // Surface server-side errors at the top (success redirects, so this is error-only).
  useEffect(() => {
    if (state?.error) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state]);

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

  function applyHourlyCalc() {
    const rate = parseFloat(hourlyRate);
    const hours = parseFloat(hoursWorked);
    if (!isNaN(rate) && !isNaN(hours) && rate >= 0 && hours >= 0) {
      setBasePay(parseFloat((rate * hours).toFixed(2)));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(null, formData);
      if (result) setState(result);
    });
  }

  return (
    <MobileScreen className="pb-10 pt-2">
      <form onSubmit={handleSubmit}>
        <NavHeader
          title={title}
          left={<NavTextButton label="Cancel" onClick={() => router.push(backHref)} />}
          right={
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] px-1 text-[17px] font-semibold text-ds-accent transition active:opacity-75 disabled:opacity-35"
            >
              {navLabel}
            </button>
          }
        />

        {state?.error && typeof state.error === 'string' ? (
          <div className="mb-4 rounded-[16px] bg-ds-danger/[0.14] p-4 text-[13px] text-ds-danger">{state.error}</div>
        ) : null}

        {/* Catch-all: surface any validation error not shown inline below, so a
            rejected submit is never silent (it would just scroll to the top). */}
        {fieldErrors &&
        Object.keys(fieldErrors).some((k) => !['driverId', 'periodStart', 'periodEnd', 'basePay'].includes(k)) ? (
          <div className="mb-4 space-y-1 rounded-[16px] bg-ds-danger/[0.14] p-4 text-[13px] text-ds-danger">
            {Object.entries(fieldErrors)
              .filter(([k]) => !['driverId', 'periodStart', 'periodEnd', 'basePay'].includes(k))
              .flatMap(([, msgs]) => (Array.isArray(msgs) ? msgs : [String(msgs)]))
              .map((m, i) => (
                <p key={i}>{m}</p>
              ))}
          </div>
        ) : null}

        <div className="space-y-6">
          {/* Driver */}
          <div>
            <SectionHeader title="Driver" />
            <Field label="Driver" htmlFor="driverId">
              <select
                id="driverId"
                name="driverId"
                value={driverId}
                onChange={(e) => {
                  setDriverId(e.target.value);
                  fetchStats(e.target.value, periodStart, periodEnd);
                }}
                disabled={isPending}
                className={dsInput}
                required
              >
                <option value="">Select driver…</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName} {d.lastName}
                  </option>
                ))}
              </select>
            </Field>
            {fieldErrors?.driverId ? <p className="mt-1.5 text-[13px] text-ds-danger">{fieldErrors.driverId}</p> : null}
          </div>

          {/* Pay period */}
          <div>
            <SectionHeader title="Pay period" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" htmlFor="periodStart">
                <input
                  id="periodStart"
                  name="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    fetchStats(driverId, e.target.value, periodEnd);
                  }}
                  disabled={isPending}
                  className={dsInput}
                  required
                />
              </Field>
              <Field label="End" htmlFor="periodEnd">
                <input
                  id="periodEnd"
                  name="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value);
                    fetchStats(driverId, periodStart, e.target.value);
                  }}
                  disabled={isPending}
                  className={dsInput}
                  required
                />
              </Field>
            </div>
            {fieldErrors?.periodStart ? <p className="mt-1.5 text-[13px] text-ds-danger">{fieldErrors.periodStart}</p> : null}
            {fieldErrors?.periodEnd ? <p className="mt-1.5 text-[13px] text-ds-danger">{fieldErrors.periodEnd}</p> : null}
          </div>

          {/* Compensation */}
          <div>
            <SectionHeader title="Compensation" />
            <div className="space-y-3">
              {/* Hourly calculator */}
              <div className="space-y-3 rounded-[16px] bg-ds-card p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-ds-txt3">
                  Hourly calculator <span className="font-normal normal-case tracking-normal">— fills Base Pay</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Rate ($/hr)">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      disabled={isPending}
                      placeholder="25.00"
                      className={dsInput}
                    />
                  </Field>
                  <Field label="Hours">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      value={hoursWorked}
                      onChange={(e) => setHoursWorked(e.target.value)}
                      disabled={isPending}
                      placeholder="40"
                      className={dsInput}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={applyHourlyCalc}
                  disabled={isPending || !hourlyRate || !hoursWorked}
                  className="h-11 w-full rounded-[10px] bg-ds-accent/[0.14] text-[15px] font-semibold text-ds-accent transition active:opacity-75 disabled:opacity-35"
                >
                  {hourlyRate && hoursWorked && !isNaN(parseFloat(hourlyRate)) && !isNaN(parseFloat(hoursWorked))
                    ? `Set Base Pay to $${money(parseFloat(hourlyRate) * parseFloat(hoursWorked))}`
                    : 'Calculate base pay'}
                </button>
              </div>

              <Field label="Base pay ($)" htmlFor="basePay">
                <input
                  id="basePay"
                  name="basePay"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={basePay || ''}
                  onChange={(e) => setBasePay(parseFloat(e.target.value) || 0)}
                  disabled={isPending}
                  className={dsInput}
                  required
                />
              </Field>
              {fieldErrors?.basePay ? <p className="text-[13px] text-ds-danger">{fieldErrors.basePay}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bonuses ($)" htmlFor="bonuses">
                  <input
                    id="bonuses"
                    name="bonuses"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={bonuses || ''}
                    onChange={(e) => setBonuses(parseFloat(e.target.value) || 0)}
                    disabled={isPending}
                    placeholder="0"
                    className={dsInput}
                  />
                </Field>
                <Field label="Deductions ($)" htmlFor="deductions">
                  <input
                    id="deductions"
                    name="deductions"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={deductions || ''}
                    onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
                    disabled={isPending}
                    placeholder="0"
                    className={dsInput}
                  />
                </Field>
              </div>

              {/* Total breakdown */}
              <div className="space-y-1.5 rounded-[20px] bg-ds-card p-4">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ds-txt2">Base pay</span>
                  <span className="text-ds-txt tabular-nums">${money(basePay)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-ds-txt2">Bonuses</span>
                  <span className="text-ds-success tabular-nums">+${money(bonuses)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-ds-txt2">Deductions</span>
                  <span className="text-ds-danger tabular-nums">-${money(deductions)}</span>
                </div>
                <div className="flex justify-between border-t border-ds-hairline pt-1.5 text-[16px] font-semibold">
                  <span className="text-ds-txt">Total pay</span>
                  <span className="text-ds-txt tabular-nums">${money(totalPay)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">Performance</span>
              {statsLoading ? (
                <span className="text-[12px] text-ds-txt3">Loading…</span>
              ) : statsSource === 'auto' ? (
                <span className="text-[12px] text-ds-success">Auto-filled</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Miles logged" htmlFor="milesLogged">
                <input
                  id="milesLogged"
                  name="milesLogged"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={milesLogged}
                  onChange={(e) => {
                    setMilesLogged(parseInt(e.target.value) || 0);
                    setStatsSource('manual');
                  }}
                  disabled={isPending}
                  className={dsInput}
                />
              </Field>
              <Field label="Loads completed" htmlFor="loadsCompleted">
                <input
                  id="loadsCompleted"
                  name="loadsCompleted"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={loadsCompleted}
                  onChange={(e) => {
                    setLoadsCompleted(parseInt(e.target.value) || 0);
                    setStatsSource('manual');
                  }}
                  disabled={isPending}
                  className={dsInput}
                />
              </Field>
            </div>
            <p className="mt-2 text-[12px] text-ds-txt3">
              {statsSource === 'auto'
                ? 'Auto-filled from delivered/invoiced loads in this period — edit if needed.'
                : 'Pick a driver and pay period to auto-fill from completed loads.'}
            </p>
          </div>

          {/* Status */}
          <div>
            <SectionHeader title="Status" />
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                defaultValue={initialData?.status || 'DRAFT'}
                disabled={isPending}
                className={dsInput}
              >
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
              </select>
            </Field>
          </div>

          {/* Notes */}
          <div>
            <SectionHeader title="Notes" />
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={initialData?.notes || ''}
              disabled={isPending}
              className="w-full resize-none rounded-[10px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
              placeholder="Anything worth noting"
            />
          </div>

          <PrimaryButton type="submit" label={isPending ? 'Saving…' : submitLabel} loading={isPending} />
        </div>
      </form>
    </MobileScreen>
  );
}
