import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { PayrollList } from '@/components/payroll/payroll-list';
import { PayrollMobile, type PayrollMobileRow } from '@/components/payroll/PayrollMobile';

export default async function PayrollPage() {
  const prisma = await getTenantPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let records: any[] = [];
  let totalCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statusCounts: any[] = [];
  try {
    [records, totalCount, statusCounts] = await Promise.all([
      prisma.payrollRecord.findMany({
        where: { archivedAt: null },
        orderBy: { periodStart: 'desc' },
        take: 50,
        include: {
          driver: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.payrollRecord.count({ where: { archivedAt: null } }),
      prisma.payrollRecord.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: true,
        _sum: { totalPay: true },
      }),
    ]);
  } catch {
    // DB failure — render empty list
  }

  // Derive stats from aggregate groupBy results (accurate across all records, not just the 50 shown)
  let draft = 0;
  let approved = 0;
  let totalPaid = 0;
  for (const g of statusCounts) {
    if (g.status === 'DRAFT') draft = g._count;
    if (g.status === 'APPROVED') approved = g._count;
    if (g.status === 'PAID') totalPaid = Number(g._sum?.totalPay ?? 0);
  }

  const stats = {
    total: totalCount,
    draft,
    approved,
    totalPaid,
  };

  const mobileRows: PayrollMobileRow[] = records.map((rec) => ({
    id: rec.id,
    driverName: `${rec.driver?.firstName ?? ''} ${rec.driver?.lastName ?? ''}`.trim() || rec.driver?.email || 'Driver',
    periodStart: new Date(rec.periodStart).toISOString(),
    periodEnd: new Date(rec.periodEnd).toISOString(),
    totalPay: Number(rec.totalPay),
    status: rec.status,
  }));

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <PayrollMobile rows={mobileRows} stats={stats} />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Payroll</h1>
          <p className="mt-1 text-muted-foreground">
            Showing {records.length} of {stats.total} record{stats.total !== 1 ? 's' : ''}
            {stats.approved > 0 ? ` \u00b7 ${stats.approved} pending approval` : ''}
          </p>
        </div>
        <Link
          href="/payroll/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Payroll Record
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Records</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Draft</div>
          <div className="mt-1 text-2xl font-bold text-muted-foreground">{stats.draft}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Approved</div>
          <div className="mt-1 text-2xl font-bold text-status-info-foreground">{stats.approved}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Paid</div>
          <div className="mt-1 text-2xl font-bold text-status-success-foreground">
            ${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <PayrollList records={records} />
      </div>
    </>
  );
}
