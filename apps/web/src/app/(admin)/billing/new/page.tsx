import Link from 'next/link';
import { getAllTenants } from '@/app/(admin)/actions/tenants';
import { NewInvoiceForm } from './new-invoice-form';
import { logger } from '@/lib/logger';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<{ tenantId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const preselectedTenantId = params.tenantId;

  let tenants: { id: string; name: string }[] = [];
  try {
    const all = await getAllTenants();
    tenants = all.map((t) => ({ id: t.id, name: t.name }));
  } catch (err) {
    logger.error('[NewInvoicePage] getAllTenants error:', err);
  }

  return (
    <div className="space-y-6">
      <Link href="/billing" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Invoices
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New Invoice</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a new invoice for a tenant
        </p>
      </div>

      <NewInvoiceForm tenants={tenants} preselectedTenantId={preselectedTenantId} />
    </div>
  );
}
