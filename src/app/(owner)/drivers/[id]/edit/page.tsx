import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getDriver } from '@/app/(owner)/actions/drivers';
import { EditDriverClient } from './edit-driver-client';

interface EditDriverPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDriverPage({ params }: EditDriverPageProps) {
  const { id } = await params;
  const driver = await getDriver(id);

  if (!driver) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/drivers/${id}`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Driver
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Driver</h1>
        <p className="mt-1 text-muted-foreground">Update driver information</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <EditDriverClient
          driverId={id}
          initialData={{
            firstName: driver.firstName || '',
            lastName: driver.lastName || '',
            licenseNumber: driver.licenseNumber || '',
          }}
        />
      </div>
    </div>
  );
}
