import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listFacilities } from '@/lib/carrier/facilities';
import { CarrierDriverForm } from '@/components/carrier/fleet/CarrierDriverForm';

export default async function NewCarrierDriverPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  const facilitiesResult = await listFacilities(orgId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/carrier/fleet/drivers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Carrier Drivers
        </Link>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          New Driver
        </h1>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <CarrierDriverForm
          facilities={facilitiesResult.items.map((f) => ({ id: f.id, name: f.name }))}
        />
      </div>
    </div>
  );
}
