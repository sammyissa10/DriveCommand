import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import { createScheduledService } from '@/app/(owner)/actions/maintenance';
import { ScheduledServiceForm } from '@/components/maintenance/scheduled-service-form';

interface ScheduleServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function ScheduleServicePage({ params }: ScheduleServicePageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Bind the truck ID to the action
  const boundAction = createScheduledService.bind(null, id);

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href={`/trucks/${id}/maintenance`}
          className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
        >
          ← Back to Maintenance
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Schedule Service</h1>
        <p className="text-gray-600 mt-2">
          {truck.year} {truck.make} {truck.model}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <ScheduledServiceForm
          action={boundAction}
          currentOdometer={truck.odometer}
          submitLabel="Schedule Service"
        />
      </div>
    </div>
  );
}
