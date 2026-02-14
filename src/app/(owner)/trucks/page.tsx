import Link from 'next/link';
import { listTrucks, deleteTruck } from '@/app/(owner)/actions/trucks';
import { TruckListWrapper } from './truck-list-wrapper';

export default async function TrucksPage() {
  const trucks = await listTrucks();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Trucks</h1>
        <Link
          href="/trucks/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
        >
          Add Truck
        </Link>
      </div>

      <TruckListWrapper initialTrucks={trucks} deleteAction={deleteTruck} />
    </div>
  );
}
