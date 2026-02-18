import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { InvoiceList } from '@/components/invoices/invoice-list';

export default async function InvoicesPage() {
  const prisma = await getTenantPrisma();

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  const stats = {
    total: invoices.length,
    draft: invoices.filter((i: any) => i.status === 'DRAFT').length,
    overdue: invoices.filter((i: any) => i.status === 'OVERDUE').length,
    paidAmount: invoices
      .filter((i: any) => i.status === 'PAID')
      .reduce((sum: number, i: any) => sum + Number(i.totalAmount), 0),
    outstandingAmount: invoices
      .filter((i: any) => ['SENT', 'OVERDUE'].includes(i.status))
      .reduce((sum: number, i: any) => sum + Number(i.totalAmount), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="mt-1 text-muted-foreground">
            {stats.total} invoice{stats.total !== 1 ? 's' : ''}
            {stats.overdue > 0 ? ` \u00b7 ${stats.overdue} overdue` : ''}
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Invoices</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Draft</div>
          <div className="mt-1 text-2xl font-bold text-muted-foreground">{stats.draft}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">
            ${stats.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Paid</div>
          <div className="mt-1 text-2xl font-bold text-green-600">
            ${stats.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <InvoiceList invoices={invoices} />
    </div>
  );
}
