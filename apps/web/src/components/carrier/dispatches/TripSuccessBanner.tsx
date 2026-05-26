'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, MapPin, Play, X, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TripSuccessBannerProps {
  dispatchId: string;
  dispatchNumber: string;
  dispatchStatus: string;
  hasStops: boolean;
  driverName: string;
  driverUserId: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TripSuccessBanner({
  dispatchId,
  dispatchNumber,
  dispatchStatus,
  hasStops,
  driverName,
  driverUserId,
}: TripSuccessBannerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const showSuccess = searchParams.get('showSuccess') === 'true';
  const isNew = searchParams.get('isNew') === 'true';

  const [visible, setVisible] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);

  // Animation state
  const [animateIn, setAnimateIn] = useState(false);

  // Show banner on mount if URL params indicate success
  useEffect(() => {
    if (showSuccess) {
      setVisible(true);
      // Trigger animation after mount
      requestAnimationFrame(() => {
        setAnimateIn(true);
      });

      // Clear URL params without navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('showSuccess');
      url.searchParams.delete('isNew');
      window.history.replaceState({}, '', url.toString());
    }
  }, [showSuccess]);

  function handleDismiss() {
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
  }

  async function handleStartTrip() {
    setStartingTrip(true);
    try {
      const res = await fetch(`/api/v1/carrier/dispatches/${dispatchId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to start trip');
      }

      toast.success(`Trip ${dispatchNumber} started! ${driverName} has been notified.`);
      setShowStartConfirm(false);
      handleDismiss();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start trip');
    } finally {
      setStartingTrip(false);
    }
  }

  if (!visible) return null;

  const canStart = dispatchStatus === 'planned' && hasStops;
  const needsStops = !hasStops;

  return (
    <>
      <div
        className={`
          relative overflow-hidden rounded-lg border
          ${isNew ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'}
          transition-all duration-300 ease-out
          ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        `}
      >
        {/* Success animation bar */}
        <div
          className={`absolute top-0 left-0 h-1 ${isNew ? 'bg-green-500' : 'bg-blue-500'} transition-all duration-1000 ease-out`}
          style={{ width: animateIn ? '100%' : '0%' }}
        />

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Success icon with pulse animation */}
            <div className={`
              flex-shrink-0 p-2 rounded-full
              ${isNew ? 'bg-green-100 dark:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/50'}
              ${animateIn ? 'animate-bounce-once' : ''}
            `}>
              <CheckCircle2 className={`h-5 w-5 ${isNew ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-semibold ${isNew ? 'text-green-800 dark:text-green-200' : 'text-blue-800 dark:text-blue-200'}`}>
                {isNew ? 'Trip Created Successfully!' : 'Load Added to Trip!'}
              </h3>
              <p className={`mt-0.5 text-sm ${isNew ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}`}>
                {isNew
                  ? `Trip ${dispatchNumber} has been created and the load is attached.`
                  : `The load has been added to trip ${dispatchNumber}.`}
              </p>

              {/* Next steps prompt */}
              <div className="mt-3 space-y-2">
                {needsStops && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                    <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-700 dark:text-amber-300">
                      No stops yet — add pickup and delivery stops to complete the trip
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {canStart && (
                    <Button
                      size="sm"
                      onClick={() => setShowStartConfirm(true)}
                      className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start Trip
                    </Button>
                  )}

                  {needsStops && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleDismiss();
                        // Scroll to stop timeline
                        document.getElementById('stop-timeline')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="gap-1.5"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Add Stops
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className={`
                p-1.5 rounded-md transition-colors shrink-0
                ${isNew
                  ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50'
                  : 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50'}
              `}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Start Trip Confirmation Dialog */}
      <AlertDialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              Start Trip {dispatchNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will change the trip status to <span className="font-medium text-foreground">In Transit</span> and notify the driver.
              </p>
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 flex items-start gap-2">
                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium">{driverName} will be notified</p>
                  <p className="text-blue-600 dark:text-blue-400 mt-0.5">
                    A push notification and in-app alert will be sent to the driver.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={startingTrip}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartTrip}
              disabled={startingTrip}
              className="bg-green-600 hover:bg-green-700"
            >
              {startingTrip ? 'Starting...' : 'Start Trip & Notify Driver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSS for bounce animation */}
      <style jsx global>{`
        @keyframes bounce-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-out;
        }
      `}</style>
    </>
  );
}
