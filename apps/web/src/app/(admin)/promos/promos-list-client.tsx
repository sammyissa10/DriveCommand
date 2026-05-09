'use client';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Promo {
  id: string;
  code: string;
  description: string | null;
  bonusTrialDays: number;
  discountPct: number | null;
  activeFrom: Date;
  activeTo: Date;
  maxRedemptions: number | null;
  redemptionCount: number;
  isActive: boolean;
}

export function PromosListClient({ promos }: { promos: Promo[] }) {
  if (promos.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-12 text-center text-sm text-gray-500">
          No promos yet.{' '}
          <Link href="/promos/new" className="text-blue-600 hover:underline">
            Create the first one.
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Code</th>
              <th className="px-6 py-3">Description</th>
              <th className="px-6 py-3">+Days</th>
              <th className="px-6 py-3">Discount</th>
              <th className="px-6 py-3">Active From</th>
              <th className="px-6 py-3">Active To</th>
              <th className="px-6 py-3">Used / Max</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {promos.map((promo) => (
              <tr key={promo.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-900">
                  {promo.code}
                </td>
                <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                  {promo.description ?? '—'}
                </td>
                <td className="px-6 py-4 text-gray-900">
                  {promo.bonusTrialDays > 0 ? `+${promo.bonusTrialDays}d` : '—'}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {promo.discountPct != null ? `${promo.discountPct}%` : '—'}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {new Date(promo.activeFrom).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {new Date(promo.activeTo).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {promo.redemptionCount} / {promo.maxRedemptions ?? '∞'}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      promo.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {promo.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
