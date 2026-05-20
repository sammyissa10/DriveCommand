'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTenantSettings } from '@/app/(admin)/actions/tenants';

interface TenantSettingsFormProps {
  tenantId: string;
  initialContactEmail: string | null;
  initialTimezone: string;
  initialPlan: string;
  initialProfitMarginThreshold: number;
  initialFleetSizeBucket: 'OWNER_OPERATOR' | 'SMALL' | 'MEDIUM' | 'LARGE';
  initialManualTrial: boolean;
}

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
];

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const FLEET_SIZE_BUCKETS = [
  { value: 'OWNER_OPERATOR', label: 'Owner-Operator (1 truck)' },
  { value: 'SMALL', label: 'Small (2-10 trucks)' },
  { value: 'MEDIUM', label: 'Medium (11-50 trucks)' },
  { value: 'LARGE', label: 'Large (51+ trucks)' },
] as const;

export function TenantSettingsForm({
  tenantId,
  initialContactEmail,
  initialTimezone,
  initialPlan,
  initialProfitMarginThreshold,
  initialFleetSizeBucket,
  initialManualTrial,
}: TenantSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [contactEmail, setContactEmail] = useState(initialContactEmail ?? '');
  const [timezone, setTimezone] = useState(initialTimezone || 'UTC');
  const [plan, setPlan] = useState(initialPlan || 'starter');
  const [profitMarginThreshold, setProfitMarginThreshold] = useState(
    String(initialProfitMarginThreshold ?? 10)
  );
  const [fleetSizeBucket, setFleetSizeBucket] = useState<'OWNER_OPERATOR' | 'SMALL' | 'MEDIUM' | 'LARGE'>(
    initialFleetSizeBucket ?? 'OWNER_OPERATOR'
  );
  const [manualTrial, setManualTrial] = useState(initialManualTrial ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty =
    contactEmail !== (initialContactEmail ?? '') ||
    timezone !== (initialTimezone || 'UTC') ||
    plan !== (initialPlan || 'starter') ||
    profitMarginThreshold !== String(initialProfitMarginThreshold ?? 10) ||
    fleetSizeBucket !== (initialFleetSizeBucket ?? 'OWNER_OPERATOR') ||
    manualTrial !== (initialManualTrial ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const threshold = Number(profitMarginThreshold);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
      setError('Profit margin threshold must be a number between 0 and 100');
      return;
    }

    startTransition(async () => {
      const result = await updateTenantSettings(tenantId, {
        contactEmail: contactEmail.trim() || undefined,
        timezone,
        plan,
        profitMarginThreshold: threshold,
        fleetSizeBucket,
        manualTrial,
      });
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update settings');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Settings updated successfully.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Contact Email */}
        <div>
          <label htmlFor="contact-email" className="block text-xs font-medium text-gray-500 mb-1">
            Contact Email <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="contact-email"
            type="email"
            value={contactEmail}
            onChange={(e) => { setContactEmail(e.target.value); setSuccess(false); }}
            disabled={isPending}
            placeholder="billing@company.com"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className="block text-xs font-medium text-gray-500 mb-1">
            Timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => { setTimezone(e.target.value); setSuccess(false); }}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 bg-white"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Plan */}
        <div>
          <label htmlFor="plan" className="block text-xs font-medium text-gray-500 mb-1">
            Plan
          </label>
          <select
            id="plan"
            value={plan}
            onChange={(e) => { setPlan(e.target.value); setSuccess(false); }}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 bg-white"
          >
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 select-none">
          Advanced
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Profit Margin Threshold */}
          <div>
            <label htmlFor="profit-margin-threshold" className="block text-xs font-medium text-gray-500 mb-1">
              Profit Margin Threshold (%)
            </label>
            <input
              id="profit-margin-threshold"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={profitMarginThreshold}
              onChange={(e) => { setProfitMarginThreshold(e.target.value); setSuccess(false); }}
              disabled={isPending}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-gray-400">Loads below this margin trigger low-profit alerts.</p>
          </div>

          {/* Fleet Size Bucket */}
          <div>
            <label htmlFor="fleet-size-bucket" className="block text-xs font-medium text-gray-500 mb-1">
              Fleet Size
            </label>
            <select
              id="fleet-size-bucket"
              value={fleetSizeBucket}
              onChange={(e) => { setFleetSizeBucket(e.target.value as typeof fleetSizeBucket); setSuccess(false); }}
              disabled={isPending}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 bg-white"
            >
              {FLEET_SIZE_BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Used for analytics segmentation and onboarding flow.</p>
          </div>

          {/* Manual Trial */}
          <div>
            <label htmlFor="manual-trial" className="block text-xs font-medium text-gray-500 mb-1">
              Manual Trial
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
              <input
                id="manual-trial"
                type="checkbox"
                checked={manualTrial}
                onChange={(e) => { setManualTrial(e.target.checked); setSuccess(false); }}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
              />
              <span className="text-sm text-gray-900">Tenant is on a manually-managed trial</span>
            </label>
            <p className="mt-1 text-xs text-gray-400">Bypasses automatic trial expiry and billing transitions.</p>
          </div>
        </div>
      </details>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
