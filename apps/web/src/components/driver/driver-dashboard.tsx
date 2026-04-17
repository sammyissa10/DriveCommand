'use client';

import { useEffect, useState } from 'react';
import { DriverDispatchCard } from './driver-dispatch-card';
import { DriverQuickActions } from './driver-quick-actions';
import { DriverHosWidget } from './driver-hos-widget';
import { DriverMessagesPreview } from './driver-messages-preview';
import { DriverGpsPing } from './driver-gps-ping';
import { startTrip } from '@/app/(driver)/actions/driver-routes';

// Types derived from getMyActiveDispatch and getDriverHOS return shapes
interface DispatchStop {
  id: string;
  status: string;
  sequenceOrder: number;
  scheduledArrival?: string | Date | null;
  facility?: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    latitude?: number | null;
    longitude?: number | null;
    addressLine1?: string | null;
  } | null;
}

interface DispatchData {
  id: string;
  status: string;
  scheduledDeparture?: string | Date | null;
  truck?: {
    id: string;
    unitNumber: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  stops?: DispatchStop[];
}

interface HosData {
  currentStatus: 'DRIVING' | 'ON_DUTY' | 'SLEEPER_BERTH' | 'OFF_DUTY';
  onDutyHoursUsed: number;
  drivingHoursUsed?: number;
  drivingHoursRemaining?: number;
  onDutyHoursRemaining?: number;
}

interface MessagePreview {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

interface DriverDashboardProps {
  firstName?: string;
  dispatch: DispatchData | null;
  hos: HosData | null;
  recentMessages: MessagePreview[];
}

export function DriverDashboard({ firstName, dispatch, hos, recentMessages }: DriverDashboardProps) {
  // Greeting is deferred to client to avoid hydration mismatch: server renders UTC hours,
  // client renders local hours — different values cause React error #418.
  const [greeting, setGreeting] = useState('Hello');

  useEffect(() => {
    const hour = new Date().getHours();
    const salutation =
      hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
    setGreeting(firstName ? `${salutation}, ${firstName}.` : `${salutation}.`);
  }, [firstName]);

  return (
    <div className="max-w-lg mx-auto space-y-5 px-0">
      {/* Header row: greeting + GPS indicator */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground leading-snug min-h-[1.75rem]">{greeting}</h1>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <DriverGpsPing />
        </div>
      </div>

      {/* Active dispatch card */}
      <DriverDispatchCard dispatch={dispatch} startAction={startTrip} />

      {/* Quick action tiles */}
      <DriverQuickActions />

      {/* HOS widget */}
      <DriverHosWidget hos={hos} />

      {/* Recent messages preview */}
      <DriverMessagesPreview messages={recentMessages} />
    </div>
  );
}
