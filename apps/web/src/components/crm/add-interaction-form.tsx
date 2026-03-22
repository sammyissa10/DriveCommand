'use client';

import { useActionState } from 'react';
import { addInteraction } from '@/app/(owner)/actions/customers';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function AddInteractionForm({ customerId }: { customerId: string }) {
  const [state, formAction, isPending] = useActionState(addInteraction, null);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Log Interaction
      </h3>
      <form action={formAction} className="space-y-3" key={state?.success ? Date.now() : 'form'}>
        <input type="hidden" name="customerId" value={customerId} />

        {state?.error && typeof state.error === 'string' && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{state.error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <select name="type" disabled={isPending} className={inputClass} required>
              <option value="">Select type...</option>
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone Call</option>
              <option value="MEETING">Meeting</option>
              <option value="NOTE">Note</option>
              <option value="LOAD_UPDATE">Load Update</option>
              <option value="ETA_NOTIFICATION">ETA Notification</option>
            </select>
            {state?.error && typeof state.error !== 'string' && state.error.type && (
              <p className="mt-1 text-sm text-red-600">{state.error.type}</p>
            )}
          </div>
          <div>
            <input
              type="text"
              name="subject"
              placeholder="Subject..."
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error && typeof state.error !== 'string' && state.error.subject && (
              <p className="mt-1 text-sm text-red-600">{state.error.subject}</p>
            )}
          </div>
        </div>

        <textarea
          name="description"
          placeholder="Details (optional)..."
          rows={2}
          disabled={isPending}
          className={inputClass}
        />

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Adding...' : 'Add Interaction'}
        </button>
      </form>
    </div>
  );
}
