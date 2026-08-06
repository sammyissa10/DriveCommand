'use client';

/**
 * The facility resolution ladder, on screen (spec Sections 7 and 10).
 *
 * ```
 *  +--------------------------------------------------+
 *  |  Stops                          11 matched · 1 new|
 *  +--------------------------------------------------+
 *  |  1  Russ Darrow Nissan     ok linked        why   |
 *  |  2  Boucher Kia            ok linked        why   |
 *  |  3  Hall Ford              ~ proposed             | <- tap
 *  |  4  Wilde Honda            + new                  | <- tap
 *  +--------------------------------------------------+
 * ```
 *
 * TWO KINDS OF ROW, AND THE DIFFERENCE IS THE POINT. A linked stop is finished:
 * it shows what it linked to and a `why`, and it asks for nothing. A proposed or
 * new stop shows a button, and **nothing happens to it until that button is
 * pressed** — the server will not create a facility from a T3 or a T4 without an
 * explicit POST, and this component never sends one on mount, on focus, or on
 * expand. Spec Section 7 calls a polluted facility table unrecoverable; the UI
 * half of not polluting it is that no affordance here is an accident away from
 * creating something.
 *
 * Design follows spec Section 15 and the components already in this folder: no
 * borders on rows, elevation by surface contrast, one accent on one primary
 * action, 44px targets, status as colour + icon + text rather than colour alone,
 * and red reserved for errors — a "new" badge is not an error, so it is not red.
 */

import { useState } from 'react';
import { Check, Loader2, MapPin, Plus, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  StopResolutionView,
  StopSlotView,
} from '@/lib/document-import/facility-lookup';
import type { FacilityProposal } from '@/lib/document-import/facility-ladder';
import { WhyPopover } from './WhyPopover';

interface Props {
  importId: string;
  view: StopResolutionView;
  onChange: (next: StopResolutionView) => void;
}

