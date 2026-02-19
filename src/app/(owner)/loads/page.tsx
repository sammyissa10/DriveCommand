import Link from 'next/link';
import { Plus, Package, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { LoadList } from '@/components/loads/load-list';

export default async function LoadsPage() {
  const prisma = await getTenantPrisma();

  const loads = await prisma.load.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { companyName: true } },
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { make: true, model: true, licensePlate: true } },
    },
  });

  const nonCancelledLoads = loads.filter((l: any) => l.status !== 'CANCELLED');

  const stats = {
    total: loads.length,
    pending: loads.filter((l: any) => l.status === 'PENDING').length,
    inTransit: loads.filter((l: any) => l.status === 'IN_TRANSIT' || l.status === 'PICKED_UP').length,
    totalRevenue: nonCancelledLoads.reduce(
      (sum: number, l: any) => sum + Number(l.rate),
      0
    ),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Loads</h1>
          <p className="mt-1 text-muted-foreground">
            {stats.total} load{stats.total !== 1 ? 's' : ''} &middot; {stats.pending} pending &middot; {stats.inTransit} in transit
          </p>
        </div>
        <Link
          href="/loads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
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

      <LoadList loads={loads} />
    </div>
  );
}
