'use client';

import { GripVertical, MapPin, Package, Clock, CheckCircle, AlertCircle, XCircle, Truck } from 'lucide-react';
import type { StopForEditor } from './TripPlanEditor';

interface StopCardProps {
  stop: StopForEditor;
  index: number;
  isEditable: boolean;
}

const STOP_TYPE_LABELS: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel',
  layover: 'Layover',
};

const STOP_TYPE_COLORS: Record<string, string> = {
  pickup: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  delivery: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  fuel_stop: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  layover: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  arrived: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  skipped: <XCircle className="h-4 w-4 text-red-500" />,
};

export function StopCard({ stop, index, isEditable }: StopCardProps) {
  const location = [stop.facilityCity, stop.facilityState].filter(Boolean).join(', ');

  const formatTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const appointmentWindow = stop.appointmentStart || stop.appointmentEnd
    ? `${formatTime(stop.appointmentStart) ?? '?'} - ${formatTime(stop.appointmentEnd) ?? '?'}`
    : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4 shadow-sm">
      {/* Drag handle */}
      {isEditable && (
        <div className="flex-shrink-0 cursor-grab active:cursor-grabbing pt-1">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {/* Sequence number */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
        {index + 1}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Stop type badge */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STOP_TYPE_COLORS[stop.stopType] ?? 'bg-gray-100 text-gray-800'}`}>
                {STOP_TYPE_LABELS[stop.stopType] ?? stop.stopType}
              </span>

              {/* Load reference */}
              {stop.loadRefNumber && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-medium">
                  <Package className="h-3 w-3" />
                  {stop.loadRefNumber}
                </span>
              )}
            </div>

            {/* Facility name */}
            <h4 className="mt-1 text-sm font-medium">{stop.facilityName}</h4>

            {/* Location */}
            {location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {location}
              </p>
            )}

            {/* Client name */}
            {stop.clientName && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Client: {stop.clientName}
              </p>
            )}
          </div>

          {/* Right side: status + appointment */}
          <div className="flex flex-col items-end gap-1">
            {/* Status */}
            <div className="flex items-center gap-1.5" title={`Status: ${stop.status}`}>
              {STATUS_ICONS[stop.status] ?? STATUS_ICONS.pending}
              <span className="text-xs capitalize">{stop.status}</span>
            </div>

            {/* Appointment window */}
            {appointmentWindow && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {appointmentWindow}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
