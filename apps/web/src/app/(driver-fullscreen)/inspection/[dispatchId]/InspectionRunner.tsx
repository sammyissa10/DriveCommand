'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  MinusCircle,
  PenLine,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type {
  InspectionChecklistView,
  InspectionGateView,
  InspectionStepView,
} from '@/lib/carrier/inspection-handlers';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import {
  answerInspectionFail,
  answerInspectionNotApplicable,
  answerInspectionPass,
  requestInspectionPhotoUpload,
  requestSignatureUpload,
  signInspection,
  submitInspectionChecklist,
} from '../actions';

/**
 * The full-screen pre-trip walkaround.
 *
 * ONLINE-ONLY, by decision. There is no offline queue on web and this phase does
 * not build one: the existing mobile queue is MMKV-backed, JSON-only and cannot
 * carry a photo anyway, and an IndexedDB reimplementation is new work rather
 * than a port. What replaces it is honesty — every answer is a server round
 * trip, a failed round trip says which item failed and offers a retry, and
 * nothing ever renders as recorded that is not recorded. A checklist that shows
 * a green tick for an answer sitting in browser memory is worse than one that
 * admits it could not reach the server.
 *
 * ANSWERS LIVE ON THE SERVER. This component holds no answer state at all —
 * every tick you see comes from `view.sections[].steps[].status`, re-rendered
 * after each action's `revalidatePath`. Local state is only ever transient
 * input: the note being typed, the photo being uploaded, which section is on
 * screen. That is the same discipline stop review took in Phase 5, and for the
 * same reason: two copies of an answer eventually disagree, and the copy the
 * driver can see is the one that is wrong.
 *
 * RE-ANSWERING IS ONE-DIRECTIONAL, and this is deliberate rather than a
 * limitation of the services it calls. A passed or N/A item can still be failed
 * — a driver who mis-taps Pass on Brakes must be able to correct it, and that
 * correction is the safe direction. A FAILED item cannot be cleared from here:
 * doing so would delete a reported defect, its mechanic sign-off step and its
 * dispatcher notification, which is a decision for a dispatcher and not for the
 * person the defect might inconvenience.
 */

// ---------------------------------------------------------------------------
// Copy — one string per sentence
// ---------------------------------------------------------------------------

/**
 * Every sentence containing a count is ONE string.
 *
 * quick-517 spent two investigations on `<p>{n} stop{n === 1 ? '' : 's'} …</p>`
 * rendering "4 stopswill" on screen, blamed JSX whitespace trimming twice, and
 * was wrong both times. One string per sentence removes the boundary instead of
 * the suspect. The server's `inspectionCopy` does the same for its sentences;
 * these are the ones only the client knows.
 */
const copy = {
  sectionProgress: (current: number, total: number): string =>
    `Section ${current} of ${total}`,
  itemsAnswered: (answered: number, total: number): string =>
    answered === total
      ? `All ${total} items answered`
      : `${answered} of ${total} items answered`,
  unansweredInSection: (n: number): string =>
    n === 1 ? '1 item on this screen still needs an answer' : `${n} items on this screen still need an answer`,
  unansweredOverall: (n: number): string =>
    n === 1
      ? '1 item still needs an answer before you can sign.'
      : `${n} items still need an answer before you can sign.`,
  noteTooShort: (min: number): string =>
    `Describe the problem in at least ${min} characters.`,
  reasonTooShort: (min: number): string =>
    `Say why this does not apply, in at least ${min} characters.`,
  charactersLeft: (remaining: number): string =>
    remaining === 1 ? '1 more character' : `${remaining} more characters`,
  defectsLogged: (n: number): string =>
    n === 1
      ? '1 item was flagged and logged against the truck.'
      : `${n} items were flagged and logged against the truck.`,
} as const;

/** Role names as a driver would say them, not as the enum spells them. */
const ROLE_LABEL: Record<string, string> = {
  DISPATCHER: 'dispatch',
  MECHANIC: 'the shop',
  SAFETY_MANAGER: 'the safety manager',
  THIRD_PARTY: 'a third party',
  OWNER: 'the office',
};

/**
 * What a driver reads on a step that is not theirs.
 *
 * One string per sentence, per the rule above. Says WHOSE it is when the role is
 * one a driver would recognise, and stays vague rather than leaking an enum
 * value when it is not.
 */
