import Link from 'next/link';
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
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex items-center space-x-4">
        <Link
          href={`/routes/${id}`}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Route
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Edit Route</h1>

      {/* Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
