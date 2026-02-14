import Link from 'next/link';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { NewRouteClient } from './new-route-client';

export default async function NewRoutePage() {
  const prisma = await getTenantPrisma();

  // Fetch active drivers
  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  // Fetch all trucks
  const trucks = await prisma.truck.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      licensePlate: true,
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex items-center space-x-4">
        <Link
          href="/routes"
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Routes
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Create Route</h1>

      {/* Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <NewRouteClient drivers={drivers} trucks={trucks} />
      </div>
    </div>
  );
}
