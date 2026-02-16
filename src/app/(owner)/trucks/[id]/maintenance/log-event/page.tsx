import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="space-y-6">
      <div>
        <Link
          href={`/trucks/${id}/maintenance`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Maintenance
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Log Maintenance Event</h1>
        <p className="text-muted-foreground mt-1">
          {truck.year} {truck.make} {truck.model}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <MaintenanceEventForm
          action={boundAction}
          currentOdometer={truck.odometer}
          submitLabel="Log Event"
        />
      </div>
    </div>
  );
}
