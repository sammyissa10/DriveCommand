'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StopTimelineCard } from './StopTimelineCard';
import { TripAddStopModal } from './TripAddStopModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopItem {
  id: string;
  sequenceOrder: number;
  stopType: string;
  facilityId: string;
  appointmentStart: string | null;
  appointmentEnd: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
  status: string;
  skipReason: string | null;
  bolNumber: string | null;
  podNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  specialInstructions: string | null;
  notes: string | null;
}

interface StopTimelineProps {
  stops: StopItem[];
  routeTemplateStopMap: Record<number, { bolRequired: boolean; podRequired: boolean }>;
  stopDocCounts: Record<string, { bolCount: number; podCount: number }>;
  facilityMap: Record<string, { name: string; addressLine1: string | null; city: string | null; state: string | null }>;
  dispatchId: string;
  dispatchStatus: string;
  userRole: string;
  canManage: boolean;
  messageCountMap?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopTimeline({
  stops,
  routeTemplateStopMap,
  stopDocCounts,
  facilityMap,
  dispatchId,
  dispatchStatus,
  userRole,
  canManage,
  messageCountMap,
}: StopTimelineProps) {
  const [addStopOpen, setAddStopOpen] = useState(false);

  // Allow adding stops when trip is planned or in_progress
  const canAddStop = canManage && (dispatchStatus === 'planned' || dispatchStatus === 'in_progress');

  if (stops.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No stops added to this trip yet.
        </div>
        {canAddStop && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddStopOpen(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Stop
            </Button>
            <TripAddStopModal
              open={addStopOpen}
              onOpenChange={setAddStopOpen}
              dispatchId={dispatchId}
              dispatchStatus={dispatchStatus}
              currentStopCount={0}
            />
          </>
        )}
      </div>
    );
  }

  // stops are already ordered by sequenceOrder ASC from getDispatch — do NOT re-sort
  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-border" aria-hidden="true" />

        <div className="space-y-4">
          {stops.map((stop) => {
            const templateStop = routeTemplateStopMap[stop.sequenceOrder];
            const bolRequired = templateStop?.bolRequired ?? false;
            const podRequired = templateStop?.podRequired ?? false;
            const docCounts = stopDocCounts[stop.id] ?? { bolCount: 0, podCount: 0 };

            return (
              <StopTimelineCard
                key={stop.id}
                stop={stop}
                sequenceNumber={stop.sequenceOrder}
                bolRequired={bolRequired}
                podRequired={podRequired}
                bolUploaded={docCounts.bolCount > 0}
                podUploaded={docCounts.podCount > 0}
                facility={facilityMap[stop.facilityId] ?? null}
                dispatchStatus={dispatchStatus}
                userRole={userRole}
                canManage={canManage}
                messageCount={messageCountMap?.[stop.id] ?? 0}
                docCount={docCounts.bolCount + docCounts.podCount}
              />
            );
          })}
        </div>
      </div>

      {/* Add Stop button */}
      {canAddStop && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddStopOpen(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Stop
        </Button>
      )}

      {/* Add Stop Modal */}
      <TripAddStopModal
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        dispatchId={dispatchId}
        dispatchStatus={dispatchStatus}
        currentStopCount={stops.length}
      />
    </div>
  );
}
