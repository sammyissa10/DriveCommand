import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { deleteCustomer } from '@/app/(owner)/actions/customers';
import { InteractionTimeline } from '@/components/crm/interaction-timeline';
import { AddInteractionForm } from '@/components/crm/add-interaction-form';
import { DeleteCustomerButton } from '@/components/crm/delete-customer-button';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NOT_STARTED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    BLOCKED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  const labels: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    BLOCKED: 'Blocked',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await requireTenantId().catch(() => null);
  const prisma = await getTenantPrisma();

  let customer;
  let loadStats;
  let customerInstances: any[] = [];
  try {
    [customer, loadStats] = await Promise.all([
      prisma.customer.findUnique({
        where: { id },
        include: {
          interactions: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      }),
      prisma.load.aggregate({
        where: { customerId: id, status: 'INVOICED' },
        _count: { id: true },
        _sum: { rate: true },
        _max: { updatedAt: true },
      }),
    ]);
  } catch {
    notFound();
  }

  if (tenantId) {
    try {
      customerInstances = await prisma.playbookInstance.findMany({
        where: { entityType: 'PARTNER', entityId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        include: { stepInstances: { select: { id: true, status: true } } },
      });
    } catch {
      // Non-blocking — page renders without checklists if this fails
    }
  }

  if (!customer) {
    notFound();
  }

  const totalLoads = loadStats._count.id;
  const totalRevenue = loadStats._sum.rate ?? 0;
  const lastLoadDate = loadStats._max.updatedAt;

  const priorityColors: Record<string, string> = {
    LOW: 'bg-gray-100 text-gray-700',
    MEDIUM: 'bg-blue-100 text-blue-700',
    HIGH: 'bg-orange-100 text-orange-700',
    VIP: 'bg-amber-100 text-amber-700',
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-gray-100 text-gray-700',
    PROSPECT: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CRM
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {customer.companyName}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[customer.priority]}`}>
              {customer.priority}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[customer.status]}`}>
              {customer.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/crm/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteCustomerButton customerId={id} deleteAction={deleteCustomer} />
        </div>
      </div>

      {/* Customer info grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          {/* Contact info card */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Contact Information
            </h3>
            <dl className="space-y-3 text-sm">
              {customer.contactName && (
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="font-medium">{customer.contactName}</dd>
                </div>
              )}
              {customer.email && (
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium">{customer.email}</dd>
                </div>
              )}
              {customer.phone && (
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{customer.phone}</dd>
                </div>
              )}
              {(customer.address || customer.city) && (
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="font-medium">
                    {[customer.address, customer.city, customer.state, customer.zipCode]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Stats card */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Performance
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Total Loads</dt>
                <dd className="text-xl font-bold">{totalLoads}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Revenue</dt>
                <dd className="text-xl font-bold">${Number(totalRevenue).toLocaleString()}</dd>
              </div>
              {lastLoadDate && (
                <div>
                  <dt className="text-muted-foreground">Last Load</dt>
                  <dd className="font-medium">
                    {new Date(lastLoadDate).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {customer.notes && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Notes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </div>

        {/* Interactions timeline */}
        <div className="lg:col-span-2 space-y-6">
          <AddInteractionForm customerId={id} />
          <InteractionTimeline interactions={customer.interactions} />
        </div>
      </div>

      {/* Checklists */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Checklists</h2>
        {customerInstances.length === 0 ? (
          <p className="text-muted-foreground text-sm">No checklists started for this customer yet.</p>
        ) : (
          <div className="space-y-2">
            {customerInstances.map((instance: any) => {
              const snap = instance.playbookSnapshot as { name?: string }
              const completed = instance.stepInstances.filter(
                (s: any) => s.status === 'COMPLETE' || s.status === 'SKIPPED'
              ).length
              const total = instance.stepInstances.length
              return (
                <a
                  key={instance.id}
                  href={`/checklists/instances/${instance.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{snap.name ?? 'Checklist'}</p>
                    <p className="text-xs text-muted-foreground">{completed}/{total} tasks complete</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={instance.status} />
                    <span className="text-xs text-muted-foreground">{Math.round(instance.completionPercent)}%</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}
