import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { getRoute } from '@/app/(owner)/actions/routes';
import { formatForDatetimeInput } from '@/lib/utils/date';
import { EditRouteClient } from './edit-route-client';

interface EditRoutePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRoutePage({ params }: EditRoutePageProps) {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    notFound();
  }

  const prisma = await getTenantPrisma();

  // Fetch active drivers
  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  // Fetch all trucks
  const trucks = await prisma.truck.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      licensePlate: true,
    },
  });

  // Format scheduledDate for datetime-local input
  const formattedScheduledDate = formatForDatetimeInput(route.scheduledDate);

  const initialData = {
    origin: route.origin,
    destination: route.destination,
    scheduledDate: formattedScheduledDate,
    driverId: route.driver.id,
    truckId: route.truck.id,
    notes: route.notes || undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/routes/${id}`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Route
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Route</h1>
        <p className="mt-1 text-muted-foreground">Update route details</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <EditRouteClient
          routeId={id}
          initialData={initialData}
          drivers={drivers}
          trucks={trucks}
        />
      </div>
    </div>
  );
}
