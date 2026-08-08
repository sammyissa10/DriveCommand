'use client';

/**
 * The post-commit template question (spec Section 8, items 5 and 7).
 *
 * ```
 *   a template was applied and the trip differed  ->  "Update the template?"
 *   no template, tenant setting OFF               ->  "Save as route template"
 *   no template, tenant setting ON                ->  "Created a suggested route"
 * ```
 *
 * **Offered once, never silent.** Both halves of that sentence are load-bearing
 * and neither is this component's doing: the server RECORDS the offer when the
 * commit runs (`runPostCommitTemplateStep`), so it cannot be re-derived and
 * re-asked on every visit, and it is never skipped because the recording happens
 * whether or not anyone is looking at the screen. Once answered, `answered` is
 * true and this renders the outcome rather than the question — it does not
 * disappear, because a dispatcher who taps by accident should be able to see
 * what they answered.
 *
 * It renders NOTHING until the import is committed. There is no commit in this
 * codebase yet — Phase 8 owns it — so today `kind` is always `NONE` and this
 * draws nothing. That is the honest wiring: the screen is driven by what the
 * server recorded rather than by a flag a component sets for itself, so it
 * lights up the moment a commit exists without this file changing.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Route, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TemplateOfferView } from '@/lib/document-import/template-service';

export function TemplateOfferCard({ importId }: { importId: string }) {
  const [offer, setOffer] = useState<TemplateOfferView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/template/offer`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setOffer(json.data as TemplateOfferView);
    } catch {
      // A question we could not fetch is a question we do not ask. Silent here
      // and only here: there is nothing the dispatcher can do about it and the
      // trip is already committed.
    }
  }, [importId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(action: 'save' | 'update' | 'dismiss') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/template/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save that.');
      if (action === 'save') {
        const result = json.data as { templateName: string; stopCount: number; skippedUnresolved: number; skippedNotToday: number };
        // Says what was left out. A template silently shorter than the trip it
        // came from is the kind of thing nobody notices until day thirty.
        setSaved(
          [
            `Saved “${result.templateName}” with ${result.stopCount} stop${result.stopCount === 1 ? '' : 's'}`,
            result.skippedUnresolved ? `${result.skippedUnresolved} without a confirmed facility left out` : null,
            result.skippedNotToday ? `${result.skippedNotToday} skipped stop${result.skippedNotToday === 1 ? '' : 's'} left out` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!offer || offer.kind === 'NONE') return null;

  if (offer.kind === 'AUTO_CREATED') {
    return (
      <Shell>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              Saved as a suggested route
              <Badge variant="secondary" className="ml-2">
                Suggested
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              {offer.templateName
                ? `“${offer.templateName}” is in Suggested templates until someone confirms it.`
                : 'It is in Suggested templates until someone confirms it.'}
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (offer.answered) {
    return (
      <Shell>
        <p className="flex items-start gap-3 text-sm text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saved ?? 'Thanks — asked and answered. This will not come up again.'}</span>
        </p>
      </Shell>
    );
  }

  const isUpdate = offer.kind === 'UPDATE_TEMPLATE';

  return (
    <Shell>
      <div className="flex items-start gap-3">
        <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            {isUpdate ? 'This trip ran differently from its template' : 'Save this run as a route template?'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isUpdate
              ? `${offer.changedSummary}. Update “${offer.templateName}” so tomorrow starts from what actually ran?`
              : 'Next time this document arrives, the order, the windows and the paperwork come back on their own.'}
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-[44px]"
          onClick={() => void answer(isUpdate ? 'update' : 'save')}
          disabled={busy}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isUpdate ? 'Update the template' : 'Save as route template'}
        </Button>
        <Button
          variant="ghost"
          className="min-h-[44px]"
          onClick={() => void answer('dismiss')}
          disabled={busy}
        >
          {isUpdate ? 'Leave it as it is' : 'No thanks'}
        </Button>
      </div>
    </Shell>
  );
}

/** No border, elevation by surface contrast, spacing on the 12/16/20 scale. */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-xl bg-muted/40 p-5">{children}</div>;
}
