import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { listDrivers, deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { DriverListWrapper } from './driver-list-wrapper';

export default async function DriversPage() {
  const drivers = await listDrivers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Drivers</h1>
          <p className="mt-1 text-muted-foreground">{drivers.length} driver{drivers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <Link
          href="/drivers/invite"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite Driver
        </Link>
      </div>

      <DriverListWrapper
        initialDrivers={drivers}
        deactivateAction={deactivateDriver}
        reactivateAction={reactivateDriver}
      />
    </div>
  );
}
