import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createLoad } from '@/app/(owner)/actions/loads';
import { LoadForm } from '@/components/loads/load-form';

export default async function NewLoadPage() {
  const prisma = await getTenantPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = [];
  try {
    customers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' },
    });
  } catch {
    // DB failure — render form with empty customer list
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Load</h1>
        <p className="mt-1 text-muted-foreground">Add a new load to your board</p>
      </div>
      <LoadForm action={createLoad} customers={customers} submitLabel="Create Load" />
    </div>
  );
}
