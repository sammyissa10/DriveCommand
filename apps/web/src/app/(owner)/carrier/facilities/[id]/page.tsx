import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getFacility } from '@/lib/carrier/facilities';
import { FacilityForm } from '@/components/carrier/facilities/FacilityForm';
import { DeleteFacilityButton } from './DeleteFacilityButton';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FacilityDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const facility = await getFacility(session.tenantId, id);

  if (!facility) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/carrier/facilities"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Facilities
          </Link>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {facility.name}
          </h1>
          {facility.city && facility.state && (
            <p className="mt-1 text-sm text-muted-foreground">
              {facility.city}, {facility.state}
            </p>
          )}
        </div>
        <DeleteFacilityButton facilityId={facility.id} facilityName={facility.name} />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <FacilityForm
          initialData={{
            id: facility.id,
            name: facility.name,
            facilityType: facility.facilityType,
            addressLine1: facility.addressLine1,
            addressLine2: facility.addressLine2,
            city: facility.city,
            state: facility.state,
            zip: facility.zip,
            country: facility.country,
            latitude: facility.latitude ? Number(facility.latitude) : null,
            longitude: facility.longitude ? Number(facility.longitude) : null,
            contactName: facility.contactName,
            contactPhone: facility.contactPhone,
            contactEmail: facility.contactEmail,
            lumperRequired: facility.lumperRequired,
            appointmentRequired: facility.appointmentRequired,
            contacts: Array.isArray(facility.contacts)
              ? (facility.contacts as Array<{ name: string; phone: string; email: string; role: string }>)
              : [],
            notes: facility.notes,
          }}
        />
      </div>
    </div>
  );
}
