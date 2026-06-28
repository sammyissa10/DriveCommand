/**
 * Truck quick-create page — rebuilt on the design system.
 *
 * Features:
 * - Three sections: Identity / Weight & Capacity / Registration & Compliance
 * - VIN lookup action that auto-fills Year/Make/Model
 * - Completeness indicator (optional/dismissible)
 * - Progressive form — only required fields enforced, rest optional
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createTruck } from '@/app/(owner)/actions/trucks';
import { TruckCreateForm } from './_components/TruckCreateForm';

export default function NewTruckPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Trucks
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Add New Truck
        </h1>
        <p className="mt-1 text-muted-foreground">
          Enter the vehicle details below. Fields marked with * are required.
        </p>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <TruckCreateForm action={createTruck} />
      </div>
    </div>
  );
}
