import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="space-y-6">
      <div>
        <Link
          href={`/trucks/${id}`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Truck
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Maintenance: {truck.year} {truck.make} {truck.model}
        </h1>
        <p className="text-muted-foreground mt-1">
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
