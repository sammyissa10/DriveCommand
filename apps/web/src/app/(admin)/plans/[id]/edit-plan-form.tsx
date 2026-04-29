'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { updatePlan } from '@/app/(admin)/actions/plans';

interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultTrialDays: number;
  monthlyPriceCents: number;
  yearlyPriceCents: number | null;
  maxTrucks: number | null;
  maxUsers: number | null;
  storageGbLimit: number | null;
  isActive: boolean;
  sortOrder: number;
}

export function EditPlanForm({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const [defaultTrialDays, setDefaultTrialDays] = useState(String(plan.defaultTrialDays));
  const [monthlyPriceDollars, setMonthlyPriceDollars] = useState(
    (plan.monthlyPriceCents / 100).toFixed(2),
  );
  const [yearlyPriceDollars, setYearlyPriceDollars] = useState(
    plan.yearlyPriceCents != null ? (plan.yearlyPriceCents / 100).toFixed(2) : '',
  );
  const [maxTrucks, setMaxTrucks] = useState(plan.maxTrucks != null ? String(plan.maxTrucks) : '');
  const [maxUsers, setMaxUsers] = useState(plan.maxUsers != null ? String(plan.maxUsers) : '');
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [isActive, setIsActive] = useState(plan.isActive);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await updatePlan(plan.id, {
      name,
      description: description || undefined,
      defaultTrialDays: parseInt(defaultTrialDays, 10),
      monthlyPriceCents: Math.round(parseFloat(monthlyPriceDollars) * 100),
      yearlyPriceCents: yearlyPriceDollars ? Math.round(parseFloat(yearlyPriceDollars) * 100) : null,
      maxTrucks: maxTrucks ? parseInt(maxTrucks, 10) : null,
      maxUsers: maxUsers ? parseInt(maxUsers, 10) : null,
      sortOrder: parseInt(sortOrder, 10),
      isActive,
    });

    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to update plan.');
      return;
    }
    router.push('/plans');
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Plan Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Key (read-only)</label>
            <input
              value={plan.key}
              disabled
              className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Monthly Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlyPriceDollars}
                onChange={(e) => setMonthlyPriceDollars(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Yearly Price ($, optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={yearlyPriceDollars}
                onChange={(e) => setYearlyPriceDollars(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Trial Days</label>
              <input
                type="number"
                min="0"
                value={defaultTrialDays}
                onChange={(e) => setDefaultTrialDays(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Trucks (blank = ∞)</label>
              <input
                type="number"
                min="1"
                value={maxTrucks}
                onChange={(e) => setMaxTrucks(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Users (blank = ∞)</label>
              <input
                type="number"
                min="1"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Sort Order</label>
              <input
                type="number"
                min="0"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span className="text-sm font-medium text-gray-700">Active (available to tenants)</span>
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/plans')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
