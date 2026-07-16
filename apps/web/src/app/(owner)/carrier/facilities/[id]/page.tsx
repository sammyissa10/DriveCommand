import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getFacility } from '@/lib/carrier/facilities';
import { FacilityForm } from '@/components/carrier/facilities/FacilityForm';
import { DeleteFacilityButton } from './DeleteFacilityButton';
import { FacilityEditMobile, type FacilityContact } from './FacilityEditMobile';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FacilityDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const [facility, facilityAudit] = await Promise.all([
    getFacility(session.tenantId, id),
    prisma.carrierFacility.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);

  if (!facility) notFound();

  const contacts: FacilityContact[] = Array.isArray(facility.contacts)
    ? (facility.contacts as Array<Partial<FacilityContact>>).map((c) => ({
        name: c?.name ?? '',
        phone: c?.phone ?? '',
        email: c?.email ?? '',
        role: c?.role ?? '',
      }))
    : [];

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <FacilityEditMobile
          initial={{
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
            lumperRequired: facility.lumperRequired,
            appointmentRequired: facility.appointmentRequired,
            contacts,
            notes: facility.notes,
          }}
        />
      </div>

      {/* Desktop form (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
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

      {facilityAudit && (
        <AuditTrailFooter
          createdAt={facilityAudit.createdAt}
          createdByName={facilityAudit.createdBy ? `${facilityAudit.createdBy.firstName ?? ''} ${facilityAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={facilityAudit.createdBy?.email ?? null}
          updatedAt={facilityAudit.updatedAt}
          updatedByName={facilityAudit.updatedBy ? `${facilityAudit.updatedBy.firstName ?? ''} ${facilityAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={facilityAudit.updatedBy?.email ?? null}
        />
      )}
      </div>
    </>
  );
}