export function StopResolutionList({ importId, view, onChange }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  if (view.total === 0) {
    return <p className="text-sm text-muted-foreground">No stops were read from this document.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">
          {view.total} stop{view.total === 1 ? '' : 's'}
        </h3>
        <p className="text-xs text-muted-foreground">{view.note}</p>
      </div>

      <ul className="divide-y divide-border">
        {view.stops.map((stop) => (
          <StopRow
            key={stop.index}
            importId={importId}
            stop={stop}
            isOpen={open === stop.index}
            onToggle={() => setOpen(open === stop.index ? null : stop.index)}
            onResolved={(next) => {
              onChange(next);
              setOpen(null);
            }}
          />
        ))}
      </ul>

      {view.needsReview > 0 ? (
        <p className="text-xs text-muted-foreground">
          {view.needsReview} stop{view.needsReview === 1 ? '' : 's'} need
          {view.needsReview === 1 ? 's' : ''} you to confirm a facility. Nothing is created until
          you do.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StopRow({
  importId,
  stop,
  isOpen,
  onToggle,
  onResolved,
}: {
  importId: string;
  stop: StopSlotView;
  isOpen: boolean;
  onToggle: () => void;
  onResolved: (next: StopResolutionView) => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-sm tabular-nums text-muted-foreground">
          {stop.index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {stop.documentName || 'Unnamed stop'}
            {stop.sourceCode ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {stop.sourceCode}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {stop.state === 'LINKED' && stop.facility
              ? stop.facility.name
              : stop.documentAddress || 'No address on the document'}
          </p>
        </div>

        <StopStatus stop={stop} />

        {stop.state === 'LINKED' ? <WhyPopover why={stop.why} /> : null}

        <Button
          variant={stop.requiresHumanTap ? 'default' : 'ghost'}
          size="sm"
          className="min-h-[44px] shrink-0"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          {stop.requiresHumanTap ? 'Resolve' : 'Change'}
        </Button>
      </div>

      {isOpen ? (
        <div className="mt-3 pl-9">
          <StopDecision importId={importId} stop={stop} onResolved={onResolved} onCancel={onToggle} />
        </div>
      ) : null}
    </li>
  );
}

/** Colour AND icon AND text, per spec Section 15. Never colour alone. */
function StopStatus({ stop }: { stop: StopSlotView }) {
  if (stop.state === 'LINKED') {
    return (
      <Badge variant="success" className="shrink-0 gap-1">
        <Check className="h-3 w-3" />
        Linked
      </Badge>
    );
  }
  if (stop.state === 'PROPOSED') {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Sparkles className="h-3 w-3" />
        Proposed
      </Badge>
    );
  }
  // Not red. A stop the system has never seen before is the ordinary case on a
  // first import, not a failure.
  return (
    <Badge variant="outline" className="shrink-0 gap-1">
      <Plus className="h-3 w-3" />
      New
    </Badge>
  );
}

// ---------------------------------------------------------------------------

/**
 * The tap. Proposals first when there are any, then the pre-filled create form.
 *
 * The create form is present on T3 as well as T4, because "none of these" is a
 * real answer to a list of candidates and a dispatcher who has to back out to
 * find it will pick the closest wrong one instead.
 */
function StopDecision({
  importId,
  stop,
  onResolved,
  onCancel,
}: {
  importId: string;
  stop: StopSlotView;
  onResolved: (next: StopResolutionView) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(stop.proposals.length === 0);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/stops${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not resolve that stop.');
      onResolved(json.data as StopResolutionView);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve that stop.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-4">
      {!creating && stop.proposals.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            Closest {stop.proposals.length === 1 ? 'match' : 'matches'} in your facilities. Nothing
            is linked until you pick one.
          </p>
          <ul className="space-y-2">
            {stop.proposals.map((p) => (
              <ProposalRow
                key={p.facilityId}
                proposal={p}
                disabled={busy}
                onPick={() => void post('', { stopIndex: stop.index, facilityId: p.facilityId })}
              />
            ))}
          </ul>
        </>
      ) : null}

      {creating ? (
        <CreateFacilityForm
          stop={stop}
          busy={busy}
          onSubmit={(values) => void post('/facility', { stopIndex: stop.index, ...values })}
        />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {stop.proposals.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setCreating(!creating)}
            disabled={busy}
          >
            {creating ? 'Back to matches' : 'None of these — create a facility'}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProposalRow({
  proposal,
  disabled,
  onPick,
}: {
  proposal: FacilityProposal;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-background p-3">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{proposal.name}</p>
        <p className="truncate text-xs text-muted-foreground">{proposal.address}</p>
        {/* The "show score + diffs" half of spec Section 7. What differs is more
            use to a dispatcher than the number is, so it is not hidden. */}
        {proposal.differences.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {proposal.differences.slice(0, 3).map((d) => (
              <li key={d} className="text-xs text-muted-foreground">
                · {d}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {Math.round(proposal.score * 100)}%
      </span>
      <Button size="sm" className="min-h-[44px] shrink-0" onClick={onPick} disabled={disabled}>
        Link
      </Button>
    </li>
  );
}

/**
 * The pre-filled create form.
 *
 * Only fields the document actually filled are rendered, plus the required name
 * — the standing rule from Phase 3 is never to show a form full of empty boxes,
 * because a dispatcher reads blank fields as work to do.
 */
function CreateFacilityForm({
  stop,
  busy,
  onSubmit,
}: {
  stop: StopSlotView;
  busy: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const prefill = stop.prefill;
  const [values, setValues] = useState<Record<string, string>>({
    name: prefill?.name ?? stop.documentName ?? '',
    addressLine1: prefill?.addressLine1 ?? '',
    addressLine2: prefill?.addressLine2 ?? '',
    city: prefill?.city ?? '',
    state: prefill?.state ?? '',
    zip: prefill?.zip ?? '',
  });

  const field = (key: keyof typeof values, label: string) => {
    // Rendered when the document filled it, or when it is the name.
    if (key !== 'name' && !values[key]) return null;
    return (
      <label key={key} className="block">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Input
          className="mt-1 h-11"
          value={values[key]}
          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        />
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Nothing matched. This creates a new facility from what the document says
        {stop.sourceCode ? ` and remembers ${stop.sourceCode} for next time` : ''}.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'Facility name')}
        {field('addressLine1', 'Address')}
        {field('addressLine2', 'Address line 2')}
        {field('city', 'City')}
        {field('state', 'State')}
        {field('zip', 'Postcode')}
      </div>

      <Button
        className="min-h-[44px]"
        disabled={busy || !values.name.trim()}
        onClick={() => onSubmit(values)}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Create and link
      </Button>
    </div>
  );
}
