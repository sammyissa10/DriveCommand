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
 *
 * ---------------------------------------------------------------------------
 * "CHANGE" IS A QUESTION, NOT AN ANSWER (quick-516)
 * ---------------------------------------------------------------------------
 * It used to call `decline()`, so the only way to change a template was to give
 * one up: the row wrote `via: 'NONE'` on the first tap and a dispatcher who
 * wanted the 0.50 route instead of the 0.80 one had nowhere to say so. It now
 * opens a chooser over `slot.alternatives` — every candidate the server scored,
 * uncapped, plus "No template" as an explicit option. **Opening it writes
 * nothing**; the write happens when a person picks.
 *
 * "Look again" was wired all along, to a re-fetch, which re-read the decision it
 * was trying to clear (`buildTemplateSlot` returns `DECLINED` before it scores
 * anything). It now POSTs `reset`, which is the mutation that clears it.
 */

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, Check, Info, Loader2, Route, Sparkles } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  APPLY_CONFIRM_FOOTNOTE,
  applyConfirmSentences,
} from '@/lib/document-import/template-copy';
import type { TemplateDiff } from '@/lib/document-import/template-matching';
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

type Busy = null | 'select' | 'apply' | 'decline' | 'reset';

export function TemplateDecision({ importId, slot, onResolved }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TemplateCandidateView | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  /** What the last "Look again" found. Says so even when the answer is nothing. */
  const [notice, setNotice] = useState<string | null>(null);

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
    setChoosing(false);
    const data = await post({ action: 'decline' }, 'decline');
    if (data) await refreshResolution();
  }

  /**
   * Picked from the chooser. Selects, then hands straight to the apply
   * confirmation — the same `ApplyConfirm` the middle band reaches through "Use
   * this template", not a second flow.
   *
   * Continuing to the confirmation here and not after a middle-band pick is
   * deliberate. In the middle band the person is answering "which of these?" and
   * the row they land on is the answer. Here they were looking at a template the
   * system had already chosen and said "not that one" — the next thing they want
   * is the new one in place. Cancelling leaves the selection written and
   * unapplied, with "Use this template" on the row, so nothing is merged without
   * a tap either way.
   */
  async function chooseAndConfirm(candidate: TemplateCandidateView) {
    setChoosing(false);
    setNotice(null);
    const data = await post({ action: 'select', templateId: candidate.id }, 'select');
    if (!data) return;
    await refreshResolution();
    setConfirming(candidate);
  }

  /**
   * "Look again" — the mutation, at last. Clears the decision, which lets the
   * matcher run again on the way out, and then says what it found. A fresh look
   * that finds nothing is reported rather than left as an unchanged-looking row.
   */
  async function lookAgain() {
    setNotice(null);
    const data = await post({ action: 'reset' }, 'reset');
    if (!data) return;
    const fresh = data as TemplateSlotView;
    setNotice(
      fresh.state === 'RESOLVED' && fresh.value
        ? `Looked again — “${fresh.value.name}” matches at ${fresh.value.scorePercent}%.`
        : fresh.state === 'CANDIDATES'
          ? `Looked again — ${fresh.candidates.length} saved route${fresh.candidates.length === 1 ? '' : 's'} to choose from.`
          : fresh.state === 'BLOCKED'
            ? (fresh.blockedReason ?? 'Looked again — this cannot be matched yet.')
            : 'Looked again — nothing saved matches today’s run.',
    );
    await refreshResolution();
  }

  async function apply() {
    setConfirming(null);
    const data = await post({ action: 'apply' }, 'apply');
    if (!data) return;
    const result = data as {
      matched: number;
      appended: number;
      notOnManifest: number;
      windowsDeferred: number;
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
        // Was "the template has no departure time, so its windows were not
        // applied" — true of one template and misleading about the rule
        // (quick-515). Deferral is unconditional and is not a failure.
        result.windowsDeferred
          ? `${result.windowsDeferred} window${result.windowsDeferred === 1 ? '' : 's'} come from the route and are set when you finish the trip`
          : null,
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
            onClick={() => {
              setError(null);
              setNotice(null);
              setChoosing(true);
            }}
            disabled={busy != null}
            className="min-h-[44px] shrink-0 rounded px-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            Change
          </button>
        </div>

        <p className="pl-[7.5rem] text-xs text-muted-foreground">{slot.value.diffNote}</p>

        {notice ? <NoticeLine message={notice} /> : null}

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

        <TemplateChooser
          open={choosing}
          current={slot.value}
          alternatives={slot.alternatives}
          busy={busy != null}
          onClose={() => setChoosing(false)}
          onPick={(candidate) => void chooseAndConfirm(candidate)}
          onNone={() => void decline()}
        />
      </div>
    );
  }

  // ---- A person chose to run without one -----------------------------------
  if (slot.state === 'DECLINED') {
    return (
      <div className="space-y-2 py-3">
        <div className="flex items-center gap-3">
          <dt className="w-24 shrink-0 text-sm text-muted-foreground">Template</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">
              No template — this trip runs on its own.
            </span>
            <button
              type="button"
              onClick={() => void lookAgain()}
              disabled={busy != null}
              // The name is on the button, not on the label, so it survives the
              // spinner replacing the text.
              aria-label="Look for templates again"
              className="min-h-[44px] shrink-0 rounded px-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {busy === 'reset' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                'Look again'
              )}
            </button>
          </dd>
        </div>
        {notice ? <NoticeLine message={notice} /> : null}
        {error ? <ErrorLine message={error} /> : null}
      </div>
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
        {notice ? <NoticeLine message={notice} /> : null}

        <ul className="space-y-2">
          {slot.candidates.map((candidate) => (
            <li key={candidate.id}>
              <CandidateRow
                candidate={candidate}
                disabled={busy != null}
                onClick={() => void select(candidate)}
              />
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
      {notice ? <NoticeLine message={notice} /> : null}
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

/**
 * One candidate, as a row.
 *
 * The middle band's presentation, lifted out so the chooser draws the identical
 * thing (quick-516) rather than a second, thinner list that would teach a
 * dispatcher two different pictures of the same comparison. Everything a person
 * needs to choose is here — name, score, stop count, diff note, the count-mismatch
 * caveat and the per-stop diff — because a chooser that showed only names would
 * make "the 0.50 one" a guess.
 *
 * A childless `<button>` with inert `<Badge>`s inside (quick-513): no interactive
 * descendants, nothing to nest.
 */
function CandidateRow({
  candidate,
  disabled,
  onClick,
  current = false,
}: {
  candidate: TemplateCandidateView;
  disabled: boolean;
  onClick: () => void;
  /** The template already on the row. Shown, chipped, and not pickable. */
  current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || current}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg bg-muted/40 p-4 text-left transition-colors',
        current ? 'cursor-default opacity-70' : 'hover:bg-muted',
        'disabled:opacity-50',
      )}
    >
      <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{candidate.name}</span>
          <Badge variant="secondary" className="shrink-0">
            {candidate.scorePercent}% match
          </Badge>
          {current ? (
            <Badge variant="outline" className="shrink-0">
              Current
            </Badge>
          ) : null}
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
      {current ? null : <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

/**
 * The chooser behind "Change".
 *
 * Lists every candidate the server scored — `slot.alternatives`, uncapped — with
 * the one already selected chipped `Current` and not pickable, and offers "No
 * template" as an option of its own. **Nothing is written by opening this.** The
 * old behaviour wrote `via: 'NONE'` on the tap that opened nothing at all, which
 * is what made a 0.50 route unreachable whenever a 0.80 one existed.
 *
 * When there is nothing else to switch to it says so, and "No template" is still
 * there — a dialog that could only be cancelled would be a dead end dressed up as
 * a choice.
 */
function TemplateChooser({
  open,
  current,
  alternatives,
  busy,
  onClose,
  onPick,
  onNone,
}: {
  open: boolean;
  current: TemplateCandidateView | null;
  alternatives: TemplateCandidateView[];
  busy: boolean;
  onClose: () => void;
  onPick: (candidate: TemplateCandidateView) => void;
  onNone: () => void;
}) {
  const others = alternatives.filter((c) => c.id !== current?.id);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Which saved route is this?</DialogTitle>
          <DialogDescription>
            Picking one selects it — you confirm before anything on the stop list moves.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {current ? (
            <li>
              <CandidateRow candidate={current} disabled={busy} onClick={onClose} current />
            </li>
          ) : null}
          {others.map((candidate) => (
            <li key={candidate.id}>
              <CandidateRow
                candidate={candidate}
                disabled={busy}
                onClick={() => onPick(candidate)}
              />
            </li>
          ))}
        </ul>

        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing else saved looks like today&apos;s run.
          </p>
        ) : null}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onNone}
            disabled={busy}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-muted/40 p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">No template</span>
              <span className="block text-xs text-muted-foreground">
                This trip runs on its own. Nothing already on the stops is undone.
              </span>
            </span>
          </button>
          <Button variant="ghost" className="min-h-[44px] w-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What just happened, in the row. Neutral — this is never an error. */
function NoticeLine({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 pl-[7.5rem] text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
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
 * The confirmation's body copy.
 *
 * ---------------------------------------------------------------------------
 * ONE STRING PER SENTENCE. NOT FOUR ADJACENT CHILDREN. (quick-517)
 * ---------------------------------------------------------------------------
 * This dialog rendered "4 stopswill" and "2 stopson" on screen. Each sentence
 * used to be assembled by the renderer from a count, a `" stop"` text node, a
 * pluralising ternary and a continuation text node — and whatever dropped the gap
 * between "stops" and "will" could only do so because that gap was a boundary
 * between two nodes instead of a character inside one. `applyConfirmSentences`
 * returns finished strings, so there is no boundary left to lose. See
 * `template-copy.ts` for the evidence trail.
 *
 * Exported, and a component of its own rather than JSX inlined in the dialog, for
 * a second reason: the dialog body is behind `AlertDialog` and unreachable from a
 * static render, so before this split the copy could not be tested at all. It can
 * now — `__tests__/TemplateDecision.test.tsx` renders it and reads the markup.
 *
 * Takes `diff` rather than the candidate: the copy is about the merge, and a
 * component that received the whole candidate would invite someone to put the
 * template's name in a sentence the title already carries.
 */
export function ApplyConfirmCopy({ diff }: { diff: TemplateDiff }) {
  return (
    <div className="space-y-2 text-sm">
      {applyConfirmSentences(diff).map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
      <p className="text-muted-foreground">{APPLY_CONFIRM_FOOTNOTE}</p>
    </div>
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
                <ApplyConfirmCopy diff={candidate.diff} />
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
