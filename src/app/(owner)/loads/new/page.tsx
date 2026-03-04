import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createLoad } from '@/app/(owner)/actions/loads';
import { LoadForm } from '@/components/loads/load-form';

export default async function NewLoadPage() {
  const prisma = await getTenantPrisma();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let drivers: any[] = [];
  try {
    [customers, drivers] = await Promise.all([
      prisma.customer.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'DRIVER', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
  } catch {
    // DB failure — render form with empty lists
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Load</h1>
        <p className="mt-1 text-muted-foreground">Add a new load to your board</p>
      </div>
      <LoadForm action={createLoad} customers={customers} drivers={drivers} submitLabel="Create Load" />
    </div>
  );
}
