import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { CustomerList } from '@/components/crm/customer-list';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';

export default async function CRMPage() {
  const [prisma, tenantId] = await Promise.all([
    getTenantPrisma(),
    requireTenantId().catch(() => ''),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = [];
  let totalCount = 0;
  let activeCount = 0;
  let vipCount = 0;
  let totalRevenue = 0;
  try {
    const [rawCustomers, loadStats, customerTotal, activeTotal, vipTotal] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { _count: { select: { interactions: true } } },
      }),
      prisma.load.groupBy({
        by: ['customerId'],
        where: { status: 'INVOICED' },
        _count: { id: true },
        _sum: { rate: true },
      }),
      prisma.customer.count({ where: { isSample: false } }),
      prisma.customer.count({ where: { status: 'ACTIVE', isSample: false } }),
      prisma.customer.count({ where: { priority: 'VIP', isSample: false } }),
    ]);

    const statsMap = new Map(
      loadStats.map((s: any) => [s.customerId, { totalLoads: s._count.id, totalRevenue: Number(s._sum.rate ?? 0) }])
    );

    customers = rawCustomers.map((c: any) => ({
      ...c,
      totalLoads: statsMap.get(c.id)?.totalLoads ?? 0,
      totalRevenue: statsMap.get(c.id)?.totalRevenue ?? 0,
    }));

    totalCount = customerTotal;
    activeCount = activeTotal;
    vipCount = vipTotal;
    totalRevenue = loadStats.reduce((sum: number, s: any) => sum + Number(s._sum.rate ?? 0), 0);
  } catch {
    // DB failure — render empty list
  }

  const stats = {
    total: totalCount,
    active: activeCount,
    vip: vipCount,
    totalRevenue,
  };

  // Sample data banner — use already-fetched customers to detect sample records (no extra query)
  const hasSampleRecords = customers.some((c: any) => c.isSample);
  let sampleDataSeeded = false;
  if (hasSampleRecords && tenantId) {
    try {
      const tenant = await prisma.tenant.findFirst({ select: { sampleDataSeeded: true } });
      sampleDataSeeded = tenant?.sampleDataSeeded ?? false;
    } catch {
      // Non-critical — banner hidden by default
    }
  }

  return (
    <div className="space-y-6">
      {/* Sample data banner */}
      {sampleDataSeeded && hasSampleRecords && tenantId && (
        <SampleDataBanner tenantId={tenantId} />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">CRM</h1>
          <p className="mt-1 text-muted-foreground">
            Showing {customers.length} of {stats.total} customer{stats.total !== 1 ? 's' : ''} &middot; {stats.active} active &middot; {stats.vip} VIP
          </p>
        </div>
        <Link
          href="/crm/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Customers</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Active</div>
          <div className="mt-1 text-2xl font-bold text-status-success-foreground">{stats.active}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">VIP Customers</div>
          <div className="mt-1 text-2xl font-bold text-status-warning-foreground">{stats.vip}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Revenue</div>
          <div className="mt-1 text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
        </div>
      </div>

      <CustomerList customers={customers} />
    </div>
  );
}
