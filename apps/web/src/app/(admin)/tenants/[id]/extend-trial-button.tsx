'use client';

import { useState, useTransition } from 'react';
import { extendTrial } from '@/app/(admin)/actions/tenants';

interface Props {
  tenantId: string;
  currentTrialEndsAt: string; // ISO string
}

export function ExtendTrialButton({ tenantId, currentTrialEndsAt }: Props) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');
  const [result, setResult] = useState<{ ok?: boolean; newTrialEndsAt?: Date; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(days, 10);
    if (isNaN(n) || n < 1) return;
    startTransition(async () => {
      const res = await extendTrial(tenantId, n);
      setResult(res as { ok?: boolean; newTrialEndsAt?: Date; error?: string });
      if ((res as { ok?: boolean }).ok) {
        setTimeout(() => setOpen(false), 1500);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null); }}
        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
      >
        Extend Trial
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Extend Trial</h2>
            <p className="text-sm text-gray-500 mb-4">
              Current trial ends: {new Date(currentTrialEndsAt).toLocaleDateString()}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add days
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {result?.error && (
                <p className="text-sm text-red-600">{result.error}</p>
              )}
              {result?.ok && (
                <p className="text-sm text-green-600">
                  Extended! New end: {result.newTrialEndsAt ? new Date(result.newTrialEndsAt).toLocaleDateString() : ''}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Extend'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
