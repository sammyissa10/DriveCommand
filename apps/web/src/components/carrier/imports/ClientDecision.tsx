'use client';

/**
 * "Which client?" — the unresolved-client step from spec Section 4.2.
 *
 * One question on the screen, nothing else. A searchable list with the
 * extracted name already typed into the box, and one way out of it if the
 * client genuinely is not there yet.
 *
 * WHY THE NAME IS PRE-TYPED rather than merely used to rank: the ranked list is
 * the answer to "which of these", but a dispatcher whose client list runs to
 * three hundred rows needs the search box to already contain the thing they
 * would have typed. It is also the recovery path when extraction misread the
 * name — the wrong string is visible and editable rather than invisible and
 * governing the ranking.
 *
 * CREATE NEW is pre-filled from the extraction (constraint: "never show a form
 * with many empty fields"). Every field the document carried is already in it;
 * the fields it did not are simply absent from the form rather than present and
 * empty.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ClientOption, ClientPrefill, ClientSlotView } from '@/lib/document-import/resolution';

const SEARCH_DEBOUNCE_MS = 250;

interface Props {
  importId: string;
  slot: ClientSlotView;
  /** Called with the whole refreshed import view after a successful write. */
  onResolved: (nextView: unknown) => void;
  /** Rendered inside the summary card rather than as a standalone step. */
  compact?: boolean;
  onCancel?: () => void;
}

export function ClientDecision({ importId, slot, onResolved, compact, onCancel }: Props) {
  const [query, setQuery] = useState(slot.documentText ?? '');
  const [candidates, setCandidates] = useState<ClientOption[]>(slot.candidates);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // The document's name is what the server already ranked against, so the first
  // render needs no request — only a *changed* query does.
  const initialQuery = useRef(slot.documentText ?? '');

  useEffect(() => {
    if (query === initialQuery.current) {
      setCandidates(slot.candidates);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/carrier/document-imports/${importId}/resolution?q=${encodeURIComponent(query)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setCandidates(json.data.client.candidates as ClientOption[]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, importId, slot.candidates]);

  const select = useCallback(
    async (clientId: string) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/carrier/document-imports/${importId}/resolution`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Could not set the client.');
        onResolved(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not set the client.');
      } finally {
        setSaving(false);
      }
    },
    [importId, onResolved],
  );

  if (creating) {
    return (
      <CreateClientForm
        importId={importId}
        prefill={{ ...slot.createPrefill, name: query || slot.createPrefill.name }}
        onDone={onResolved}
        onBack={() => setCreating(false)}
      />
    );
  }

  return (
    <div className={cn('space-y-4', !compact && 'rounded-xl bg-muted/40 p-5')}>
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Which client?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {slot.documentText
              ? <>The document says <span className="font-medium text-foreground">“{slot.documentText}”</span>. We could not match that to exactly one active client.</>
              : 'The document did not name a shipper we could read.'}
          </p>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
          className="h-11 pl-9"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="space-y-1">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void select(c.id)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[c.dbaName, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') ||
                    'No address on file'}
                  {c.activeContractCount > 0
                    ? ` · ${c.activeContractCount} active contract${c.activeContractCount === 1 ? '' : 's'}`
                    : ' · no active contract'}
                </span>
              </span>
              {/* The score is shown on the candidate rows too, not only behind
                  "why" — when the system is asking rather than telling, how
                  close each option is IS the useful information. */}
              {c.score != null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(c.score * 100)}%
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {candidates.length === 0 && !searching ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          No client matches {query ? `“${query}”` : 'that name'}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="outline" className="min-h-[44px]" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create “{query.trim() || slot.createPrefill.name || 'new client'}”
        </Button>
        {onCancel ? (
          <Button variant="ghost" className="min-h-[44px]" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Create-new, pre-filled from extraction.
 *
 * Only fields the document actually carried are rendered, plus the name. A
 * blank "Fax" or "Tax ID" on this screen would be a field the dispatcher has to
 * read and skip at 5:30am for no gain — the full client record is one click
 * away on the client page, and nothing here prevents filling it in later.
 */
function CreateClientForm({
  importId,
  prefill,
  onDone,
  onBack,
}: {
  importId: string;
  prefill: ClientPrefill;
  onDone: (nextView: unknown) => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<ClientPrefill>(prefill);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ClientPrefill>(key: K, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Which optional fields to show: the ones extraction filled. This is the
  // "never show a form with many empty fields" constraint, applied literally.
  const shown = (
    [
      ['primaryContact', 'Primary contact'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['addressLine1', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
    ] as Array<[keyof ClientPrefill, string]>
  ).filter(([key]) => Boolean(prefill[key]));

  async function submit() {
    if (!values.name.trim()) {
      setError('A client name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/resolution/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not create the client.');
      onDone(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the client.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl bg-muted/40 p-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">New client</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Filled in from the document. Correct anything that was misread.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="client-name">Company name</Label>
          <Input
            id="client-name"
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className="h-11"
          />
        </div>

        {shown.map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`client-${key}`}>{label}</Label>
            <Input
              id={`client-${key}`}
              value={(values[key] as string | null) ?? ''}
              onChange={(e) => set(key, e.target.value)}
              className="h-11"
            />
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <p className="text-xs text-muted-foreground">
        MC/DOT numbers, payment terms and the rest live on the client’s profile — this import
        carries on either way.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[44px]" onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Create and use
        </Button>
        <Button variant="ghost" className="min-h-[44px]" onClick={onBack} disabled={saving}>
          Back to the list
        </Button>
      </div>
    </div>
  );
}
