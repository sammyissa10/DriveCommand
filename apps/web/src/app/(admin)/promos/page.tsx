export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getPromos } from '@/app/(admin)/actions/promos';
import { PromosListClient } from './promos-list-client';
import { logger } from '@/lib/logger';

export default async function PromosPage() {
  let promos: Awaited<ReturnType<typeof getPromos>> = [];
  try {
    promos = await getPromos();
  } catch (err) {
    logger.error('[PromosPage] getPromos error:', err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Promotional Codes</h1>
          <p className="mt-1 text-sm text-gray-500">Manage trial extension and discount promos</p>
        </div>
        <Link
          href="/promos/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700"
        >
          New Promo
        </Link>
      </div>
      <PromosListClient promos={promos} />
    </div>
  );
}
