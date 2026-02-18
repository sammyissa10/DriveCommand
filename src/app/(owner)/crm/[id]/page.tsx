import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { deleteCustomer } from '@/app/(owner)/actions/customers';
import { InteractionTimeline } from '@/components/crm/interaction-timeline';
import { AddInteractionForm } from '@/components/crm/add-interaction-form';
import { DeleteCustomerButton } from '@/components/crm/delete-customer-button';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      interactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!customer) {
    notFound();
  }

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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
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
        <div className="flex items-center gap-2">
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
                <dd className="text-xl font-bold">{customer.totalLoads}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Revenue</dt>
                <dd className="text-xl font-bold">${Number(customer.totalRevenue).toLocaleString()}</dd>
              </div>
              {customer.lastLoadDate && (
                <div>
                  <dt className="text-muted-foreground">Last Load</dt>
                  <dd className="font-medium">
                    {new Date(customer.lastLoadDate).toLocaleDateString()}
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
    </div>
  );
}
