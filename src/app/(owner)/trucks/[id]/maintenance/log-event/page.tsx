import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import { createMaintenanceEvent } from '@/app/(owner)/actions/maintenance';
import { MaintenanceEventForm } from '@/components/maintenance/maintenance-event-form';

interface LogEventPageProps {
  params: Promise<{ id: string }>;
}

export default async function LogEventPage({ params }: LogEventPageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Bind the truck ID to the action
  const boundAction = createMaintenanceEvent.bind(null, id);

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href={`/trucks/${id}/maintenance`}
          className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
        >
          ← Back to Maintenance
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Log Maintenance Event</h1>
        <p className="text-gray-600 mt-2">
          {truck.year} {truck.make} {truck.model}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <MaintenanceEventForm
          action={boundAction}
          currentOdometer={truck.odometer}
          submitLabel="Log Event"
        />
      </div>
    </div>
  );
}
