import Link from 'next/link';
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
    <div className="p-8">
      <div className="mb-6">
        <Link
          href={`/trucks/${truck.id}`}
          className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
        >
          ← Back to Truck
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Edit Truck</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
