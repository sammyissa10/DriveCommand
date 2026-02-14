import Link from 'next/link';
import { listDrivers, deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { DriverListWrapper } from './driver-list-wrapper';

export default async function DriversPage() {
  const drivers = await listDrivers();

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Drivers</h1>
        <Link
          href="/drivers/invite"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
        >
          Invite Driver
        </Link>
      </div>

      {/* Driver List */}
      <DriverListWrapper
        initialDrivers={drivers}
        deactivateAction={deactivateDriver}
        reactivateAction={reactivateDriver}
      />
    </div>
  );
}
