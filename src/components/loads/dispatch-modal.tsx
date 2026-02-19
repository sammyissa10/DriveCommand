'use client';

import { useState, useEffect, useActionState } from 'react';
import { X, Truck } from 'lucide-react';

interface DispatchModalProps {
  loadId: string;
  dispatchAction: (prevState: any, formData: FormData) => Promise<any>;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  trucks: Array<{ id: string; make: string; model: string; licensePlate: string }>;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

export function DispatchModal({ loadId, dispatchAction, drivers, trucks }: DispatchModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [state, formAction, isPending] = useActionState(dispatchAction, null);

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <Truck className="h-4 w-4" />
        Dispatch Load
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">Dispatch Load</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {state?.error && typeof state.error === 'string' && (
              <div className="mb-4 rounded-lg bg-status-danger-bg border border-status-danger/30 p-3">
                <p className="text-sm text-status-danger-foreground">{state.error}</p>
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <div>
                <label htmlFor="driverId" className={labelClass}>
                  Driver
                </label>
                <select
                  id="driverId"
                  name="driverId"
                  disabled={isPending}
                  className={inputClass}
                  required
                >
                  <option value="">Select a driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {`${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()}
                    </option>
                  ))}
                </select>
                {state?.error?.driverId && (
                  <p className="mt-1.5 text-sm text-red-600">{state.error.driverId}</p>
                )}
              </div>

              <div>
                <label htmlFor="truckId" className={labelClass}>
                  Truck
                </label>
                <select
                  id="truckId"
                  name="truckId"
                  disabled={isPending}
                  className={inputClass}
                  required
                >
                  <option value="">Select a truck</option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.make} {t.model} — {t.licensePlate}
                    </option>
                  ))}
                </select>
                {state?.error?.truckId && (
                  <p className="mt-1.5 text-sm text-red-600">{state.error.truckId}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? 'Dispatching...' : 'Dispatch'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
