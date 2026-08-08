'use client';

/**
 * The Template row and its three presentations (spec Section 8).
 *
 * ```
 *   score >= 0.75   collapse into the summary card, with a why
 *   0.45 - 0.75     up to three ranked candidates, each with a stop diff
 *   score <  0.45   only "Continue without a template"
 * ```
 *
 * The band is decided server-side (`bandFor`) and arrives as `state`. This
 * component never compares a score to a number — the two thresholds live in
 * `template-constants.ts` and nowhere else, which is the phase's own
 * verification step ("grep 0.75 and 0.45 — one file"). `slot.thresholds` is on
 * the payload only so the copy can *say* the number it was given.
 *
 * DESIGN (Section 15): no borders on cards — surfaces are `bg-muted/40`, rows
 * separate by a hairline divider. One accent on one primary action: the only
 * `variant="default"` here is the single Apply. Spacing on 8/12/16/20/24.
 * Status is colour + icon + text, never colour alone. Red is reserved for
 * errors — a "New" badge and a "Suggested" badge are `outline`/`secondary`.
 *
 * EVERY ACTIONABLE THING IS A REAL CONTROL (quick-513). Candidate rows are
 * `<button>`, not a `<div>` with an `onClick`; the badges inside them are inert
 * `<Badge>`s and the button has no interactive descendants, so there is nothing
 * to nest.
 */

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Loader2, Route, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type {
  TemplateCandidateView,
  TemplateSlotView,
} from '@/lib/document-import/template-lookup';

interface Props {
  importId: string;
  slot: TemplateSlotView;
  /** Handed the fresh resolution so the card re-renders without a round trip. */
  onResolved: (resolution: unknown) => void;
}

type Busy = null | 'select' | 'apply' | 'decline';

