import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { CustomerList } from '@/components/crm/customer-list';

export default async function CRMPage() {
  const prisma = await getTenantPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = [];
  try {
    customers = await prisma.customer.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { interactions: true },
        },
      },
    });
  } catch {
    // DB failure — render empty list
  }

  const stats = {
    total: customers.length,
    active: customers.filter((c: any) => c.status === 'ACTIVE').length,
    vip: customers.filter((c: any) => c.priority === 'VIP').length,
    totalRevenue: customers.reduce((sum: number, c: any) => sum + Number(c.totalRevenue), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">CRM</h1>
          <p className="mt-1 text-muted-foreground">
            {stats.total} customer{stats.total !== 1 ? 's' : ''} &middot; {stats.active} active &middot; {stats.vip} VIP
          </p>
        </div>
        <Link
          href="/crm/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
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
