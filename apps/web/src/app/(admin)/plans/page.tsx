export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getPlans } from '@/app/(admin)/actions/plans';
import { PlansListClient } from './plans-list-client';
import { logger } from '@/lib/logger';

export default async function PlansPage() {
  let plans: Awaited<ReturnType<typeof getPlans>> = [];
  try {
    plans = await getPlans();
  } catch (err) {
    logger.error('[PlansPage] getPlans error:', err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Subscription Plans</h1>
          <p className="mt-1 text-sm text-gray-500">Manage plans available to self-service tenants</p>
        </div>
        <Link
          href="/plans/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700"
        >
          New Plan
        </Link>
      </div>
      <PlansListClient plans={plans} />
    </div>
  );
}
