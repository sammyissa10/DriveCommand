import { redirect } from 'next/navigation';
import { Warehouse } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listFacilities } from '@/lib/carrier/facilities';
import { FacilityList } from '@/components/carrier/facilities/FacilityList';

export default async function FacilitiesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listFacilities>>['items'] = [];
  let total = 0;

  try {
    const result = await listFacilities(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by facilityType
  const typeCounts: Record<string, number> = {};
  for (const f of items) {
    const t = f.facilityType ?? 'unknown';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Facilities
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {items.length} of {total} facilit{total !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>

      {/* Stat row */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(typeCounts).map(([type, count]) => (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-semibold">{count}</span>
              <span className="text-muted-foreground capitalize">
                {type.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      <FacilityList
        facilities={items.map((f) => ({
          id: f.id,
          name: f.name,
          facilityType: f.facilityType,
          city: f.city,
          state: f.state,
          contactName: f.contactName,
          notes: f.notes,
        }))}
      />
    </div>
  );
}
