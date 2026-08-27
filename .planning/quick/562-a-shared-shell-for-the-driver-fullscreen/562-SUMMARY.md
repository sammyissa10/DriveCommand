# quick-562 — SUMMARY

**Date:** 2026-08-27 · **Branch:** `feature/document-import`
**Commits:** `029a70a2` (shell + five screens), `902c5b63` (guard)
**Baseline:** `d0b47756` · **tsc:** 0 in both apps, **probed** · **Suite:** 127 → 128 files, 1560 → 1566 tests, zero regressions

---

## Step 1 — The five, quoted, and where they had drifted

`flex min-h-dvh flex-col justify-between px-5 py-8` — **five occurrences,
byte-identical, across THREE files**, confirmed with `cat -A`:

| # | File | Line | Screen |
|---|------|------|--------|
| 1 | `(driver-fullscreen)/inspection/[dispatchId]/page.tsx` | 194 | intro page's terminal `Shell` (not-yours / could-not-load / already-clear) |
| 2 | `…/InspectionClient.tsx` | 122 | `BeginScreen` — the intro |
| 3 | `…/InspectionClient.tsx` | 200 | `OutcomeScreen` — passed / passed-with-defects |
| 4 | `…/blocked/page.tsx` | 123 | the blocked screen |
| 5 | `…/blocked/page.tsx` | 217 | the blocked page's error `Frame` |

**The brief's "five files" is five call sites in three files, and the two screens
it names — the walkaround and the sign screen — are not among them.** They carry
a **near-copy**, which is the more interesting finding:

```
InspectionRunner.tsx:790   <div className="flex min-h-dvh flex-col">
InspectionRunner.tsx:1067  <div className="flex min-h-dvh flex-col">
```

`justify-between` and `px-5 py-8` dropped, because those two are sticky
header / scrolling body / sticky footer and the bars must be full-bleed for
their `backdrop-blur` band. Two layout families, not one.

Two further drifts inside the five:

- **#4** pairs `space-y-5` with `mt-6 space-y-3`; #1, #2, #3 pair `space-y-4`
  with a bare `space-y-3`. The `mt-6` is the careful one — it is what stops the
  two regions touching when the top block fills the viewport.
- **#5 is inert.** `Frame` took one `children` and rendered everything inside
  the top block, so `justify-between` had a single flex item and nothing to
  distribute. The way out sat under the sentence at the top of the screen while
  every other screen in the group put it at the bottom. **The string was copied;
  the shape it describes was not.**

---

## Step 2 — The sibling shell

`(driver)` does have one, and it is the **layout itself** —
`src/app/(driver)/layout.tsx`:

```tsx
return (
  <div className="min-h-screen bg-background">
    <header className="bg-slate-900 text-white border-b border-slate-800"> … </header>
    <DriverGpsPing variant="silent" />
    <main className="p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>
    <DriverBottomNav />
  </div>
);
```

A frame that owns chrome, the page gutter, and the bottom-nav clearance.
`(driver-fullscreen)/layout.tsx` is its sibling and already owns the equivalent
frame — the auth guard, `min-h-dvh`, and the deliberate absence of chrome. What
it **cannot** own is the shape of what it wraps: a Next layout wraps children
and cannot dictate their internal regions. That is the gap the paste filled, and
it is why the new shell is a **component beside `layout.tsx`**, not more classes
inside it.

---

## Step 3 — The feedback-distance survey (the part that matters)

| Screen | Control | Where feedback rendered | Verdict |
|---|---|---|---|
| intro `Shell` | `Try again` / `Back to my trips` (`Link`s) | n/a — the message **is** the screen | ✅ nothing to fix |
| **`BeginScreen`** | `Start the walkaround` | bottom block, immediately above the button | ✅ **already correct** — quick-546 fixed it here |
| **`OutcomeScreen`** | `Start trip` | **end of the TOP block**, after icon + heading + gate sentence + the whole defect list | ❌ **the quick-546 defect, unfixed one screen away** |
| blocked main | 3 × `Link` | none | ✅ |
| blocked `Frame` | `Check again` / home | none | ✅ (but the actions were mis-placed — see step 1) |
| **walkaround** | Pass / Fail / N-A **on any ItemCard** | between the sticky header and `<main>`, **not itself sticky** | ❌ **can leave the viewport entirely** |
| **sign screen** | `Sign and submit` (sticky footer) | last child of `<main>`, which **scrolls** | ❌ **can be painted underneath the footer** |
| ItemCard photo error | the camera button | directly beneath it | ✅ |

