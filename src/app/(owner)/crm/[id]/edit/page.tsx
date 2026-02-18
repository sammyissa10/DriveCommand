import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { updateCustomer } from '@/app/(owner)/actions/customers';
import { CustomerForm } from '@/components/crm/customer-form';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  const customer = await prisma.customer.findUnique({ where: { id } });

  if (!customer) {
    notFound();
  }

  const boundAction = updateCustomer.bind(null, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/crm/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customer
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Customer</h1>
        <p className="mt-1 text-muted-foreground">Update {customer.companyName}</p>
      </div>
      <CustomerForm
        action={boundAction}
        initialData={{
          companyName: customer.companyName,
          contactName: customer.contactName || '',
          email: customer.email || '',
          phone: customer.phone || '',
          address: customer.address || '',
          city: customer.city || '',
          state: customer.state || '',
          zipCode: customer.zipCode || '',
          priority: customer.priority,
          status: customer.status,
          notes: customer.notes || '',
          emailNotifications: customer.emailNotifications,
        }}
        submitLabel="Update Customer"
      />
    </div>
  );
}
