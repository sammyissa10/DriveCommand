import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { CarrierTruckForm } from '@/components/carrier/fleet/CarrierTruckForm';

export default async function NewCarrierTruckPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/carrier/fleet/trucks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Carrier Trucks
        </Link>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          New Truck
        </h1>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <CarrierTruckForm />
      </div>
    </div>
  );
}
