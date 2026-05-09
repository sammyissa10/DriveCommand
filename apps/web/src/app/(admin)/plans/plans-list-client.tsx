'use client';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultTrialDays: number;
  monthlyPriceCents: number;
  maxTrucks: number | null;
  maxUsers: number | null;
  isActive: boolean;
  sortOrder: number;
}

export function PlansListClient({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-12 text-center text-sm text-gray-500">
          No plans yet.{' '}
          <Link href="/plans/new" className="text-blue-600 hover:underline">
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
              <th className="px-6 py-3">Key</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Price/mo</th>
              <th className="px-6 py-3">Trial Days</th>
              <th className="px-6 py-3">Max Trucks</th>
              <th className="px-6 py-3">Max Users</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-xs text-gray-600">{plan.key}</td>
                <td className="px-6 py-4 font-medium text-gray-900">{plan.name}</td>
                <td className="px-6 py-4 text-gray-900">${(plan.monthlyPriceCents / 100).toFixed(2)}</td>
                <td className="px-6 py-4 text-gray-600">{plan.defaultTrialDays}d</td>
                <td className="px-6 py-4 text-gray-600">{plan.maxTrucks ?? '∞'}</td>
                <td className="px-6 py-4 text-gray-600">{plan.maxUsers ?? '∞'}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      plan.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link href={`/plans/${plan.id}`} className="text-blue-600 hover:underline text-sm">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
