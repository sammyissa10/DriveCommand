import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FacilityForm } from '@/components/carrier/facilities/FacilityForm';

export default function NewFacilityPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/carrier/facilities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Facilities
        </Link>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          New Facility
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new facility to your carrier network.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <FacilityForm />
      </div>
    </div>
  );
}
