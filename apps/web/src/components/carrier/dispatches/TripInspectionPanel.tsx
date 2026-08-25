'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Clock,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { InspectionGateView } from '@/lib/carrier/inspection-handlers';

interface Props {
  dispatchId: string;
  /** OWNER or MANAGER — anyone else sees the state but no override control. */
  canOverride: boolean;
  overrideReasonMinLength: number;
}

/**
 * The inspection state of a trip, plus the owner override — Phase 9 items 4/5.
 *
 * Rendered on trip detail on both the desktop layout and the mobile-web one, so
 * an override is available from wherever the owner actually is when the driver
 * calls. It reads `GET .../inspection`, which is a pure read: looking at a trip
 * must never move the gate.
 *
 * Design rules, Section 15. Red appears here for exactly one thing — a failed
 * item — and nowhere else. The override control is neutral, not destructive
 * styling: it is a decision an owner is entitled to make, and the record it
 * leaves is the safeguard, not the colour of the button.
 *
 * DialogContent is a GRID with `auto` tracks, so a long item name in a truncated
 * chip would size the whole dialog past its own max-width and produce both a
 * horizontal scrollbar and an apparently-clipped header (quick-519). The
 * explicit zero-minimum track below is the fix, applied on this consumer and
 * never on the shared `ui/dialog.tsx` primitive.
 */
export function TripInspectionPanel({ dispatchId, canOverride, overrideReasonMinLength }: Props) {
  const router = useRouter();
  const [gate, setGate] = useState<InspectionGateView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/carrier/dispatches/${dispatchId}/inspection`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json()) as { data: InspectionGateView };
      setGate(body.data);
    } catch (err) {
      // Named, not swallowed. A panel that fails silently reads as "no
      // inspection required", which is the most dangerous thing it could imply.
      setLoadError(err instanceof Error ? err.message : 'Could not load inspection status');
    } finally {
      setIsLoading(false);
    }
  }, [dispatchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length < overrideReasonMinLength;

  async function handleOverride() {
    if (reasonTooShort) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/carrier/dispatches/${dispatchId}/inspection/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: InspectionGateView;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      if (body.data) setGate(body.data);
      setDialogOpen(false);
      setReason('');
      toast.success('Override recorded on this trip.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the override');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Pre-trip inspection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking inspection status…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError || !gate) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Pre-trip inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{loadError ?? 'Status unavailable.'}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const blocked = gate.outcome === 'BLOCKED';
  const alreadyOverridden = gate.outcome === 'OWNER_OVERRIDE';

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <StatusIcon outcome={gate.outcome} />
          <span className="min-w-0">Pre-trip inspection</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status = colour + icon + text, per Section 15 — never colour alone. */}
        <p className={blocked ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {gate.message}
        </p>

        {gate.failures.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What failed</p>
            <ul className="space-y-2">
              {gate.failures.map((f) => (
                <li
                  key={f.stepInstanceId}
                  className="rounded-lg bg-muted/60 px-3 py-2 min-w-0"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {f.isCritical ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground break-words">
                        {f.isCritical ? `${f.name} — critical` : f.name}
                      </p>
                      {f.note && (
                        <p className="text-sm text-muted-foreground break-words mt-0.5">
                          {f.note}
                        </p>
                      )}
                      {f.photoCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {f.photoCount === 1 ? '1 photo attached' : `${f.photoCount} photos attached`}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* An override is permanent and is shown as such, on every visit, forever. */}
        {alreadyOverridden && gate.override && (
          <div className="rounded-lg bg-muted/60 px-3 py-2 min-w-0">
            <p className="text-sm font-medium text-foreground">Inspection overridden</p>
            <p className="text-sm text-muted-foreground break-words mt-0.5">
              {gate.override.reason}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {gate.override.byName ?? 'A manager'} · {formatWhen(gate.override.at)}
            </p>
          </div>
        )}

        {canOverride && !alreadyOverridden && gate.outcome !== 'NOT_REQUIRED' && (
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Override inspection
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Lets this trip start without a passing inspection. Your reason is kept on the
              trip permanently and appears in reports.
            </p>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* grid-cols-[minmax(0,1fr)]: an explicit zero-minimum track. Without it a
            long item name makes the dialog wider than its own max-w and the
            header appears to clip — quick-519, two symptoms, one cause. */}
        <DialogContent className="sm:max-w-lg grid-cols-[minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>Override the inspection</DialogTitle>
            <DialogDescription>
              This trip will be allowed to start. Your name, your reason and the time are
              recorded on the trip permanently.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 min-w-0">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this trip safe to start? e.g. Mechanic replaced the marker lamp on site at 05:10."
              rows={4}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {reasonTooShort
                ? `At least ${overrideReasonMinLength} characters.`
                : 'This is the permanent record of why the trip went out.'}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleOverride()} disabled={reasonTooShort || isSubmitting}>
              {isSubmitting ? 'Recording…' : 'Record override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusIcon({ outcome }: { outcome: InspectionGateView['outcome'] }) {
  switch (outcome) {
    case 'BLOCKED':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />;
    case 'INSPECTION_REQUIRED':
      return <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case 'OWNER_OVERRIDE':
      return <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />;
    default:
      return <Check className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
