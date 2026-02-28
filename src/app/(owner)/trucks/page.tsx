import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listTrucks, deleteTruck } from '@/app/(owner)/actions/trucks';
import { TruckListWrapper } from './truck-list-wrapper';

export default async function TrucksPage() {
  const trucks = await listTrucks().catch(() => []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Trucks</h1>
          <p className="mt-1 text-muted-foreground">{trucks.length} vehicle{trucks.length !== 1 ? 's' : ''} in your fleet</p>
        </div>
        <Link
          href="/trucks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Truck
        </Link>
      </div>

      <TruckListWrapper initialTrucks={trucks} deleteAction={deleteTruck} />
    </div>
  );
}
