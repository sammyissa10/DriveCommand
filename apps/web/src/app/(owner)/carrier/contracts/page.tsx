import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listContracts } from '@/lib/carrier/contracts';
import { hasPermission } from '@/lib/auth/permissions';
import { ContractsGrid } from './_grid/ContractsGrid';
import { ContractsMobile } from './ContractsMobile';
import type { ContractRow } from './_grid/types';

function isExpiringSoon(expirationDate: string | null, status: string): boolean {
  if (!expirationDate) return false;
  if (status === 'terminated' || status === 'expired') return false;
  const exp = new Date(expirationDate);
  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  return exp <= thirtyDaysOut && exp > now;
}

export default async function ContractsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const canCreate = hasPermission(session.permissions ?? null, 'contracts', session.role);
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listContracts>>['items'] = [];
  let total = 0;

  try {
    const result = await listContracts(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const c of items) {
    const s = c.status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    pending: 'Pending',
    expired: 'Expired',
    terminated: 'Terminated',
  };

  // Transform to ContractRow format
  const contracts: ContractRow[] = items.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    contractType: c.contractType,
    rateType: c.rateType,
    baseRate: c.baseRate,
    fuelSurchargeMethod: c.fuelSurchargeMethod,
    fuelSurchargeRate: c.fuelSurchargeRate,
    status: c.status,
    effectiveDate: c.effectiveDate ? c.effectiveDate.toISOString() : null,
    expirationDate: c.expirationDate ? c.expirationDate.toISOString() : null,
    clientId: c.clientId,
    clientName: c.client.name,
    isExpiringSoon: isExpiringSoon(
      c.expirationDate ? c.expirationDate.toISOString() : null,
      c.status
    ),
  }));

  return (
    <>
      {/* Mobile-web design system — rendered below lg; desktop keeps its grid */}
      <div className="lg:hidden -m-4">
        <ContractsMobile contracts={contracts} canCreate={canCreate} />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Contracts
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {items.length} of {total} contract{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stat row */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-semibold">{count}</span>
              <span className="text-muted-foreground">
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
          ))}
        </div>
      )}

      <ContractsGrid contracts={contracts} />
      </div>
    </>
  );
}
