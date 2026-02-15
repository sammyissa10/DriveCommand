import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import {
  listMaintenanceEvents,
  listScheduledServices,
  deleteMaintenanceEvent,
  deleteScheduledService,
} from '@/app/(owner)/actions/maintenance';
import { MaintenancePageClient } from './maintenance-page-client';

interface MaintenancePageProps {
  params: Promise<{ id: string }>;
}

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Fetch both lists in parallel
  const [events, schedules] = await Promise.all([
    listMaintenanceEvents(id),
    listScheduledServices(id),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href={`/trucks/${id}`} className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
          ← Back to Truck
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          Maintenance: {truck.year} {truck.make} {truck.model}
        </h1>
        <p className="text-gray-600 mt-2">
          Current odometer: {truck.odometer.toLocaleString()} miles
        </p>
      </div>

      <MaintenancePageClient
        truckId={id}
        initialEvents={events}
        initialSchedules={schedules}
        deleteMaintenanceEvent={deleteMaintenanceEvent}
        deleteScheduledService={deleteScheduledService}
      />
    </div>
  );
}
