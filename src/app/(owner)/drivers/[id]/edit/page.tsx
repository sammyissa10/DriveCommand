import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDriver } from '@/app/(owner)/actions/drivers';
import { EditDriverClient } from './edit-driver-client';

interface EditDriverPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDriverPage({ params }: EditDriverPageProps) {
  const { id } = await params;
  const driver = await getDriver(id);

  if (!driver) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/drivers/${id}`}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back to Driver
        </Link>
        <h1 className="text-3xl font-bold">Edit Driver</h1>
      </div>

      {/* Edit Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <EditDriverClient
          driverId={id}
          initialData={{
            firstName: driver.firstName || '',
            lastName: driver.lastName || '',
            licenseNumber: driver.licenseNumber || '',
          }}
        />
      </div>
    </div>
  );
}