function notYoursCopy(step: InspectionStepView): string {
  if (step.stepType !== 'INSPECTION_ITEM') {
    const who = step.assigneeRole ? ROLE_LABEL[step.assigneeRole] : null;
    return who
      ? `Not part of your walkaround — ${who} completes this one.`
      : 'Not part of your walkaround. Somebody else completes this one.';
  }
  const who = step.assigneeRole ? ROLE_LABEL[step.assigneeRole] : null;
  return who
    ? `Assigned to ${who}, not to you.`
    : 'This item is assigned to somebody else.';
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

type Answer = InspectionStepView['status'];

/** Status = colour AND icon AND text (Section 15). Cover the colour, it still reads. */
function AnswerChip({ status }: { status: Answer }) {
  if (status === 'COMPLETE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Passed
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        Failed
      </span>
    );
  }
  if (status === 'SKIPPED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <MinusCircle className="h-3.5 w-3.5 shrink-0" />
        Not applicable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
      Not answered
    </span>
  );
}

/**
 * Every tappable answer. 56px tall, not 44 — 44 is the floor a guideline sets
 * for a fingertip, and this is tapped with a glove on, outdoors, in a hurry.
 */
function AnswerButton({
  tone,
  icon,
  label,
  onClick,
  disabled,
  busy,
}: {
  tone: 'pass' | 'fail' | 'na';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const tones: Record<typeof tone, string> = {
    pass: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    // Red is reserved for errors and destructive actions. A failed inspection
    // item is exactly what Section 15 names as qualifying.
    fail: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    na: 'bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold transition-colors disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

type PhotoState =
  | { kind: 'none' }
  | { kind: 'uploading'; name: string }
  | { kind: 'uploaded'; name: string; previewUrl: string; s3Key: string }
  | { kind: 'error'; name: string; message: string };

function ItemCard({
  dispatchId,
  step,
  minNoteLength,
  onError,
}: {
  dispatchId: string;
  step: InspectionStepView;
  minNoteLength: number;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'fail' | 'na'>('idle');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'none' });
  const [pending, startTransition] = useTransition();
  const [busyVerb, setBusyVerb] = useState<'pass' | 'fail' | 'na' | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const answered = step.status !== 'NOT_STARTED' && step.status !== 'IN_PROGRESS';
  const isFailed = step.status === 'FAILED';

  function run(verb: 'pass' | 'fail' | 'na', fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusyVerb(verb);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.success) {
          onError(res.error ?? 'That did not save. Try again.');
          return;
        }
        setMode('idle');
        setNote('');
        setReason('');
        setPhoto({ kind: 'none' });
      } finally {
        setBusyVerb(null);
      }
    });
  }

  /**
   * Upload at capture — the whole point.
   *
   * The bytes go to R2 the moment the driver picks the photo, before the note
   * is typed and long before Submit. A driver who photographs a cracked mudflap
   * and then loses signal, closes the tab or drops the phone has already
   * delivered the evidence; only the note is outstanding. The previous web
   * behaviour held the `File` in React state until Submit, which meant closing
   * the tab left nothing in any bucket.
   *
   * `s3Key` is set ONLY after a 2xx from the PUT. A key recorded for bytes that
   * never landed is the `SignatureScreen` bug Phase 9 had to fix, one layer
   * down.
   */
  async function onPhotoChosen(file: File) {
    setPhoto({ kind: 'uploading', name: file.name });

    const grant = await requestInspectionPhotoUpload(dispatchId, {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!grant.success) {
      setPhoto({ kind: 'error', name: file.name, message: grant.error });
      return;
    }

    let put: Response;
    try {
      put = await fetch(grant.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
    } catch {
      setPhoto({
        kind: 'error',
        name: file.name,
        message: 'The photo did not upload. Check your signal and tap to try again.',
      });
      return;
    }

    if (!put.ok) {
      setPhoto({
        kind: 'error',
        name: file.name,
        message: `The photo did not upload (${put.status}). Tap to try again.`,
      });
      return;
    }

    setPhoto({
      kind: 'uploaded',
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      s3Key: grant.data.s3Key,
    });
  }

  const noteShort = note.trim().length < minNoteLength;
  const reasonShort = reason.trim().length < minNoteLength;
  const photoMissing = step.requiresPhotoOnFail && photo.kind !== 'uploaded';

  return (
    <li className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-snug text-foreground">{step.name}</h3>
            {step.isCritical && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Critical
              </span>
            )}
          </div>
          {step.description && (
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{step.description}</p>
          )}
        </div>
        {answered && <AnswerChip status={step.status} />}
      </div>

      {/* What was recorded, when it was recorded */}
      {answered && (step.note || step.photoKeys.length > 0) && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3">
          {step.note && <p className="text-sm text-foreground">{step.note}</p>}
          {step.photoKeys.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5 shrink-0" />
              Photo saved
            </p>
          )}
        </div>
      )}

      {isFailed && (
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          A reported fault stays reported. Your dispatcher can clear it.
        </p>
      )}

      {/*
        quick-543 — somebody else's step.

        Read-only, named, and no buttons. It is NOT hidden: the owner put it in
        this checklist deliberately, and silently dropping it would make the
        driver's walkaround differ from the playbook without anyone being told.
        It is also not counted in progress (see `totals` below), because a step
        the driver cannot answer must never be the reason the bar stops short of
        the end.

        Before this, it rendered with Pass / Fail / N-A and the server refused
        all three — a button that does nothing, in a yard, with gloves on.
      */}
      {!step.answerableByDriver && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{notYoursCopy(step)}</p>
        </div>
      )}

      {/* Answer buttons */}
      {step.answerableByDriver && !isFailed && mode === 'idle' && (
        <div className="mt-4 flex gap-2">
          {!answered && (
            <AnswerButton
              tone="pass"
              icon={<Check className="h-5 w-5 shrink-0" />}
              label="Pass"
              busy={busyVerb === 'pass'}
              disabled={pending}
              onClick={() =>
                run('pass', () => answerInspectionPass(dispatchId, step.stepInstanceId))
              }
            />
          )}
          <AnswerButton
            tone="fail"
            icon={<X className="h-5 w-5 shrink-0" />}
            label={answered ? 'Change to fail' : 'Fail'}
            disabled={pending}
            onClick={() => setMode('fail')}
          />
          {!answered && (
            <AnswerButton
              tone="na"
              icon={<MinusCircle className="h-5 w-5 shrink-0" />}
              label="N/A"
              disabled={pending}
              onClick={() => setMode('na')}
            />
          )}
        </div>
      )}

      {/* Fail entry */}
      {mode === 'fail' && (
        <div className="mt-4 space-y-3">
          <label htmlFor={`note-${step.stepInstanceId}`} className="block text-sm font-semibold text-foreground">
            What is wrong?
          </label>
          <textarea
            id={`note-${step.stepInstanceId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. left rear tire flat"
            className="w-full resize-none rounded-xl bg-muted/60 p-3 text-base text-foreground outline-none ring-offset-2 placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
          <p className={`text-xs ${noteShort ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {noteShort
              ? copy.charactersLeft(minNoteLength - note.trim().length)
              : 'This is what the mechanic will read.'}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset the input so picking the SAME file again after a failed
              // upload still fires onChange.
              e.target.value = '';
              if (file) void onPhotoChosen(file);
            }}
          />

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photo.kind === 'uploading'}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80 disabled:opacity-60"
            >
              {photo.kind === 'uploading' ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : (
                <Camera className="h-5 w-5 shrink-0" />
              )}
              {photo.kind === 'uploading'
                ? 'Uploading photo…'
                : photo.kind === 'uploaded'
                  ? 'Photo uploaded — take another'
                  : step.requiresPhotoOnFail
                    ? 'Take a photo (required)'
                    : 'Take a photo'}
            </button>

            {photo.kind === 'uploaded' && (
              <div className="flex items-center gap-3 rounded-xl bg-green-50 p-2 dark:bg-green-950/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt="The photo you just uploaded"
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
                <p className="min-w-0 flex-1 text-sm font-medium text-green-800 dark:text-green-300">
                  Uploaded. It is saved even if you lose signal now.
                </p>
              </div>
            )}

            {photo.kind === 'error' && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {photo.message}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setNote('');
                setPhoto({ kind: 'none' });
              }}
              disabled={pending}
              className="min-h-[56px] flex-1 rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || noteShort || photoMissing || photo.kind === 'uploading'}
              onClick={() =>
                run('fail', () =>
                  answerInspectionFail(dispatchId, step.stepInstanceId, {
                    note: note.trim(),
                    photoKeys: photo.kind === 'uploaded' ? [photo.s3Key] : [],
                  }),
                )
              }
              className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {busyVerb === 'fail' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : null}
              Report fault
            </button>
          </div>
          {photoMissing && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This item needs a photo before you can report it.
            </p>
          )}
        </div>
      )}

      {/* N/A entry */}
      {mode === 'na' && (
        <div className="mt-4 space-y-3">
          <label htmlFor={`na-${step.stepInstanceId}`} className="block text-sm font-semibold text-foreground">
            Why does this not apply?
          </label>
          <input
            id={`na-${step.stepInstanceId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            placeholder="e.g. no trailer attached"
            className="min-h-[56px] w-full rounded-xl bg-muted/60 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
          <p className={`text-xs ${reasonShort ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {reasonShort ? copy.charactersLeft(minNoteLength - reason.trim().length) : 'Recorded against the trip.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setReason('');
              }}
              disabled={pending}
              className="min-h-[56px] flex-1 rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || reasonShort}
              onClick={() =>
                run('na', () =>
                  answerInspectionNotApplicable(dispatchId, step.stepInstanceId, reason.trim()),
                )
              }
              className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-700 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busyVerb === 'na' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : null}
              Not applicable
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export function InspectionRunner({
  view,
  onOutcome,
}: {
  view: InspectionChecklistView;
  /** Called with the gate verdict after a successful submit. */
  onOutcome: (gate: InspectionGateView) => void;
}) {
  const router = useRouter();
  const sections = view.sections;
  const [index, setIndex] = useState(0);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Progress counts ONLY steps this driver can answer (quick-543).
   *
   * A DISPATCHER-assigned step left NOT_STARTED would otherwise sit in the
   * denominator forever: the bar would stop one short of full, "1 item still
   * needs an answer" would never clear, and the driver would hunt for a step
   * they are not allowed to touch. The gate already ignores these — its
   * outcomes have always been INSPECTION_ITEM-only — so counting them here was
   * the screen disagreeing with the verdict it was about to receive.
   */
  const totals = useMemo(() => {
    const mine = sections.flatMap((s) => s.steps).filter((s) => s.answerableByDriver);
    const answered = mine.filter(
      (s) => s.status !== 'NOT_STARTED' && s.status !== 'IN_PROGRESS',
    ).length;
    return { total: mine.length, answered, remaining: mine.length - answered };
  }, [sections]);

  const section = sections[index];
  const sectionRemaining =
    section?.steps.filter(
      (s) => s.answerableByDriver && (s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS'),
    ).length ?? 0;

  const isLastSection = index >= sections.length - 1;

  if (signing) {
    return (
      <SignatureScreen
        view={view}
        remaining={totals.remaining}
        onBack={() => setSigning(false)}
        onOutcome={onOutcome}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Progress across the top — Section 12's "#####----- section 3 of 6" */}
      <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {copy.sectionProgress(index + 1, sections.length)}
            </p>
            <h1 className="truncate text-lg font-bold leading-tight text-foreground">
              {section?.title ?? 'Walkaround'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 shrink-0" />
            Save &amp; exit
          </button>
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totals.total}
          aria-valuenow={totals.answered}
          aria-label={copy.itemsAnswered(totals.answered, totals.total)}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: totals.total ? `${(totals.answered / totals.total) * 100}%` : '0%' }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {copy.itemsAnswered(totals.answered, totals.total)}
        </p>
      </header>

      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl bg-red-50 p-3 dark:bg-red-950/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-red-700 dark:text-red-300"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pb-4">
        <ul className="space-y-3">
          {section?.steps.map((step) => (
            <ItemCard
              key={step.stepInstanceId}
              dispatchId={view.dispatchId}
              step={step}
              minNoteLength={view.failNoteMinLength}
              onError={setError}
            />
          ))}
        </ul>

        {sectionRemaining > 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {copy.unansweredInSection(sectionRemaining)}
          </p>
        )}
      </main>

      {/*
        Back navigation is always live, on every section including the first,
        and it is never gated on the current screen being complete. Section 12
        requires the driver be able to review before signing, and a Back button
        that switches off is a Back button that is not there when it is needed.
      */}
      <footer className="sticky bottom-0 z-10 flex gap-2 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-muted px-5 text-base font-semibold text-foreground hover:bg-muted/80 disabled:opacity-30"
        >
          <ArrowLeft className="h-5 w-5 shrink-0" />
          Back
        </button>

        {isLastSection ? (
          <button
            type="button"
            onClick={() => setSigning(true)}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <PenLine className="h-5 w-5 shrink-0" />
            Review &amp; sign
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(sections.length - 1, i + 1))}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Next
            <ArrowRight className="h-5 w-5 shrink-0" />
          </button>
        )}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signature screen
// ---------------------------------------------------------------------------

function SignatureScreen({
  view,
  remaining,
  onBack,
  onOutcome,
}: {
  view: InspectionChecklistView;
  remaining: number;
  onBack: () => void;
  onOutcome: (gate: InspectionGateView) => void;
}) {
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(view.driverName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handleRef = useRef<SignaturePadHandle | null>(null);

  /**
   * Captured when the screen opens, not when the request completes.
   *
   * The timestamp beneath a signature is when the driver signed, not when the
   * network got round to it. It is an INSTANT — `@db.Timestamptz` semantics —
   * so `toLocaleString` is the correct rendering and the quick-541 date-only
   * helpers would be the inverse bug here.
   */
  const signedAt = useRef(new Date()).current;

  /**
   * The pre-signature summary mirrors what the GATE will count as a failure, so
   * the driver is not told one thing here and another on the next screen.
   *
   * That means filtering on `stepType === 'INSPECTION_ITEM'` — `buildSnapshot`'s
   * rule — and NOT on `answerableByDriver`. An INSPECTION_ITEM someone else
   * failed is still a defect on this trip and still reaches the verdict; hiding
   * it here would under-report the very thing the driver is signing beneath.
   */
  const failed = view.sections
    .flatMap((s) => s.steps)
    .filter((s) => s.stepType === 'INSPECTION_ITEM' && s.status === 'FAILED');
  /**
   * Ink is only required when the playbook HAS a signature step.
   *
   * Found while verifying quick-543 item 6: neither of the demo tenant's
   * inspections contains a SIGNATURE step, so `signature.required` is false and
   * `submit()` correctly skips the upload — but this button still demanded a
   * drawn mark, so the driver had to sign something that was then thrown away.
   * A gesture with no record behind it is theatre, and on a DVIR that is worse
   * than no gesture at all.
   */
  const signatureNeeded = view.signature.required;
  const canSign = remaining === 0 && (!signatureNeeded || hasInk) && name.trim().length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // 1. Rasterise.
      const blob = await handleRef.current?.toBlob();
      if (!blob) {
        setError('The signature came out empty. Sign again.');
        return;
      }

      // 2. Grant, then PUT. Only a 2xx counts.
      if (view.signature.required && view.signature.stepInstanceId) {
        const grant = await requestSignatureUpload(view.dispatchId, {
          contentType: 'image/png',
          sizeBytes: blob.size,
        });
        if (!grant.success) {
          setError(grant.error);
          return;
        }

        let put: Response;
        try {
          put = await fetch(grant.data.uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': 'image/png' },
          });
        } catch {
          setError('The signature did not upload. Check your signal and try again.');
          return;
        }
        if (!put.ok) {
          setError(`The signature did not upload (${put.status}). Try again.`);
          return;
        }

        // 3. Record it. Only now, and only with a key backed by real bytes.
        const signed = await signInspection(view.dispatchId, {
          stepInstanceId: view.signature.stepInstanceId,
          s3Key: grant.data.s3Key,
          signedByName: name.trim(),
          signedAt: signedAt.toISOString(),
        });
        if (!signed.success) {
          setError(signed.error);
          return;
        }
      }

      // 4. Submit the whole walkaround and take the verdict.
      const submitted = await submitInspectionChecklist(view.dispatchId);
      if (!submitted.success) {
        setError(submitted.error);
        return;
      }
      onOutcome(submitted.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to the checklist
        </button>
        <h1 className="mt-2 text-xl font-bold leading-tight text-foreground">Sign the inspection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.playbookName} · Unit {view.truckUnitNumber}
        </p>
      </header>

      <main className="flex-1 space-y-4 px-4 pb-4">
        {remaining > 0 && (
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/50">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              {copy.unansweredOverall(remaining)}
            </p>
          </div>
        )}

        {failed.length > 0 && (
          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              {copy.defectsLogged(failed.length)}
            </p>
            <ul className="mt-2 space-y-1">
              {failed.map((f) => (
                <li key={f.stepInstanceId} className="text-sm text-muted-foreground">
                  {f.name}
                  {f.isCritical ? ' · critical' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-card p-4 shadow-sm">
          {signatureNeeded ? (
            <SignaturePad
              onHandle={(h) => {
                handleRef.current = h;
              }}
              onInkChange={setHasInk}
              disabled={busy}
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              This checklist does not ask for a drawn signature. Your name and the time below are
              recorded against it.
            </p>
          )}

          {/* Name and timestamp printed beneath the mark — Section 12. */}
          <div className="mt-3 space-y-2">
            <label htmlFor="sig-name" className="block text-sm font-semibold text-foreground">
              Printed name
            </label>
            <input
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="min-h-[56px] w-full rounded-xl bg-muted/60 px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-sm text-muted-foreground">
              {signedAt.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 dark:bg-red-950/50">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 z-10 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSign}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <ShieldCheck className="h-5 w-5 shrink-0" />
          )}
          Sign and submit
        </button>
      </footer>
    </div>
  );
}
