import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTruck, updateTruck } from '@/app/(owner)/actions/trucks';
import { EditTruckClient } from './edit-truck-client';

interface EditTruckPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTruckPage({ params }: EditTruckPageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Parse documentMetadata from JSONB
  const documentMetadata = truck.documentMetadata as any;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/trucks/${truck.id}`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Truck
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Truck</h1>
        <p className="mt-1 text-muted-foreground">Update vehicle details</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <EditTruckClient
          truckId={truck.id}
          initialData={{
            make: truck.make,
            model: truck.model,
            year: truck.year,
            vin: truck.vin,
            licensePlate: truck.licensePlate,
            odometer: truck.odometer,
            documentMetadata: documentMetadata || undefined,
          }}
        />
      </div>
    </div>
  );
}
