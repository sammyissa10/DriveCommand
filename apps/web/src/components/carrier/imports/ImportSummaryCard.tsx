'use client';

/**
 * Screen 3 — "We found this" (spec Section 4.1).
 *
 *   +--------------------+
 *   | We found this      |
 *   | Client   Dealer  > |
 *   | Contract Chicago > |
 *   | Template West MKE> |
 *   | Date     Mon 27Jul |
 *   |                    |
 *   | 12 stops           |
 *   |                    |
 *   |  [ Review stops ]  |
 *   +--------------------+
 *
 * CONFIDENCE COLLAPSE (Section 4.2) is the whole behaviour of this component,
 * and it is expressed as a single decision at the top of the render: if a
 * decision is unresolved, that decision gets the screen to itself and the card
 * is not drawn. Resolved values collapse into rows here. So a dispatcher whose
 * document matches cleanly sees one card and taps once; a dispatcher whose
 * document does not sees exactly one question, answers it, and then sees the
 * card.
 *
 * "Only the summary card may show more than one unresolved decision" is
 * satisfied structurally rather than by discipline: the standalone steps below
 * return early and render one thing. The card is the only place from which two
 * different rows can be opened, and it opens them one at a time.
 *
 * EVERY ROW HAS A CHANGE AFFORDANCE, including the ones that resolved
 * confidently — that is what makes collapse safe. A row that cannot be argued
 * with is a row that has to be right.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Info, Loader2, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ImportView } from '@/lib/document-import/intake';
import { ClientDecision } from './ClientDecision';
import { ContractDecision, contractLabel, contractRateLabel } from './ContractDecision';
import { WhyPopover } from './WhyPopover';
import { StopResolutionPanel } from './StopResolutionPanel';

type OpenRow = 'client' | 'contract' | 'date' | null;

interface Props {
  view: ImportView;
  onChange: (next: ImportView) => void;
}

/**
 * A resolution write returns the resolution view, not the whole import. The
 * card holds the import view, so the two are merged rather than re-fetched —
 * one round trip, and the page never blanks between them.
 */
function merge(view: ImportView, resolution: unknown): ImportView {
  return { ...view, resolution: resolution as ImportView['resolution'] };
}

