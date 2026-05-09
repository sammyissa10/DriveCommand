'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPromo } from '@/app/(admin)/actions/promos';
import { Card, CardContent } from '@/components/ui/card';

export function NewPromoForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [bonusTrialDays, setBonusTrialDays] = useState('0');
  const [discountPct, setDiscountPct] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createPromo({
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        bonusTrialDays: parseInt(bonusTrialDays, 10) || 0,
        discountPct: discountPct ? parseInt(discountPct, 10) : null,
        activeFrom: new Date(activeFrom).toISOString(),
        activeTo: new Date(activeTo).toISOString(),
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions, 10) : null,
        isActive,
      });
      if (!result.success) {
        setError(result.error ?? 'Failed to create promo');
        return;
      }
      router.push('/promos');
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
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">
              Code <span className="text-red-500">*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">(auto-uppercased)</span>
            </label>
            <input
              id="code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. LAUNCH30, PARTNER2026"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal note about this promo…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bonusTrialDays" className="block text-sm font-medium text-gray-700">
                Bonus Trial Days
              </label>
              <input
                id="bonusTrialDays"
                type="number"
                min="0"
                max="365"
                value={bonusTrialDays}
                onChange={(e) => setBonusTrialDays(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label htmlFor="discountPct" className="block text-sm font-medium text-gray-700">
                Discount % <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="discountPct"
                type="number"
                min="0"
                max="100"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                placeholder="0–100"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="activeFrom" className="block text-sm font-medium text-gray-700">
                Active From <span className="text-red-500">*</span>
              </label>
              <input
                id="activeFrom"
                type="date"
                required
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
            <div>
              <label htmlFor="activeTo" className="block text-sm font-medium text-gray-700">
                Active To <span className="text-red-500">*</span>
              </label>
              <input
                id="activeTo"
                type="date"
                required
                value={activeTo}
                onChange={(e) => setActiveTo(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="maxRedemptions" className="block text-sm font-medium text-gray-700">
              Max Redemptions <span className="text-gray-400">(empty = unlimited)</span>
            </label>
            <input
              id="maxRedemptions"
              type="number"
              min="1"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="∞"
              className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active <span className="text-gray-400 font-normal">(can be redeemed immediately)</span>
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
          {isSubmitting ? 'Creating…' : 'Create Promo'}
        </button>
        <Link href="/promos" className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
