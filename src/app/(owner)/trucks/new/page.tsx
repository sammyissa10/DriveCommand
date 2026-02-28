import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TruckForm } from '@/components/trucks/truck-form';
import { createTruck } from '@/app/(owner)/actions/trucks';

export default function NewTruckPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Trucks
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Add New Truck</h1>
        <p className="mt-1 text-muted-foreground">Enter the vehicle details below</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <TruckForm action={createTruck} submitLabel="Create Truck" />
      </div>
    </div>
  );
}
