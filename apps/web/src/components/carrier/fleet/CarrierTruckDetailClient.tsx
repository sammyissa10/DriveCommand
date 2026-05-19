'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CarrierTruckDetailsView } from './CarrierTruckDetailsView';
import { CarrierTruckForm, type CarrierTruckData } from './CarrierTruckForm';

interface CarrierTruckDetailClientProps {
  truck: CarrierTruckData;
  photoS3Key?: string | null;
}

export function CarrierTruckDetailClient({ truck, photoS3Key }: CarrierTruckDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);

  function handleSuccess() {
    router.refresh();
    setMode('view');
  }

  function handleCancel() {
    setMode('view');
  }

  // Merge photoS3Key into the truck object for the view component
  const truckWithPhoto = { ...truck, photoS3Key: photoS3Key ?? null };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Truck Details</h2>
        {mode === 'view' ? (
          <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      {mode === 'view' ? (
        <CarrierTruckDetailsView truck={truckWithPhoto} />
      ) : (
        <CarrierTruckForm truck={truck} onSuccess={handleSuccess} onCancel={handleCancel} />
      )}
    </div>
  );
}
