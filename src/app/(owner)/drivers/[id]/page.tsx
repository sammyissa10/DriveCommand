import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDriver } from '@/app/(owner)/actions/drivers';

interface DriverDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverDetailPage({ params }: DriverDetailPageProps) {
  const { id } = await params;
  const driver = await getDriver(id);

  if (!driver) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/drivers"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Drivers
          </Link>
          <h1 className="text-3xl font-bold">
            {driver.firstName} {driver.lastName}
          </h1>
        </div>
        <Link
          href={`/drivers/${id}/edit`}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
        >
          Edit
        </Link>
      </div>

      {/* Driver Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Driver Information</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email */}
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Email</dt>
            <dd className="text-base">{driver.email}</dd>
          </div>

          {/* License Number */}
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">License Number</dt>
            <dd className="text-base">{driver.licenseNumber || 'Not provided'}</dd>
          </div>

          {/* Status */}
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Status</dt>
            <dd>
              {driver.isActive ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Deactivated
                </span>
              )}
            </dd>
          </div>

          {/* Member Since */}
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Member Since</dt>
            <dd className="text-base">
              {new Date(driver.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>

          {/* Last Updated */}
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Last Updated</dt>
            <dd className="text-base">
              {new Date(driver.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
}