export function ImportSummaryCard({ view, onChange }: Props) {
  const [open, setOpen] = useState<OpenRow>(null);
  // Collapsed by default, because a document whose stops all resolved silently
  // is the outcome this module is for and does not need a list to prove it. The
  // count line above says how many need a look, so opening this is a choice
  // rather than a hunt.
  const [stopsOpen, setStopsOpen] = useState(false);
  const r = view.resolution;

  if (!r) return null;

  const apply = (resolution: unknown) => {
    onChange(merge(view, resolution));
    setOpen(null);
  };

  // ---- The unresolved decision gets the screen to itself --------------------
  if (r.client.state === 'UNRESOLVED') {
    return <ClientDecision importId={view.id} slot={r.client} onResolved={apply} />;
  }
  if (r.contract.state !== 'RESOLVED') {
    return (
      <ContractDecision
        importId={view.id}
        slot={r.contract}
        clientName={r.client.value?.name ?? 'This client'}
        onResolved={apply}
      />
    );
  }

  // ---- Everything collapsed ------------------------------------------------
  return (
    <div className="space-y-4 rounded-xl bg-muted/40 p-5">
      <dl className="divide-y divide-border">
        <Row
          label="Client"
          value={r.client.value?.name ?? '—'}
          why={r.client.why}
          onChange={() => setOpen(open === 'client' ? null : 'client')}
          isOpen={open === 'client'}
        />
        {open === 'client' ? (
          <div className="py-3">
            <ClientDecision
              importId={view.id}
              slot={r.client}
              onResolved={apply}
              compact
              onCancel={() => setOpen(null)}
            />
          </div>
        ) : null}

        <Row
          label="Contract"
          value={r.contract.value ? contractLabel(r.contract.value) : '—'}
          hint={r.contract.value ? contractRateLabel(r.contract.value) : null}
          badge={
            r.contract.value?.isOneTime ? (
              <Badge variant="warning" className="shrink-0">
                One-time
              </Badge>
            ) : null
          }
          why={r.contract.why}
          onChange={() => setOpen(open === 'contract' ? null : 'contract')}
          isOpen={open === 'contract'}
        />
        {open === 'contract' ? (
          <div className="py-3">
            <ContractDecision
              importId={view.id}
              slot={r.contract}
              clientName={r.client.value?.name ?? 'This client'}
              onResolved={apply}
              compact
              onCancel={() => setOpen(null)}
            />
          </div>
        ) : null}

        {/* Template — drawn because Section 4.1 draws it, and honest about
            being a stub. It never shows a value it does not have. */}
        <div className="flex items-center gap-3 py-3">
          <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
          <dd className="min-w-0 flex-1 text-sm text-muted-foreground">Not matched yet</dd>
          <Badge variant="secondary" className="shrink-0">
            Later phase
          </Badge>
        </div>

        <DateRow
          importId={view.id}
          value={r.documentDate}
          isOpen={open === 'date'}
          onToggle={() => setOpen(open === 'date' ? null : 'date')}
          onResolved={apply}
        />
      </dl>

      {/* ---- The stop-count line ---- */}
      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-semibold text-foreground">
            {r.stops.total} stop{r.stops.total === 1 ? '' : 's'}
          </p>
          {r.stops.total > 0 ? (
            <button
              type="button"
              onClick={() => setStopsOpen(!stopsOpen)}
              aria-expanded={stopsOpen}
              className="min-h-[44px] rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              {stopsOpen ? 'Hide facilities' : 'Facilities'}
            </button>
          ) : null}
        </div>
        {/* Section 4.1 draws "11 matched · 1 new" under this, and as of the
            facility ladder these are real counts rather than the honest nulls
            Phase 3 had to show. */}
        <p className="mt-0.5 text-xs text-muted-foreground">{r.stops.note}</p>
      </div>

      {stopsOpen ? (
        <div className="border-t border-border pt-4">
          <StopResolutionPanel importId={view.id} />
        </div>
      ) : null}

      {view.summary && view.summary.warnings.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border pt-3">
          {view.summary.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-border pt-4">
        <Button className="h-12 w-full text-base" disabled>
          Review stops
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {/* Says only what it can know. The previous sentence ended "…and the
            client and contract above are saved", which this component cannot
            establish: `state: 'RESOLVED'` means the server resolved the slot,
            not that it wrote it — an auto-resolved client or contract is
            displayed here while the row still holds null. Asserting a save that
            may not have happened is the same class of untruth as the "why"
            claiming a person chose. See the note in the quick-510 summary for
            what showing the affirmative version would require. */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Stop review arrives in the next phase.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/carrier/trips" className="underline underline-offset-2 hover:text-foreground">
          Leave this for now
        </Link>{' '}
        — it will be waiting on the Trips page.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Row({
  label,
  value,
  hint,
  badge,
  why,
  onChange,
  isOpen,
}: {
  label: string;
  value: string;
  hint?: string | null;
  badge?: React.ReactNode;
  why: React.ComponentProps<typeof WhyPopover>['why'];
  onChange: () => void;
  isOpen: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{value}</span>
        {badge}
        {hint ? <span className="shrink-0 text-xs text-muted-foreground">{hint}</span> : null}
      </dd>
      <WhyPopover why={why} />
      <button
        type="button"
        onClick={onChange}
        aria-label={`Change ${label.toLowerCase()}`}
        aria-expanded={isOpen}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground',
          isOpen && 'bg-muted text-foreground',
        )}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The date row.
 *
 * It gets a change affordance like everything else because spec 1.2 callout (3)
 * is that a date can be printed in a field labelled "Number" — this is the one
 * field where extraction is most likely to have read something plausible and
 * wrong, and where a wrong value silently sets a trip's date.
 */
function DateRow({
  importId,
  value,
  isOpen,
  onToggle,
  onResolved,
}: {
  importId: string;
  value: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onResolved: (resolution: unknown) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/resolution`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentDate: draft || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not change the date.');
      onResolved(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the date.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <dt className="w-24 shrink-0 text-sm text-muted-foreground">Date</dt>
        <dd className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {value ? formatDocumentDate(value) : 'None on the document'}
        </dd>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Change date"
          aria-expanded={isOpen}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground',
            isOpen && 'bg-muted text-foreground',
          )}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      {isOpen ? (
        <div className="space-y-2 py-3">
          <Input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11"
            aria-label="Document date"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="min-h-[44px]" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Save date
            </Button>
            <Button variant="ghost" className="min-h-[44px]" onClick={onToggle} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "Mon 27 Jul", as drawn. Parsed as UTC — the column is date-only. */
export function formatDocumentDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
