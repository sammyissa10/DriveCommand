'use client';

import { useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MaintenanceEventList } from '@/components/maintenance/maintenance-event-list';
import { ScheduledServiceList } from '@/components/maintenance/scheduled-service-list';

interface MaintenancePageClientProps {
  truckId: string;
  initialEvents: any[];
  initialSchedules: any[];
  deleteMaintenanceEvent: (id: string, truckId: string) => Promise<{ success: boolean }>;
  deleteScheduledService: (id: string, truckId: string) => Promise<{ success: boolean }>;
}

export function MaintenancePageClient({
  truckId,
  initialEvents,
  initialSchedules,
  deleteMaintenanceEvent,
  deleteScheduledService,
}: MaintenancePageClientProps) {
  const router = useRouter();
  const [optimisticEvents, setOptimisticEvents] = useOptimistic(initialEvents);
  const [optimisticSchedules, setOptimisticSchedules] = useOptimistic(initialSchedules);

  const handleDeleteEvent = async (id: string) => {
    setOptimisticEvents(optimisticEvents.filter((event: any) => event.id !== id));
    await deleteMaintenanceEvent(id, truckId);
    router.refresh();
  };

  const handleDeleteSchedule = async (id: string) => {
    setOptimisticSchedules(optimisticSchedules.filter((schedule: any) => schedule.id !== id));
    await deleteScheduledService(id, truckId);
    router.refresh();
  };

  return (
    <>
      {/* Scheduled Services Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Scheduled Services</h2>
          <Link
            href={`/trucks/${truckId}/maintenance/schedule-service`}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Schedule Service
          </Link>
        </div>
        <ScheduledServiceList schedules={optimisticSchedules} onDelete={handleDeleteSchedule} />
      </div>

      {/* Service History Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Service History</h2>
          <Link
            href={`/trucks/${truckId}/maintenance/log-event`}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Log Service
          </Link>
        </div>
        <MaintenanceEventList events={optimisticEvents} onDelete={handleDeleteEvent} />
      </div>
    </>
  );
}
