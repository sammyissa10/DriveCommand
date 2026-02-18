'use client';

import { useActionState, useState } from 'react';

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
            defaultValue={initialData?.driverId || ''}
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
              defaultValue={toDateInputValue(initialData?.periodStart)}
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
              defaultValue={toDateInputValue(initialData?.periodEnd)}
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
              defaultValue={Number(initialData?.basePay) || ''}
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
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Performance
        </h3>

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
              defaultValue={initialData?.milesLogged ?? 0}
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
              defaultValue={initialData?.loadsCompleted ?? 0}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>
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
