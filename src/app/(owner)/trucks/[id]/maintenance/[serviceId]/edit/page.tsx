import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import { getScheduledService, updateScheduledService } from '@/app/(owner)/actions/maintenance';
import { ScheduledServiceForm } from '@/components/maintenance/scheduled-service-form';

interface EditScheduledServicePageProps {
  params: Promise<{ id: string; serviceId: string }>;
}

export default async function EditScheduledServicePage({ params }: EditScheduledServicePageProps) {
  const { id, serviceId } = await params;

  const [truck, service] = await Promise.all([getTruck(id), getScheduledService(serviceId)]);

  if (!truck || !service) {
    notFound();
  }

  // Format baselineDate for the date input (YYYY-MM-DD)
  const baselineDate =
    service.baselineDate instanceof Date
      ? service.baselineDate.toISOString().split('T')[0]
      : String(service.baselineDate).split('T')[0];

  // Bind truck and service IDs to the action
  const boundAction = updateScheduledService.bind(null, id, serviceId);

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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Scheduled Service</h1>
        <p className="text-muted-foreground mt-1">
          {truck.year} {truck.make} {truck.model}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <ScheduledServiceForm
          action={boundAction}
          currentOdometer={truck.odometer}
          submitLabel="Update Service"
          initialValues={{
            serviceType: service.serviceType,
            intervalDays: service.intervalDays,
            intervalMiles: service.intervalMiles,
            baselineDate,
            baselineOdometer: service.baselineOdometer,
            notes: service.notes,
          }}
        />
      </div>
    </div>
  );
}
