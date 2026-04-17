'use client';

import { DriverDispatchCard } from './driver-dispatch-card';
import { DriverQuickActions } from './driver-quick-actions';
import { DriverHosWidget } from './driver-hos-widget';
import { DriverMessagesPreview } from './driver-messages-preview';
import { DriverGpsPing } from './driver-gps-ping';

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

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DriverDashboard({ firstName, dispatch, hos, recentMessages }: DriverDashboardProps) {
  const greeting = firstName
    ? `${getTimeGreeting()}, ${firstName}.`
    : `${getTimeGreeting()}.`;

  return (
    <div className="max-w-lg mx-auto space-y-5 px-0">
      {/* Header row: greeting + GPS indicator */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground leading-snug">{greeting}</h1>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <DriverGpsPing />
        </div>
      </div>

      {/* Active dispatch card */}
      <DriverDispatchCard dispatch={dispatch} />

      {/* Quick action tiles */}
      <DriverQuickActions />

      {/* HOS widget */}
      <DriverHosWidget hos={hos} />

      {/* Recent messages preview */}
      <DriverMessagesPreview messages={recentMessages} />
    </div>
  );
}
