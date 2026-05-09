'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPlan } from '@/app/(admin)/actions/plans';
import { Card, CardContent } from '@/components/ui/card';

export function NewPlanForm() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTrialDays, setDefaultTrialDays] = useState('14');
  const [monthlyPriceDollars, setMonthlyPriceDollars] = useState('');
  const [maxTrucks, setMaxTrucks] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createPlan({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        defaultTrialDays: parseInt(defaultTrialDays, 10) || 0,
        monthlyPriceCents: Math.round(parseFloat(monthlyPriceDollars || '0') * 100),
        maxTrucks: maxTrucks ? parseInt(maxTrucks, 10) : null,
        maxUsers: maxUsers ? parseInt(maxUsers, 10) : null,
        sortOrder: parseInt(sortOrder, 10) || 0,
        isActive,
      });
      if (!result.success) {
        setError(result.error ?? 'Failed to create plan');
        return;
      }
      router.push('/plans');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Key */}
          <div>
            <label htmlFor="key" className="block text-sm font-medium text-gray-700">
              Key <span className="text-red-500">*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">(lowercase, immutable after creation)</span>
            </label>
            <input
              id="key"
              type="text"
              required
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="e.g. starter, pro, fleet"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starter, Pro, Fleet"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description shown to tenants…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Monthly Price */}
          <div>
            <label htmlFor="monthlyPrice" className="block text-sm font-medium text-gray-700">
              Monthly Price (USD) <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
              <input
                id="monthlyPrice"
                type="number"
                required
                min="0"
                step="0.01"
                value={monthlyPriceDollars}
                onChange={(e) => setMonthlyPriceDollars(e.target.value)}
                placeholder="0.00"
                className="block w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Trial Days */}
          <div>
            <label htmlFor="trialDays" className="block text-sm font-medium text-gray-700">
              Default Trial Days <span className="text-red-500">*</span>
            </label>
            <input
              id="trialDays"
              type="number"
              required
              min="0"
              max="365"
              value={defaultTrialDays}
              onChange={(e) => setDefaultTrialDays(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="maxTrucks" className="block text-sm font-medium text-gray-700">
                Max Trucks <span className="text-gray-400">(empty = unlimited)</span>
              </label>
              <input
                id="maxTrucks"
                type="number"
                min="1"
                value={maxTrucks}
                onChange={(e) => setMaxTrucks(e.target.value)}
                placeholder="∞"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label htmlFor="maxUsers" className="block text-sm font-medium text-gray-700">
                Max Users <span className="text-gray-400">(empty = unlimited)</span>
              </label>
              <input
                id="maxUsers"
                type="number"
                min="1"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                placeholder="∞"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Sort Order */}
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700">
              Sort Order
            </label>
            <input
              id="sortOrder"
              type="number"
              min="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active <span className="text-gray-400 font-normal">(visible to self-service tenants)</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating…' : 'Create Plan'}
        </button>
        <Link href="/plans" className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
