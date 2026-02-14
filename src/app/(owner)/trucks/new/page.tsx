'use client';

import Link from 'next/link';
import { TruckForm } from '@/components/trucks/truck-form';
import { createTruck } from '@/app/(owner)/actions/trucks';

export default function NewTruckPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/trucks" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
          ← Back to Trucks
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Add New Truck</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <TruckForm action={createTruck} submitLabel="Create Truck" />
      </div>
    </div>
  );
}
