import { Suspense } from 'react';
import { prisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/supabase';
import { redirect } from 'next/navigation';
import { RecentlyDeletedGrid } from './RecentlyDeletedGrid';
import type { SoftDeletableEntity } from '@/lib/carrier/soft-delete';

export const metadata = {
  title: 'Recently Deleted | DriveCommand',
};

interface DeletedItem {
  id: string;
  entityType: SoftDeletableEntity;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
}

async function getDeletedItems(orgId: string): Promise<DeletedItem[]> {
  const items: DeletedItem[] = [];

  // Fetch soft-deleted records from all entity types
  const [clients, contracts, drivers, trucks, routes, trips, loads, facilities] = await Promise.all([
    prisma.carrierClient.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierContract.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, contractNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, firstName: true, lastName: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, unitNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.route.findMany({
      where: { tenantId: orgId, deletedAt: { not: null } },
      select: { id: true, name: true, origin: true, destination: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.trip.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, scheduledDeparture: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierLoad.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, referenceNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    // Facilities became listable here in quick-534, which is what the
    // `deleted_by_id` DDL was for: this `deletedBy` select is the reason the
    // column had to exist. Before it, a deleted facility was recoverable only
    // inside the 8-second Undo toast — after that, raw SQL.
    //
    // No driver-residence filter, deliberately. This page is scoped to one
    // tenant's own deleted rows and exists to undo a mistake; hiding a
    // residence here would mean an owner who deleted one could never get it
    // back. The residence mask belongs on pickers and itineraries.
    prisma.carrierFacility.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
  ]);

  clients.forEach(c => items.push({
    id: c.id,
    entityType: 'CarrierClient',
    name: c.name,
    deletedAt: c.deletedAt!,
    deletedBy: c.deletedBy?.email ?? null,
  }));

  contracts.forEach(c => items.push({
    id: c.id,
    entityType: 'CarrierContract',
    name: c.contractNumber,
    deletedAt: c.deletedAt!,
    deletedBy: c.deletedBy?.email ?? null,
  }));

  drivers.forEach(d => items.push({
    id: d.id,
    entityType: 'CarrierDriver',
    name: `${d.firstName} ${d.lastName}`,
    deletedAt: d.deletedAt!,
    deletedBy: d.deletedBy?.email ?? null,
  }));

  trucks.forEach(t => items.push({
    id: t.id,
    entityType: 'CarrierTruck',
    name: t.unitNumber,
    deletedAt: t.deletedAt!,
    deletedBy: t.deletedBy?.email ?? null,
  }));

  routes.forEach(r => items.push({
    id: r.id,
    entityType: 'Route',
    name: r.name ?? `${r.origin} → ${r.destination}`,
    deletedAt: r.deletedAt!,
    deletedBy: r.deletedBy?.email ?? null,
  }));

  trips.forEach(t => items.push({
    id: t.id,
    entityType: 'Trip',
    name: `Trip ${t.scheduledDeparture.toLocaleDateString()}`,
    deletedAt: t.deletedAt!,
    deletedBy: t.deletedBy?.email ?? null,
  }));

  loads.forEach(l => items.push({
    id: l.id,
    entityType: 'CarrierLoad',
    name: l.referenceNumber ?? `Load ${l.id.slice(0, 8)}`,
    deletedAt: l.deletedAt!,
    deletedBy: l.deletedBy?.email ?? null,
  }));

  facilities.forEach(f => items.push({
    id: f.id,
    entityType: 'CarrierFacility',
    name: f.name,
    deletedAt: f.deletedAt!,
    deletedBy: f.deletedBy?.email ?? null,
  }));

  // Sort by deletedAt descending (most recent first)
  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

export default async function RecentlyDeletedPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const items = await getDeletedItems(session.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recently Deleted</h1>
        <p className="text-muted-foreground">
          Items here will be automatically purged after 30 days. You can restore them anytime before then.
        </p>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <RecentlyDeletedGrid items={items} />
      </Suspense>
    </div>
  );
}
