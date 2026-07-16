import { redirect } from 'next/navigation';
import { Warehouse } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { hasPermission } from '@/lib/auth/permissions';
import { listFacilities } from '@/lib/carrier/facilities';
import { facilityTypeLabel, facilityTypeTone } from '@/lib/carrier/facility-type';
import { FacilitiesGrid } from './_grid/FacilitiesGrid';
import { FacilitiesMobile, type FacilityMobileRow } from './FacilitiesMobile';

type FacilityItem = Awaited<ReturnType<typeof listFacilities>>['items'][number];

interface FacilityContact {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
}

function firstContactName(f: FacilityItem): string | null {
  if (Array.isArray(f.contacts)) {
    const named = (f.contacts as FacilityContact[]).find((c) => c?.name?.trim());
    if (named?.name) return named.name.trim();
  }
  return f.contactName?.trim() || null;
}

/** "City, ST" → "City" → "ST" → address line → null. Never a generic placeholder. */
function facilityLocation(f: FacilityItem): string | null {
  if (f.city && f.state) return `${f.city}, ${f.state}`;
  return f.city || f.state || f.addressLine1 || null;
}

/** Contact and/or the dock requirements a dispatcher needs to see at a glance. */
function facilityMeta(f: FacilityItem): string | null {
  const flags: string[] = [];
  if (f.appointmentRequired) flags.push('Appointment');
  if (f.lumperRequired) flags.push('Lumper');
  return [firstContactName(f), ...flags].filter(Boolean).join(' · ') || null;
}

export default async function FacilitiesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  const canCreate = hasPermission(session.permissions ?? null, 'facilities', session.role);

  let items: FacilityItem[] = [];
  let total = 0;

  try {
    const result = await listFacilities(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by facilityType (desktop stat row).
  const typeCounts: Record<string, number> = {};
  for (const f of items) {
    const t = f.facilityType ?? 'unknown';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  // Server-side derivation for the mobile-web rows (no client type logic).
  const mobileFacilities: FacilityMobileRow[] = items.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.facilityType ?? '',
    typeLabel: facilityTypeLabel(f.facilityType),
    tone: facilityTypeTone(f.facilityType),
    location: facilityLocation(f),
    meta: facilityMeta(f),
  }));

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <FacilitiesMobile facilities={mobileFacilities} canCreate={canCreate} />
      </div>

      {/* Desktop grid (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
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
              <Warehouse className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-medium">{total}</span>
              <span className="text-muted-foreground">total</span>
            </div>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div
                key={type}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{count}</span>
                <span className="text-muted-foreground capitalize">
                  {type.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}

        <FacilitiesGrid
          facilities={items.map((f) => ({
            id: f.id,
            name: f.name,
            facilityType: f.facilityType,
            city: f.city,
            state: f.state,
            contactName: f.contactName,
            contacts: Array.isArray(f.contacts)
              ? (f.contacts as Array<{ name: string; phone?: string; email?: string; role?: string }>)
              : [],
            notes: f.notes,
          }))}
        />
      </div>
    </>
  );
}
