'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTenantSettings } from '@/app/(admin)/actions/tenants';

interface TenantSettingsFormProps {
  tenantId: string;
  initialContactEmail: string | null;
  initialTimezone: string;
  initialPlan: string;
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

export function TenantSettingsForm({
  tenantId,
  initialContactEmail,
  initialTimezone,
  initialPlan,
}: TenantSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [contactEmail, setContactEmail] = useState(initialContactEmail ?? '');
  const [timezone, setTimezone] = useState(initialTimezone || 'UTC');
  const [plan, setPlan] = useState(initialPlan || 'starter');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty =
    contactEmail !== (initialContactEmail ?? '') ||
    timezone !== (initialTimezone || 'UTC') ||
    plan !== (initialPlan || 'starter');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateTenantSettings(tenantId, {
        contactEmail: contactEmail.trim() || undefined,
        timezone,
        plan,
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
