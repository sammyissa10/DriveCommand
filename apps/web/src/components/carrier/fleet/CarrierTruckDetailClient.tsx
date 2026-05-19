'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CarrierTruckDetailsView } from './CarrierTruckDetailsView';
import { CarrierTruckForm, type CarrierTruckData } from './CarrierTruckForm';

interface CarrierTruckDetailClientProps {
  truck: CarrierTruckData;
}

export function CarrierTruckDetailClient({ truck }: CarrierTruckDetailClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  function handleSuccess() {
    router.refresh();
    setMode('view');
  }

  function handleCancel() {
    setMode('view');
  }

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
        <CarrierTruckDetailsView truck={truck} />
      ) : (
        <CarrierTruckForm truck={truck} onSuccess={handleSuccess} onCancel={handleCancel} />
      )}
    </div>
  );
}
