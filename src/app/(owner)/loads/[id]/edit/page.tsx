import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { updateLoad } from '@/app/(owner)/actions/loads';
import { LoadForm } from '@/components/loads/load-form';

export default async function EditLoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  let load: Awaited<ReturnType<typeof prisma.load.findUnique>> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let drivers: any[] = [];
  try {
    [load, customers, drivers] = await Promise.all([
      prisma.load.findUnique({ where: { id } }),
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
    notFound();
  }

  if (!load) {
    notFound();
  }

  // Format dates for input[type="date"] (YYYY-MM-DD)
  const pickupDateStr = load.pickupDate.toISOString().split('T')[0];
  const deliveryDateStr = load.deliveryDate ? load.deliveryDate.toISOString().split('T')[0] : '';

  const boundUpdateLoad = updateLoad.bind(null, id);

  return (
    <div className="space-y-6">
      <Link
        href={`/loads/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Load
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Edit Load #{load.loadNumber}
        </h1>
        <p className="mt-1 text-muted-foreground">Update load details</p>
      </div>

      <LoadForm
        action={boundUpdateLoad}
        customers={customers}
        drivers={drivers}
        submitLabel="Save Changes"
        initialData={{
          customerId: load.customerId,
          driverId: load.driverId,
          origin: load.origin,
          destination: load.destination,
          pickupDate: pickupDateStr,
          deliveryDate: deliveryDateStr,
          weight: load.weight,
          commodity: load.commodity,
          rate: Number(load.rate),
          notes: load.notes,
        }}
      />
    </div>
  );
}
