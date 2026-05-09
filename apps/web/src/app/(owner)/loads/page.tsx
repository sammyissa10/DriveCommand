import Link from 'next/link';
import { Plus, Package, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { LoadList } from '@/components/loads/load-list';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';

export default async function LoadsPage() {
  const [prisma, tenantId] = await Promise.all([
    getTenantPrisma(),
    requireTenantId().catch(() => ''),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loads: any[] = [];
  let totalCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statusCounts: any[] = [];
  try {
    [loads, totalCount, statusCounts] = await Promise.all([
      prisma.load.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          customer: { select: { companyName: true } },
          driver: { select: { firstName: true, lastName: true } },
          truck: { select: { make: true, model: true, licensePlate: true } },
        },
      }),
      prisma.load.count({ where: { archivedAt: null, isSample: false } }),
      prisma.load.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: true,
        _sum: { rate: true },
      }),
    ]);
  } catch {
    // DB failure — render empty list
  }

  // Derive stats from aggregate groupBy results (accurate across all records, not just the 50 shown)
  let pending = 0;
  let inTransit = 0;
  let totalRevenue = 0;
  for (const g of statusCounts) {
    if (g.status === 'PENDING') pending = g._count;
    if (g.status === 'IN_TRANSIT' || g.status === 'PICKED_UP') inTransit += g._count;
    if (g.status !== 'CANCELLED') totalRevenue += Number(g._sum?.rate ?? 0);
  }

  const stats = {
    total: totalCount,
    pending,
    inTransit,
    totalRevenue,
  };

  // Sample data banner — use already-fetched loads to detect sample records (no extra query)
  const hasSampleRecords = loads.some((l: any) => l.isSample);
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Loads</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {loads.length} of {stats.total} load{stats.total !== 1 ? 's' : ''} &middot; {stats.pending} pending &middot; {stats.inTransit} in transit
          </p>
        </div>
        <Link
          href="/loads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Load
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" />
            Total Loads
          </div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Pending
          </div>
          <div className="mt-1 text-2xl font-bold text-status-warning-foreground">{stats.pending}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            In Transit
          </div>
          <div className="mt-1 text-2xl font-bold text-status-purple-foreground">{stats.inTransit}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Total Revenue
          </div>
          <div className="mt-1 text-2xl font-bold text-status-success-foreground">
            ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <LoadList loads={loads.map((l: any) => ({ ...l, rate: Number(l.rate) }))} />
    </div>
  );
}