The walkaround is the worst of the three: the banner sits above a scrolling list
and does not stick, so a tap on the sixth item reports itself above the first.
`InspectionClient.tsx:137`'s quick-546 note describes exactly this class and had
never been generalised past the one screen it was written on.

---

## Step 4 — What the shell owns

`src/app/(driver-fullscreen)/TakeoverScreen.tsx`, a sibling of `layout.tsx`.
**One module, two arrangements, deliberately not one component with a `variant`
flag** — the two families differ structurally (padded container vs. full-bleed
sticky bars), and Phase 11's rule applies: prefer the shape that leaves the
wrong state unrepresentable over the flag that lets a later edit ask for it.

| | `TakeoverScreen` | `TakeoverRunner` |
|---|---|---|
| **Max width** | `TAKEOVER_COLUMN` = `mx-auto w-full max-w-md` (448px — wider than any handset, so **zero change at 390px**; it exists so a takeover on a 1440px laptop is not a metre-wide line of body copy) | same, inside **each** region so the blurred bars stay full-bleed |
| **Padding** | `px-5 py-8` on the container | `px-4` per region; footer `pb-[max(1rem,env(safe-area-inset-bottom))]` |
| **Top region** | `top`, `space-y-4` | `header`, sticky, `z-10`, `backdrop-blur` |
| **Middle** | — (a statement screen with three regions is a runner) | `children` in `<main className="flex-1">`, scrolls |
| **Bottom region** | `actions`, `mt-6 space-y-3`, pinned by `justify-between`; **optional** | `actions`, sticky footer |
| **Feedback** | **first child of the action region** | **first child of the sticky footer** |

`TakeoverAlert` replaces three hand-rolled banner shapes (`rounded-2xl p-4`,
`rounded-xl p-3` + dismiss, and a two-line variant with a `code`). Optional
`code` and `onDismiss`; `role="alert"` added.

The `mt-6` from screen #4 became universal. It is invisible whenever there is
free space to distribute, and is the gap that stops the regions touching when
there is not — so the careful one of the five won.

---

## Step 5 — The rule

> **Transient feedback renders in the same region as the control that caused it,
> immediately above it, and it travels with it.**

Not "near the top", not "wherever the state lives". It is enforced **by shape,
not by a check**: `feedback` is a prop, both shells render it as the first child
of the action region, and a screen cannot put it anywhere else without leaving
the shell.

| Screen | How it now satisfies the rule |
|---|---|
| intro `Shell` | No transient feedback; every control is a `Link`. The slot exists for the day one is added. |
| `BeginScreen` | `feedback={error && <TakeoverAlert message={error} code={errorCode} />}` — the quick-546 placement, now structural rather than a comment asking future edits to preserve it. |
| `OutcomeScreen` | Moved out of the top block into `feedback`. **This was the defect.** |
| blocked main | No transient feedback. `actions` holds the three `Link`s, pinned at the bottom as before. |
| blocked `Frame` | Split into `body` + `actions`; the way out now pins to the bottom like every sibling instead of sitting inert under the heading. |
| walkaround | `feedback` in the sticky footer, so it is on screen and adjacent to a control **whichever item was tapped**. Keeps its dismiss. |
| sign screen | `feedback` in the sticky footer, directly above `Sign and submit` at every scroll position. |

---

## Step 6 — Measured at 390×844

