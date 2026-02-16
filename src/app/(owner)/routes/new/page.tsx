import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="space-y-6">
      <div>
        <Link
          href="/routes"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Routes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Route</h1>
        <p className="mt-1 text-muted-foreground">Set up a new delivery route</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <NewRouteClient drivers={drivers} trucks={trucks} />
      </div>
    </div>
  );
}
