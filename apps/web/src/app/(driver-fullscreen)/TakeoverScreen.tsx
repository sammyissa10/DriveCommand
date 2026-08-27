import { AlertTriangle, X } from 'lucide-react';

/**
 * The shell for `(driver-fullscreen)` — the group's layout, in one place.
 *
 * WHY IT EXISTS. `layout.tsx` next door owns the group's *frame*: the auth
 * guard, `min-h-dvh`, and the absence of chrome. It cannot own the group's
 * *page* layout, because a Next layout wraps children and cannot dictate the
 * shape of what it wraps. So every screen under it wrote its own, and the same
 * string — `flex min-h-dvh flex-col justify-between px-5 py-8` — was pasted at
 * five call sites across three files and appears nowhere else in the app
 * (quick-560). There was no component to fix, which is how it came to be
 * pasted. This file is that component.
 *
 * TWO ARRANGEMENTS, NOT ONE, AND NOT A VARIANT FLAG. The group really does have
 * two page shapes and they are not the same layout wearing a prop:
 *
 *   `TakeoverScreen` — a STATEMENT. An icon, a sentence, and the way out,
 *   with the actions pinned to the bottom of the viewport. Padding on the
 *   container; nothing sticky. Five call sites.
 *
 *   `TakeoverRunner` — a TASK. A sticky progress bar, a scrolling body, and a
 *   sticky action bar. The bars are full-bleed so their `backdrop-blur` band
 *   reaches the screen edges, so the padding lives inside each region rather
 *   than on the container. Two call sites, which were near-copies of the
 *   statement string with `justify-between` and the gutter dropped.
 *
 * Collapsing those two into one component with a `variant` would put a branch
 * where the difference is structural, and Phase 11's rule applies: prefer the
 * shape that leaves the wrong state unrepresentable over the flag that lets a
 * later edit ask for the wrong one. What they DO share is stated once, below,
 * and is what the paste kept getting wrong: the column width, the gutter, and
 * — the part that shipped a bug — where feedback goes.
 *
 * ── THE RULE THIS SHELL ENFORCES ─────────────────────────────────────────────
 *
 * TRANSIENT FEEDBACK RENDERS IN THE SAME REGION AS THE CONTROL THAT CAUSED IT,
 * IMMEDIATELY ABOVE IT, AND IT TRAVELS WITH IT.
 *
 * Not "near the top". Not "wherever the state lives". `feedback` is a prop on
 * both shells and both render it as the first child of the ACTION region —
 * inside the bottom block on a statement screen, inside the sticky footer on a
 * runner. A caller cannot put it somewhere else without leaving the shell.
 *
 * That is not a style preference; it is the fix for a shipped defect.
 * `InspectionClient.tsx` still carries the quick-546 note: this exact layout is
 * `min-h-dvh … justify-between`, so a banner rendered in the TOP block sits
 * roughly a screen-height from the button in the BOTTOM one. The feedback
 * existed, was off-screen, and the failure was reported and investigated as
 * "nothing happens". A sticky footer has the same trap in reverse — a banner in
 * the scrolling body scrolls away from a button that never moves.
 */

/**
 * The column every region is measured in.
 *
 * A handset takeover with no max width is still a takeover on a 1440px laptop,
 * where `px-5` leaves a single line of body copy a metre wide. `max-w-md` is
 * 448px, wider than any handset this runs on, so on the device it is written
 * for this constrains nothing and changes no measurement.
 */
export const TAKEOVER_COLUMN = 'mx-auto w-full max-w-md';

/**
 * A statement screen: something to read, and the way out.
 *
 * `justify-between` pins `actions` to the bottom of the viewport, which is
 * where a thumb already is. `top` and `actions` are the two regions; there is
 * no third, because a statement screen with three regions is a runner.
 *
 * `actions` is optional — a screen can be a dead end in the layout sense (the
 * blocked page's error frames render a message and inherit their way home from
 * the caller). With one child, `justify-between` has nothing to distribute and
 * the content sits at the top, which is the existing behaviour of those frames.
 */
export function TakeoverScreen({
  top,
  actions,
  feedback,
}: {
  top: React.ReactNode;
  /** Pinned to the bottom of the viewport. */
  actions?: React.ReactNode;
  /** Rendered immediately above `actions`. See the rule above. */
  feedback?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-between px-5 py-8">
      <div className={`${TAKEOVER_COLUMN} space-y-4`}>{top}</div>

      {actions && (
        // `mt-6` is invisible while there is free space to distribute — which is
        // the normal case — and is the gap that stops the two regions touching
        // when the top block is long enough to fill the viewport. The blocked
        // page was the only one of the five that had it; the other four met at
        // zero on a long screen.
        <div className={`${TAKEOVER_COLUMN} mt-6 space-y-3`}>
          {feedback}
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * A task screen: sticky progress, scrolling body, sticky action bar.
 *
 * The three regions are full-bleed and pad themselves, so the blurred bars
 * reach the screen edges while their contents stay in the same column as every
 * other screen in the group.
 */
export function TakeoverRunner({
  header,
  children,
  actions,
  feedback,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
  /** Rendered inside the sticky footer, immediately above `actions`. */
  feedback?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className={TAKEOVER_COLUMN}>{header}</div>
      </header>

      <main className="flex-1 px-4 pb-4">
        <div className={TAKEOVER_COLUMN}>{children}</div>
      </main>

      <footer className="sticky bottom-0 z-10 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className={`${TAKEOVER_COLUMN} space-y-2`}>
          {feedback}
          {actions}
        </div>
      </footer>
    </div>
  );
}

/**
 * The one red banner this group has.
 *
 * There were two shapes before — `rounded-2xl p-4` on the statement screens and
 * `rounded-xl p-3` with a dismiss on the runner — for no reason either file
 * gave. One shape, and the dismiss and the code are both optional, so a caller
 * asks for what it needs rather than restating the markup.
 *
 * `code` is quick-546's: a short thing the driver can read down a phone to
 * dispatch when the message itself is not actionable by them.
 */
export function TakeoverAlert({
  message,
  code,
  onDismiss,
}: {
  message: string;
  code?: string | null;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 dark:bg-red-950/50"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
        {code && (
          <p className="mt-1 font-mono text-xs text-red-600/70 dark:text-red-400/70">{code}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-red-700 dark:text-red-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