**Method, stated plainly.** Real Chromium (Playwright 1.58.2) at 390×844, real
`getBoundingClientRect`, CSS built by the repo's **own** `tailwind.config.ts`
over `globals.css`. It renders the **exact class structure** of each screen,
before and after — **it is not the live authenticated route.**
`/inspection/[dispatchId]` needs a DRIVER session cookie, a `Trip` row and a
`PlaybookInstance`, and this environment has no harness for that, so **all six
screens are source-and-layout claims, not live-route claims**, and the intro
page's terminal `Shell` and both blocked screens are **source-only** (no
transient feedback exists to measure). Layout is what changed, and layout is
what was measured.

Gap = empty space between the banner's edge and the control's edge, with the
control scrolled into view.

| Screen | | Gap | Centre-to-centre | On screen? |
|---|---|---|---|---|
| `BeginScreen` | before | 12px | 67px | yes |
| | **after** | **12px** | **67px** | **yes** — unchanged, it was already right |
| `OutcomeScreen` | before | **188px** | 252px | yes |
| | **after** | **12px** | **76px** | **yes** |
| walkaround, error vs. **the item button tapped** | before | **1028px** | 1078px | **NO — off screen by 356px** |
| | **after** | **44px** | **99px** | **yes** |
| walkaround, error vs. footer `Next` | before | **614px** | 664px | yes |
| | **after** | **8px** | **63px** | **yes** |
| sign screen, 3 faults | before | 93px | 148px | yes |
| | **after** | **8px** | **63px** | **yes** |

**The sign screen's real failure needed longer content to surface, and it is
worse than a distance.** With 8 faults and the unanswered-items banner (doc
height 969px), scrolled to the top — a driver re-reading what they are signing
under — the before banner rendered at viewport y **815–869**: straddling the
844px fold **and painted underneath the sticky footer**. `elementFromPoint` at
the banner's own centre returned `FOOTER.sticky bottom-0 z-10 bg-background/95`,
not the banner. The upload error was hidden by the very button it belonged to.
After: y **710–764**, `elementFromPoint` returns the banner's own `<p>`, 8px
clear of the button.

---

## Diff summary

```
 apps/web/src/app/(driver-fullscreen)/TakeoverScreen.tsx                  | +197  (new)
 apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx    |  +42 -30
 apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx | +140 -137
 apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx | +150 -140
 apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx     | +128 -94
 apps/web/src/__tests__/driver-fullscreen-shell.test.ts                   | +209  (new)
```

Untouched, as required: all copy, all validation, all gate logic, every server
action, `min-h-[56px]` and the two 44px header controls. No design system, no
component library, no token set. No DDL, no data change, no dependency added.

---

## Gates

- **tsc web:** 0 errors — **probed** (`const __probe: number = 'y'` in
  `TakeoverScreen.tsx` reported TS2322 at 191:7; removed; grep confirms 0
  occurrences left).
- **tsc mobile:** 0 errors — **probed** (TS2322 at `app/_layout.tsx:155`;
  restored). Mobile source untouched by this task.
- **Suite, warm, `apps/web`:** baseline **127 files / 1560 tests** passing at
  `d0b47756`; after **128 / 1566**. Exactly the six new cases. The 18 failed
  files / 66 failed tests are **identical before and after** — all pre-existing.
- **The guard was proven red**, not reasoned red: re-pasting the layout string
  into `InspectionClient.tsx` failed *both* 'lives in exactly one file' and the
  per-file 'renders its error through the shell' case, each naming the file.

**Lint was not run**: `next lint` no longer accepts `--dir` on this Next version
and there is no `eslint.config.js` for ESLint 9 in `apps/web`, so the repo has
no working lint entry point right now. Reported rather than worked around; tsc
is the gate this repo actually uses.

---

## Two things left open, deliberately

1. **Mobile's `TripInspectionScreen` has no equivalent shell**, and the same
   feedback-placement question exists there. It uses Toasts rather than inline
   banners, so it is not the same defect — but the two surfaces now differ in
   mechanism, which is worth a decision rather than a drift.
2. **`SIGNATURE_PAD_MISSING_ERROR` and friends still render through the shell's
   generic alert.** That is correct today; if per-error affordances (a retry
   button in the banner) are ever wanted, `TakeoverAlert` is where they go — not
   a second banner beside it.
