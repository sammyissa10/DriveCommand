import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { InvoiceList } from '@/components/invoices/invoice-list';
import { InvoicesMobile, type InvoiceMobileRow } from '@/components/invoices/InvoicesMobile';

export default async function InvoicesPage() {
  const prisma = await getTenantPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let invoices: any[] = [];
  let totalCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statusCounts: any[] = [];
  try {
    [invoices, totalCount, statusCounts] = await Promise.all([
      prisma.invoice.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: true },
      }),
      prisma.invoice.count({ where: { archivedAt: null } }),
      prisma.invoice.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ]);
  } catch {
    // DB failure — render empty list
  }

  // Derive stats from aggregate groupBy results (accurate across all records, not just the 50 shown)
  let draft = 0;
  let overdue = 0;
  let paidAmount = 0;
  let outstandingAmount = 0;
  for (const g of statusCounts) {
    const amount = Number(g._sum?.totalAmount ?? 0);
    if (g.status === 'DRAFT') draft = g._count;
    if (g.status === 'OVERDUE') { overdue = g._count; outstandingAmount += amount; }
    if (g.status === 'SENT') outstandingAmount += amount;
    if (g.status === 'PAID') paidAmount = amount;
  }

  const stats = {
    total: totalCount,
    draft,
    overdue,
    paidAmount,
    outstandingAmount,
  };

  const mobileRows: InvoiceMobileRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    total: Number(inv.totalAmount),
    dueDate: new Date(inv.dueDate).toISOString(),
  }));

  // Prisma returns Decimal objects, which can't cross the Server→Client boundary.
  // Map to plain numbers before handing rows to the InvoiceList client component.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const desktopInvoices = invoices.map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    amount: Number(inv.amount),
    tax: Number(inv.tax),
    totalAmount: Number(inv.totalAmount),
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    paidDate: inv.paidDate,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: inv.items.map((it: any) => ({ id: it.id, amount: Number(it.amount) })),
  }));

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <InvoicesMobile rows={mobileRows} stats={stats} />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="mt-1 text-muted-foreground">
            Showing {invoices.length} of {stats.total} invoice{stats.total !== 1 ? 's' : ''}
            {stats.overdue > 0 ? ` \u00b7 ${stats.overdue} overdue` : ''}
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Invoices</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Draft</div>
          <div className="mt-1 text-2xl font-bold text-muted-foreground">{stats.draft}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-status-warning-foreground">
            ${stats.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-interactive">
          <div className="text-sm text-muted-foreground">Total Paid</div>
          <div className="mt-1 text-2xl font-bold text-status-success-foreground">
            ${stats.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <InvoiceList invoices={desktopInvoices} />
      </div>
    </>
  );
}
