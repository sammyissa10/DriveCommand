import { createCustomer } from '@/app/(owner)/actions/customers';
import { CustomerForm } from '@/components/crm/customer-form';

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Add Customer</h1>
        <p className="mt-1 text-muted-foreground">Add a new customer to your CRM</p>
      </div>
      <CustomerForm action={createCustomer} submitLabel="Create Customer" />
    </div>
  );
}
