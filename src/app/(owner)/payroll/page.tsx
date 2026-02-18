import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { PayrollList } from '@/components/payroll/payroll-list';

export default async function PayrollPage() {
  const prisma = await getTenantPrisma();

  const records = await prisma.payrollRecord.findMany({
    orderBy: { periodStart: 'desc' },
    include: {
      driver: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  const stats = {
    total: records.length,
    draft: records.filter((r: any) => r.status === 'DRAFT').length,
    approved: records.filter((r: any) => r.status === 'APPROVED').length,
    totalPaid: records
      .filter((r: any) => r.status === 'PAID')
      .reduce((sum: number, r: any) => sum + Number(r.totalPay), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Payroll</h1>
          <p className="mt-1 text-muted-foreground">
            {stats.total} record{stats.total !== 1 ? 's' : ''}
            {stats.approved > 0 ? ` \u00b7 ${stats.approved} pending approval` : ''}
          </p>
        </div>
        <Link
          href="/payroll/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Payroll Record
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Records</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Draft</div>
          <div className="mt-1 text-2xl font-bold text-muted-foreground">{stats.draft}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Approved</div>
          <div className="mt-1 text-2xl font-bold text-blue-600">{stats.approved}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Paid</div>
          <div className="mt-1 text-2xl font-bold text-green-600">
            ${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <PayrollList records={records} />
    </div>
  );
}