export function TemplateDecision({ importId, slot, onResolved }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TemplateCandidateView | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, which: Busy) {
    setBusy(which);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not change the template.');
      return json.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the template.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  /**
   * Selecting refreshes the whole resolution, because committing the template
   * also commits the client and the contract behind it (`ensureTemplateCommitted`
   * composes `ensureContractCommitted`) — showing a stale card after a write
   * that changed three slots is how quick-508's bug looked from the outside.
   */
  async function refreshResolution() {
    const res = await fetch(`/api/v1/carrier/document-imports/${importId}/resolution`);
    const json = await res.json().catch(() => ({}));
    if (res.ok) onResolved(json.data);
  }

  async function select(candidate: TemplateCandidateView) {
    const data = await post({ action: 'select', templateId: candidate.id }, 'select');
    if (data) await refreshResolution();
  }

  async function decline() {
    const data = await post({ action: 'decline' }, 'decline');
    if (data) await refreshResolution();
  }

  async function apply() {
    setConfirming(null);
    const data = await post({ action: 'apply' }, 'apply');
    if (!data) return;
    const result = data as {
      matched: number;
      appended: number;
      notOnManifest: number;
      windowsApplied: number;
      windowsKept: number;
      windowsUnavailable: boolean;
    };
    // Says what ACTUALLY happened rather than repeating the question — the same
    // rule the bulk bar follows on the stop review screen.
    setApplied(
      [
        `${result.matched} stop${result.matched === 1 ? '' : 's'} took the template order`,
        result.appended ? `${result.appended} new at the end` : null,
        result.notOnManifest ? `${result.notOnManifest} kept as skipped` : null,
        result.windowsKept
          ? `${result.windowsKept} window${result.windowsKept === 1 ? '' : 's'} on the document left as printed`
          : null,
        result.windowsUnavailable ? 'the template has no departure time, so its windows were not applied' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    await refreshResolution();
  }

  // ---- Not askable yet -----------------------------------------------------
  if (slot.state === 'BLOCKED') {
    return (
      <TemplateRow>
        <span className="text-sm text-muted-foreground">{slot.blockedReason}</span>
      </TemplateRow>
    );
  }

  // ---- A decision is in place ----------------------------------------------
  if (slot.state === 'RESOLVED' && slot.value) {
    return (
      <div className="space-y-3 py-3">
        <div className="flex items-center gap-3">
          <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground" title={slot.value.name}>
              {slot.value.name}
            </span>
            {slot.value.widened ? <WidenedBadge /> : null}
            {slot.value.isSuggested ? <SuggestedBadge /> : null}
          </dd>
          <TemplateWhy slot={slot} />
          <button
            type="button"
            onClick={() => void decline()}
            disabled={busy != null}
            className="min-h-[44px] shrink-0 rounded px-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            Change
          </button>
        </div>

        <p className="pl-[7.5rem] text-xs text-muted-foreground">{slot.value.diffNote}</p>

        {applied ? (
          <p className="flex items-start gap-2 pl-[7.5rem] text-xs text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{applied}</span>
          </p>
        ) : null}

        {error ? <ErrorLine message={error} /> : null}

        {slot.applied ? (
          <p className="flex items-center gap-2 pl-[7.5rem] text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 shrink-0" />
            This template&apos;s order and standing details are on the stops.
          </p>
        ) : (
          <div className="pl-[7.5rem]">
            <Button
              className="min-h-[44px]"
              onClick={() => setConfirming(slot.value)}
              disabled={busy != null}
            >
              {busy === 'apply' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Route className="mr-2 h-4 w-4" />
              )}
              Use this template
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Sets the order, the windows and the paperwork. Today&apos;s quantities and references
              stay as they are.
            </p>
          </div>
        )}

        <ApplyConfirm
          candidate={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void apply()}
        />
      </div>
    );
  }

  // ---- A person chose to run without one -----------------------------------
  if (slot.state === 'DECLINED') {
    return (
      <TemplateRow>
        <span className="text-sm text-muted-foreground">No template — this trip runs on its own.</span>
        <button
          type="button"
          onClick={() => void refreshResolution()}
          className="min-h-[44px] shrink-0 rounded px-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Look again
        </button>
      </TemplateRow>
    );
  }

  // ---- 0.45 .. 0.75 : the ranked list --------------------------------------
  if (slot.state === 'CANDIDATES') {
    return (
      <div className="space-y-3 py-3">
        <div className="flex items-baseline gap-3">
          <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
          <dd className="min-w-0 flex-1 text-sm text-foreground">
            {slot.candidates.length === 1 ? 'One saved route looks close' : `${slot.candidates.length} saved routes look close`}
          </dd>
        </div>

        {slot.widened ? <WidenedNote /> : null}

        <ul className="space-y-2">
          {slot.candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => void select(candidate)}
                disabled={busy != null}
                className="flex w-full items-start gap-3 rounded-lg bg-muted/40 p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{candidate.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {candidate.scorePercent}% match
                    </Badge>
                    {candidate.widened ? <WidenedBadge /> : null}
                    {candidate.isSuggested ? <SuggestedBadge /> : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {candidate.stopCount} stop{candidate.stopCount === 1 ? '' : 's'} · {candidate.diffNote}
                  </span>
                  {candidate.countMismatch ? (
                    <span className="block text-xs text-muted-foreground">
                      Scored down — this route has a different number of stops from today&apos;s.
                    </span>
                  ) : null}
                  <StopDiff candidate={candidate} />
                </span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>

        {error ? <ErrorLine message={error} /> : null}

        <ContinueWithout onClick={() => void decline()} busy={busy === 'decline'} disabled={busy != null} />
      </div>
    );
  }

  // ---- < 0.45 : nothing is offered -----------------------------------------
  return (
    <div className="space-y-3 py-3">
      <div className="flex items-baseline gap-3">
        <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
        <dd className="min-w-0 flex-1 text-sm text-muted-foreground">
          Nothing saved looks like today&apos;s run.
        </dd>
      </div>
      {error ? <ErrorLine message={error} /> : null}
      <ContinueWithout onClick={() => void decline()} busy={busy === 'decline'} disabled={busy != null} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TemplateRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">{children}</dd>
    </div>
  );
}

/**
 * The "why", carrying the score AND the matched template — spec 4.2 asks for
 * both, and Section 8's collapse is the one place a template name appears
 * without the user having chosen it.
 *
 * A separate component from `WhyPopover` rather than a widening of it: that one
 * is typed over the client / contract / stop vocabularies, and a template's
 * `why` carries a template name where those carry matched text. Same visual
 * affordance, same dotted "why", so a dispatcher who has learned one has learned
 * this one.
 */
function TemplateWhy({ slot }: { slot: TemplateSlotView }) {
  if (!slot.why) return null;
  return (
    <Popover>
      <PopoverTrigger
        className="rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Why this template"
      >
        why
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {slot.why.via === 'AUTO_MATCH' ? 'Matched on the stops' : 'You chose it'}
        </p>
        <p className="text-foreground">{slot.why.detail}</p>
        <dl className="space-y-1 border-t border-border pt-2 text-xs">
          {slot.why.matchedText ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Template</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{slot.why.matchedText}</dd>
            </div>
          ) : null}
          {slot.why.score != null ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Score</dt>
              <dd className="font-medium text-foreground">{Math.round(slot.why.score * 100)}%</dd>
            </div>
          ) : null}
        </dl>
        {slot.persisted ? null : (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Matched on this read. It is saved the moment you change anything on this import.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The stop diff under a candidate — Section 8 requires one per candidate. */
function StopDiff({ candidate }: { candidate: TemplateCandidateView }) {
  const notable = candidate.diff.rows.filter((r) => r.origin !== 'MATCHED');
  if (notable.length === 0) {
    return (
      <span className="block text-xs text-muted-foreground">
        Every stop on this route is on today&apos;s document.
      </span>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {notable.slice(0, 6).map((row, i) => (
        <Badge key={`${row.origin}-${row.facilityId ?? i}`} variant="outline" className="max-w-full">
          <span className="truncate">
            {row.origin === 'IMPORT_ONLY' ? '+ ' : '− '}
            {row.name || 'Unnamed stop'}
          </span>
        </Badge>
      ))}
      {notable.length > 6 ? (
        <Badge variant="outline">+{notable.length - 6} more</Badge>
      ) : null}
    </span>
  );
}

function ContinueWithout({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <Button variant="ghost" className="min-h-[44px]" onClick={onClick} disabled={disabled}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Continue without a template
    </Button>
  );
}

/** Section 8: widened candidates must be VISIBLY labelled. Not colour alone. */
function WidenedBadge() {
  return (
    <Badge variant="outline" className="shrink-0">
      Other contract
    </Badge>
  );
}

function WidenedNote() {
  return (
    <p className="pl-[7.5rem] text-xs text-muted-foreground">
      This contract has no saved routes, so these are the client&apos;s.
    </p>
  );
}

/** Auto-created and not yet confirmed by a person (Section 8). */
function SuggestedBadge() {
  return (
    <Badge variant="secondary" className="shrink-0">
      <Sparkles className="mr-1 h-3 w-3" />
      Suggested
    </Badge>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * The confirmation before the merge.
 *
 * Applying reorders the stop list, so it names what will happen and to how many
 * — the same rule the bulk bar follows, and for the same reason: an action a
 * person cannot picture is one they cannot consent to.
 */
function ApplyConfirm({
  candidate,
  onCancel,
  onConfirm,
}: {
  candidate: TemplateCandidateView | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={candidate != null} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent>
        {candidate ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Use “{candidate.name}” for this trip?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    {candidate.diff.matched} stop{candidate.diff.matched === 1 ? '' : 's'} will take
                    this route&apos;s order, appointment windows, paperwork and standing notes.
                  </p>
                  {candidate.diff.importOnly > 0 ? (
                    <p>
                      {candidate.diff.importOnly} stop
                      {candidate.diff.importOnly === 1 ? '' : 's'} on today&apos;s document
                      {candidate.diff.importOnly === 1 ? ' is' : ' are'} not on this route. They go
                      at the end, badged New, and you can drag them where they belong.
                    </p>
                  ) : null}
                  {candidate.diff.templateOnly > 0 ? (
                    <p>
                      {candidate.diff.templateOnly} stop
                      {candidate.diff.templateOnly === 1 ? '' : 's'} on this route
                      {candidate.diff.templateOnly === 1 ? ' is' : ' are'} not on today&apos;s
                      manifest. They stay in the list, skipped, and one tap keeps any of them.
                    </p>
                  ) : null}
                  <p className="text-muted-foreground">
                    Today&apos;s quantities, references and per-stop notes are not changed. A window
                    printed on this document is kept as printed.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
              <AlertDialogAction className={cn('min-h-[44px]')} onClick={onConfirm}>
                Use this template
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
